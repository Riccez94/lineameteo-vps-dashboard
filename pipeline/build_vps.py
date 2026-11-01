#!/usr/bin/env python3
"""Fetch public stratospheric model fields and publish original LineaMeteo plots."""
from __future__ import annotations

import datetime as dt
import json
import logging
import os
import re
import shutil
import tempfile
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import xarray as xr

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
MAPS = DATA / "maps"
MODELS = ("ecmwf_ifs", "ecmwf_ens", "aifs", "aifs_ens", "gfs", "gefs")
LEVELS = (10, 50)
ALL_LEVELS = (1000, 925, 850, 700, 500, 300, 200, 150, 100, 70, 50, 30, 10)
GFS_LEVELS = (1000, 925, 850, 700, 500, 300, 200, 150, 100, 70, 50, 30, 20, 15, 10, 7, 5, 3, 2, 1)
MAP_STEPS = (0, 48, 96, 144, 192, 240, 288, 336)
SERIES_STEPS = tuple(range(0, 361, 24))
LOG = logging.getLogger("vps")
CLIM: dict[str, xr.Dataset] = {}


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def latest_cycle(now: dt.datetime, hours: tuple[int, ...], delay: int = 8) -> dt.datetime:
    candidate = now - dt.timedelta(hours=delay)
    candidate = candidate.replace(minute=0, second=0, microsecond=0)
    candidate = candidate.replace(hour=max(h for h in hours if h <= candidate.hour),) if any(h <= candidate.hour for h in hours) else (candidate - dt.timedelta(days=1)).replace(hour=max(hours))
    return candidate


def open_grib(path: Path) -> xr.Dataset:
    return xr.open_dataset(path, engine="cfgrib", backend_kwargs={
        "indexpath": "", "filter_by_keys": {"typeOfLevel": "isobaricInhPa"},
        "errors": "raise",
    })


def coord(ds: xr.Dataset, names: tuple[str, ...]) -> str:
    for n in names:
        if n in ds.coords or n in ds.dims:
            return n
    raise KeyError(f"Coordinate not found: {names}")


def var_name(ds: xr.Dataset, candidates: tuple[str, ...]) -> str | None:
    return next((n for n in candidates if n in ds.data_vars), None)


def pressure(ds: xr.Dataset, level: int) -> xr.Dataset:
    lev = coord(ds, ("isobaricInhPa", "pressure_level", "level"))
    return ds.sel({lev: level})


def polar_cap(da: xr.DataArray) -> xr.DataArray:
    lat = coord(da.to_dataset(name="x"), ("latitude", "lat"))
    lon = coord(da.to_dataset(name="x"), ("longitude", "lon"))
    da = da.sortby(lat)
    # A 20–90N cap is enough for synoptic vortex structure while keeping map files light.
    return da.where(da[lat] >= 20, drop=True).sortby(lon)


def ensure_climatology() -> None:
    """Build a compact 1991–2020 monthly baseline from public NOAA PSL NCEP R1 data."""
    path = DATA / "climatology.npz"
    if not path.exists():
        DATA.mkdir(parents=True, exist_ok=True)
        base = "https://psl.noaa.gov/thredds/dodsC/Datasets/ncep.reanalysis/Monthlies/pressure/"
        sources = {key: base + f"{key}.mon.mean.nc" for key in ("air", "hgt", "uwnd")}
        raw = {key: xr.open_dataset(url, engine="pydap") for key, url in sources.items()}
        try:
            arrays = {}
            for key, ds in raw.items():
                name = key if key in ds.data_vars else next(iter(ds.data_vars))
                da = ds[name].sel(time=slice("1991-01-01", "2020-12-31"), level=list(ALL_LEVELS), lat=slice(90, 20)).load()
                arrays[key + "_mean"] = da.groupby("time.month").mean("time").values.astype("float32")
                arrays[key + "_std"] = da.groupby("time.month").std("time").values.astype("float32")
            first = raw["air"][next(iter(raw["air"].data_vars))].sel(time=slice("1991-01-01", "1991-01-31"), level=list(ALL_LEVELS), lat=slice(90, 20))
            arrays["levels"] = first.level.values
            arrays["lat"] = first.lat.values
            arrays["lon"] = first.lon.values
            np.savez_compressed(path, **arrays)
        finally:
            for ds in raw.values(): ds.close()
    z = np.load(path)
    coords = {"month": np.arange(1, 13), "level": z["levels"], "lat": z["lat"], "lon": z["lon"]}
    for key in ("air", "hgt", "uwnd"):
        CLIM[key] = xr.Dataset({"mean": (("month", "level", "lat", "lon"), z[key + "_mean"]),
                                "std": (("month", "level", "lat", "lon"), z[key + "_std"])}, coords=coords)
    LOG.info("Monthly 1991–2020 NCEP/NCAR pressure-level baseline ready")


def climatology_field(key: str, month: int, level: int, stat: str = "mean") -> xr.DataArray | None:
    ds = CLIM.get(key)
    if ds is None or level not in ds.level.values:
        return None
    return ds[stat].sel(month=month, level=level).rename({"lat": "latitude", "lon": "longitude"})


def climatology_cap(key: str, month: int, level: int, stat: str = "mean") -> float | None:
    base = climatology_field(key, month, level, stat)
    if base is None: return None
    band = base.where((base.latitude >= 55) & (base.latitude <= 65), drop=True)
    weights = np.cos(np.deg2rad(band.latitude))
    return float(band.weighted(weights).mean(("latitude", "longitude")).item())


def interp_climatology(base: xr.DataArray, target: xr.DataArray, lat: str, lon: str) -> np.ndarray:
    base = base.assign_coords(longitude=((base.longitude + 180) % 360) - 180).sortby("longitude")
    left = base.isel(longitude=-1).expand_dims(longitude=[float(base.longitude.values[-1] - 360)])
    right = base.isel(longitude=0).expand_dims(longitude=[float(base.longitude.values[0] + 360)])
    cyclic = xr.concat([left, base, right], dim="longitude").sortby("longitude")
    wrapped_lon = ((target[lon] + 180) % 360) - 180
    return cyclic.interp(latitude=target[lat], longitude=wrapped_lon, kwargs={"fill_value": "extrapolate"}).values


def u60(da: xr.DataArray) -> float:
    lat = coord(da.to_dataset(name="x"), ("latitude", "lat"))
    lon = coord(da.to_dataset(name="x"), ("longitude", "lon"))
    band = da.where((da[lat] >= 55) & (da[lat] <= 65), drop=True)
    weights = np.cos(np.deg2rad(band[lat]))
    return float(band.weighted(weights).mean((lat, lon)).compute().item())


def cap_mean(da: xr.DataArray) -> float:
    lat = coord(da.to_dataset(name="x"), ("latitude", "lat"))
    lon = coord(da.to_dataset(name="x"), ("longitude", "lon"))
    band = da.where((da[lat] >= 55) & (da[lat] <= 65), drop=True)
    weights = np.cos(np.deg2rad(band[lat]))
    return float(band.weighted(weights).mean((lat, lon)).compute().item())


def heat_flux(v: xr.DataArray, t: xr.DataArray) -> float:
    lat = coord(v.to_dataset(name="x"), ("latitude", "lat"))
    lon = coord(v.to_dataset(name="x"), ("longitude", "lon"))
    v, t = xr.align(v, t)
    band = (v.where((v[lat] >= 45) & (v[lat] <= 75), drop=True),
            t.where((t[lat] >= 45) & (t[lat] <= 75), drop=True))
    vp = band[0] - band[0].mean(lon)
    tp = band[1] - band[1].mean(lon)
    product = vp * tp
    weights = np.cos(np.deg2rad(product[lat]))
    return float(product.weighted(weights).mean((lat, lon)).compute().item())


def draw_map(ds: xr.Dataset, model: str, init: str, step: int, level: int, field: str) -> str | None:
    zname = var_name(ds, ("gh", "z", "hgt"))
    tname = var_name(ds, ("t", "tmp"))
    uname = var_name(ds, ("u", "u_grd"))
    if zname is None and field != "wind":
        return None
    if field == "temp" and tname is None:
        return None
    if field == "wind" and uname is None:
        return None
    chosen = {"vortex": zname, "height": zname, "temp": tname, "wind": uname}[field]
    assert chosen
    da = polar_cap(pressure(ds, level)[chosen]).squeeze()
    lat = coord(da.to_dataset(name="x"), ("latitude", "lat"))
    lon = coord(da.to_dataset(name="x"), ("longitude", "lon"))
    lonv, latv = np.meshgrid(da[lon].values, da[lat].values)
    values = da.values
    valid = dt.datetime.fromisoformat(init.replace("Z", "+00:00")) + dt.timedelta(hours=step)
    if field in ("vortex", "height") and zname in ("z", "gh"):
        # ECMWF geopotential is m² s⁻²; convert to geopotential metres where needed.
        units = str(da.attrs.get("units", ""))
        if units in ("m**2 s**-2", "m^2 s^-2") or (zname == "z" and np.nanmedian(np.abs(values)) > 10000):
            values = values / 9.80665
    if field in ("temp", "height"):
        base = climatology_field("air" if field == "temp" else "hgt", valid.month, level)
        if base is None:
            LOG.warning("1991–2020 climatology unavailable: %s at %s hPa", field, level)
            return None
        values = values - interp_climatology(base, da, lat, lon)
    MAPS.mkdir(parents=True, exist_ok=True)
    out = MAPS / f"{model}_{level}hpa_{field}_{step:03d}.png"
    fig = plt.figure(figsize=(9.3, 7.6), dpi=135, facecolor="white")
    try:
        import cartopy.crs as ccrs
        import cartopy.feature as cfeature
        ax = fig.add_subplot(1, 1, 1, projection=ccrs.NorthPolarStereo())
        ax.set_extent([-180, 180, 20, 90], ccrs.PlateCarree())
        ax.add_feature(cfeature.COASTLINE.with_scale("110m"), linewidth=.55, edgecolor="#3f5565")
        ax.add_feature(cfeature.BORDERS.with_scale("110m"), linewidth=.25, edgecolor="#8998a3")
        gl = ax.gridlines(crs=ccrs.PlateCarree(), linewidth=.35, color="#9aabb8", alpha=.5, linestyle="--")
        gl.xlabel_style = {"size": 7}; gl.ylabel_style = {"size": 7}
        if field == "temp":
            cf = ax.contourf(lonv, latv, values, levels=np.arange(-30, 31, 3), cmap="RdBu_r", extend="both", transform=ccrs.PlateCarree())
            fig.colorbar(cf, ax=ax, orientation="horizontal", pad=.045, shrink=.8, label="Anomalia T (K) · NCEP/NCAR 1991–2020")
        elif field == "wind":
            cf = ax.contourf(lonv, latv, values, levels=np.arange(-60, 66, 6), cmap="RdBu_r", extend="both", transform=ccrs.PlateCarree())
            fig.colorbar(cf, ax=ax, orientation="horizontal", pad=.045, shrink=.8, label="Vento zonale u (m/s)")
        elif field == "vortex":
            lo = float(np.nanpercentile(values, 5)); hi = float(np.nanpercentile(values, 95))
            cf = ax.contourf(lonv, latv, values, levels=np.linspace(lo, hi, 19), cmap="Spectral_r", extend="both", transform=ccrs.PlateCarree())
            fig.colorbar(cf, ax=ax, orientation="horizontal", pad=.045, shrink=.8, label="Geopotenziale assoluto (m)")
            ax.contour(lonv, latv, values, colors="#263a4a", linewidths=.55, levels=14, transform=ccrs.PlateCarree())
        else:
            cf = ax.contourf(lonv, latv, values, levels=np.arange(-1200, 1201, 100), cmap="RdBu_r", extend="both", transform=ccrs.PlateCarree())
            fig.colorbar(cf, ax=ax, orientation="horizontal", pad=.045, shrink=.8, label="Anomalia Z (m) · NCEP/NCAR 1991–2020")
            ax.contour(lonv, latv, values, colors="#263a4a", linewidths=.55, levels=14, transform=ccrs.PlateCarree())
        ax.set_title(f"LineaMeteo · {model.replace('_', ' ').upper()} · {level} hPa · {field.upper()}\nRun {init} · validità {valid:%Y-%m-%d %H} UTC · +{step} h", loc="left", fontsize=11, fontweight="bold", pad=11)
        baseline = "baseline anomalia: NOAA PSL NCEP/NCAR Reanalysis 1, 1991–2020" if field in ("temp", "height") else "campo del modello"
        fig.text(.08, .015, f"Modello: run in testata · {baseline} · plot LineaMeteo", fontsize=7, color="#52697a")
        fig.savefig(out, bbox_inches="tight", facecolor="white")
    finally:
        plt.close(fig)
    public_base = os.getenv("VPS_MAP_BASE_URL", "").rstrip("/")
    object_key = "maps/" + out.name
    return (public_base + "/" + object_key) if public_base else ("/data/" + out.relative_to(DATA).as_posix())


def save_model_step(ds: xr.Dataset, model: str, init: str, step: int, out: dict, levels: tuple[int, ...] = ALL_LEVELS) -> None:
    stamp = (dt.datetime.fromisoformat(init.replace("Z", "+00:00")) + dt.timedelta(hours=step)).isoformat()
    valid = dt.datetime.fromisoformat(init.replace("Z", "+00:00")) + dt.timedelta(hours=step)
    model_data = out["models"].setdefault(model, {"init": init, "source": model, "series": [], "maps": {}})
    rec = {"valid": stamp, "leadHours": step}
    u_name, v_name, t_name = (var_name(ds, c) for c in (("u", "u_grd"), ("v", "v_grd"), ("t", "tmp")))
    z_name = var_name(ds, ("gh", "z", "hgt"))
    for level in levels:
        try:
            levds = pressure(ds, level)
            if u_name:
                current = u60(levds[u_name]); rec[f"u{level}"] = current
                normal = climatology_cap("uwnd", valid.month, level); sd = climatology_cap("uwnd", valid.month, level, "std")
                if normal is not None: rec[f"u{level}anom"] = current - normal
                if sd not in (None, 0): rec[f"u{level}sigma"] = (current - normal) / sd
            if t_name:
                current = cap_mean(levds[t_name]); rec[f"t{level}"] = current - 273.15
                normal = climatology_cap("air", valid.month, level); sd = climatology_cap("air", valid.month, level, "std")
                if normal is not None: rec[f"t{level}anom"] = current - normal
                if sd not in (None, 0): rec[f"t{level}sigma"] = (current - normal) / sd
            if z_name:
                z = cap_mean(levds[z_name])
                z = z / 9.80665 if z_name in ("z", "gh") else z
                rec[f"z{level}"] = z
                normal = climatology_cap("hgt", valid.month, level); sd = climatology_cap("hgt", valid.month, level, "std")
                if normal is not None: rec[f"z{level}anom"] = z - normal
                if sd not in (None, 0): rec[f"z{level}sigma"] = (z - normal) / sd
            if level == 100 and v_name and t_name: rec["heatFlux100"] = heat_flux(levds[v_name], levds[t_name])
        except Exception as e:
            LOG.warning("%s %shPa metric unavailable at +%sh: %s", model, level, step, e)
    if rec.get("u10") is not None:
        model_data["series"].append(rec)
    if step in MAP_STEPS:
        for level in LEVELS:
            for field in ("vortex", "temp", "height", "wind"):
                try:
                    link = draw_map(ds, model, init, step, level, field)
                    if link: model_data["maps"].setdefault(str(level), {}).setdefault(str(step), {})[field] = link
                except Exception as e:
                    LOG.warning("Map %s %s %s +%s unavailable: %s", model, level, field, step, e)


def fetch_ecmwf(model_key: str, model: str, stream: str, typ: str, init: dt.datetime, out: dict) -> None:
    from ecmwf.opendata import Client
    client = Client(source="ecmwf", model=model, resol="0p25")
    init_iso = init.strftime("%Y-%m-%dT%H:%MZ")
    out["models"][model_key] = {"init": init_iso, "source": model_key, "series": [], "maps": {}}
    LOG.info("ECMWF %s run %s", model_key, init_iso)
    steps = sorted(set(SERIES_STEPS) | set(MAP_STEPS))
    with tempfile.TemporaryDirectory(prefix="lm-vps-") as tmp:
        for step in steps:
            path = Path(tmp) / f"{model_key}_{step:03d}.grib2"
            try:
                client.retrieve(date=init.strftime("%Y%m%d"), time=int(init.strftime("%H")), stream=stream, type=typ,
                                step=step, param=["u", "v", "t", "z"], levelist=list(ALL_LEVELS), target=str(path))
                ds = open_grib(path)
                try: save_model_step(ds, model_key, init_iso, step, out)
                finally: ds.close()
            except Exception as e:
                LOG.warning("ECMWF %s +%sh skipped: %s", model_key, step, e)
    if model_key == "aifs_ens":
        fetch_aifs_ensemble_odds(init, out)


def fetch_noaa(model_key: str, noaa_model: str, product: str, member: str | None, init: dt.datetime, out: dict) -> None:
    from herbie import Herbie
    init_iso = init.strftime("%Y-%m-%dT%H:%MZ")
    levels = GFS_LEVELS if model_key == "gfs" else ALL_LEVELS
    out["models"][model_key] = {"init": init_iso, "source": model_key, "series": [], "maps": {}}
    LOG.info("NOAA %s run %s", model_key, init_iso)
    steps = sorted(set(SERIES_STEPS) | set(MAP_STEPS))
    for step in steps:
        try:
            kwargs = {"member": member} if member else {}
            h = Herbie(init, model=noaa_model, product=product, fxx=step, save_dir=str(DATA / ".grib-cache"), **kwargs)
            levexpr = "1000|925|850|700|500|300|200|150|100|70|50|30|20|15|10|7|5|3|2|1" if model_key == "gfs" else "1000|925|850|700|500|300|200|150|100|70|50|30|10"
            path = h.download(searchString=":(UGRD|VGRD|TMP|HGT):(?:" + levexpr + ") mb:", verbose=False)
            if path is None: raise RuntimeError("NOAA/Herbie non ha restituito un sottoinsieme GRIB")
            ds = open_grib(Path(path))
            try: save_model_step(ds, model_key, init_iso, step, out, levels)
            finally: ds.close()
        except Exception as e:
            LOG.warning("NOAA %s +%sh skipped: %s", model_key, step, e)
    if model_key == "gefs":
        fetch_gefs_raw_odds(init, out)


def fetch_gefs_raw_odds(init: dt.datetime, out: dict) -> None:
    """Sample 30 GEFS members at days 7, 10, 12 and 14 for raw U60 reversal shares."""
    from herbie import Herbie
    init_iso = init.strftime("%Y-%m-%dT%H:%MZ")
    leads = (168, 240, 288, 336)
    member_paths: dict[str, dict[int, float]] = {}
    with tempfile.TemporaryDirectory(prefix="lm-gefs-members-") as tmp:
        for member in range(1, 31):
            key = f"p{member:02d}"
            member_paths[key] = {}
            for lead in leads:
                try:
                    h = Herbie(init, model="gefs", product="atmos.5", member=key, fxx=lead,
                               save_dir=tmp, verbose=False)
                    path = h.download(searchString=":UGRD:10 mb:", verbose=False)
                    if path is None: continue
                    ds = open_grib(Path(path))
                    try:
                        uname = var_name(ds, ("u", "u_grd"))
                        if uname: member_paths[key][lead] = u60(pressure(ds, 10)[uname])
                    finally: ds.close()
                except Exception as e:
                    LOG.warning("GEFS %s +%sh member unavailable: %s", key, lead, e)
    rows = []
    for lead in leads:
        exact = [v[lead] for v in member_paths.values() if lead in v]
        window = [min(v[t] for t in leads if t in v) for v in member_paths.values() if any(t in v for t in leads if t <= lead)]
        rows.append({"leadHours": lead, "members": len(exact), "membersBelowZero": sum(v < 0 for v in exact),
                     "rawShare": sum(v < 0 for v in exact) / len(exact) if exact else None,
                     "windowMembers": len(window), "windowBelowZero": sum(v < 0 for v in window),
                     "windowRawShare": sum(v < 0 for v in window) / len(window) if window else None})
    out.setdefault("probabilities", {})["gefs"] = {"source": "NOAA GEFS", "run": init_iso, "sampledLeadsHours": list(leads),
                                                     "method": "quota grezza membri con U60<0 ai lead campionati; non probabilità calibrata", "rows": rows}


def fetch_aifs_ensemble_odds(init: dt.datetime, out: dict) -> None:
    """Use the open AIFS-ENS perturbed members at the standard stratospheric wind index."""
    from ecmwf.opendata import Client
    model = Client(source="ecmwf", model="aifs-ens", resol="0p25")
    leads = (168, 240, 288, 336)
    path = DATA / ".aifs-ens-u10.grib2"
    try:
        model.retrieve(date=init.strftime("%Y%m%d"), time=int(init.strftime("%H")), stream="enfo", type="pf",
                       step=list(leads), param="u", levelist=10, number=list(range(1, 51)), target=str(path))
        ds = open_grib(path)
        try:
            uname = var_name(ds, ("u", "u_grd"))
            if not uname: raise RuntimeError("campo U non trovato")
            rows = []
            for lead in leads:
                vals = []
                for member in range(1, 51):
                    try: vals.append(u60(ds[uname].sel(step=np.timedelta64(lead, "h"), number=member)))
                    except Exception: pass
                rows.append({"leadHours": lead, "members": len(vals), "membersBelowZero": sum(v < 0 for v in vals),
                             "rawShare": sum(v < 0 for v in vals) / len(vals) if vals else None})
            out.setdefault("probabilities", {})["aifs_ens"] = {"source": "ECMWF AIFS ENS", "run": init.strftime("%Y-%m-%dT%H:%MZ"),
                                                                    "sampledLeadsHours": list(leads),
                                                                    "method": "quota grezza membri con U60<0 ai lead campionati; non probabilità calibrata", "rows": rows}
        finally: ds.close()
    except Exception as e:
        LOG.warning("AIFS ensemble member odds unavailable: %s", e)
    finally:
        path.unlink(missing_ok=True)


def merge_archive(out: dict) -> None:
    history_path = DATA / "history.json"
    try: history = json.loads(history_path.read_text("utf-8")) if history_path.exists() else {"runs": {}}
    except Exception: history = {"runs": {}}
    archive = history.setdefault("runs", {})
    for model, payload in out["models"].items():
        runs = archive.setdefault(model, {})
        runs[payload["init"]] = [{"valid": p.get("valid"), "leadHours": p.get("leadHours"), "u10": p.get("u10")}
                                  for p in payload["series"] if p.get("u10") is not None]
        archive[model] = dict(sorted(runs.items())[-720:])
    analyses = history.setdefault("analyses", {})
    current_analysis = out["models"].get("ecmwf_ifs", {}).get("series", [])
    for p in current_analysis:
        if int(p.get("leadHours", -1)) == 0 and p.get("u10") is not None:
            analyses[p["valid"]] = float(p["u10"])
    cutoff = (utcnow() - dt.timedelta(days=190)).isoformat()
    history["analyses"] = {k: v for k, v in sorted(analyses.items()) if k >= cutoff}
    history["updated"] = out["generatedAt"]
    history_path.write_text(json.dumps(history, ensure_ascii=False, separators=(",", ":")), "utf-8")
    out["archive"] = history.get("runs", {})
    out["analysis"] = history.get("analyses", {})


def build_verification(out: dict) -> dict:
    history_path = DATA / "history.json"
    history = json.loads(history_path.read_text("utf-8")) if history_path.exists() else {"runs": {}}
    obs = history.get("analyses", {})
    scores = {}
    for model, runs in history.get("runs", {}).items():
        errors = {"30d": [], "season": []}
        samples = {"30d": [], "season": []}
        for init, points in runs.items():
            for p in points:
                actual = obs.get(p.get("valid"))
                pred = p.get("u10")
                if actual is not None and pred is not None and int(p.get("leadHours", 0)) > 0:
                    err = float(pred) - float(actual)
                    errors["season"].append(err)
                    sample = {"init": init, "valid": p["valid"], "leadHours": int(p.get("leadHours", 0)), "forecast": float(pred), "analysis": float(actual)}
                    samples["season"].append(sample)
                    if dt.datetime.fromisoformat(p["valid"]) >= utcnow() - dt.timedelta(days=30):
                        errors["30d"].append(err)
                        samples["30d"].append(sample)
        if any(errors.values()):
            scores[model] = {}
            for period, values in errors.items():
                if not values: continue
                a = np.asarray(values)
                scores[model][period] = {"n": len(values), "biasMs": float(a.mean()), "maeMs": float(np.abs(a).mean()), "rmseMs": float(np.sqrt(np.mean(a*a))), "verification": "contro analisi operativa IFS", "samples": samples[period]}
    return scores


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    DATA.mkdir(parents=True, exist_ok=True)
    ensure_climatology()
    out = {"schema": 1, "generatedAt": utcnow().isoformat(), "models": {}, "sources": {}, "verification": {}, "probabilities": {}}
    old_path = DATA / "dashboard.json"
    if old_path.exists():
        try:
            previous = json.loads(old_path.read_text("utf-8"))
            out["models"] = previous.get("models", {})
            out["sources"] = previous.get("sources", {})
            out["probabilities"] = previous.get("probabilities", {})
        except Exception:
            LOG.warning("Previous dashboard state could not be loaded")
    now = utcnow()
    cycle_ifs = latest_cycle(now, (0, 12), 8)
    cycle_aifs = latest_cycle(now, (0, 6, 12, 18), 7)
    cycle_noaa = latest_cycle(now, (0, 6, 12, 18), 5)
    jobs = [
        ("ecmwf_ifs", lambda: fetch_ecmwf("ecmwf_ifs", "ifs", "oper", "fc", cycle_ifs, out)),
        ("ecmwf_ens", lambda: fetch_ecmwf("ecmwf_ens", "ifs", "enfo", "em", cycle_ifs, out)),
        ("aifs", lambda: fetch_ecmwf("aifs", "aifs-single", "oper", "fc", cycle_aifs, out)),
        ("aifs_ens", lambda: fetch_ecmwf("aifs_ens", "aifs-ens", "enfo", "em", cycle_ifs, out)),
        ("gfs", lambda: fetch_noaa("gfs", "gfs", "pgrb2.0p25", None, cycle_noaa, out)),
        ("gefs", lambda: fetch_noaa("gefs", "gefs", "atmos.5", "mean", cycle_noaa, out)),
    ]
    expected = {"ecmwf_ifs": cycle_ifs, "ecmwf_ens": cycle_ifs, "aifs": cycle_aifs, "aifs_ens": cycle_ifs, "gfs": cycle_noaa, "gefs": cycle_noaa}
    for model, task in jobs:
        try:
            expected_iso = expected[model].strftime("%Y-%m-%dT%H:%MZ")
            if out["models"].get(model, {}).get("init") == expected_iso and out["models"].get(model, {}).get("series"):
                LOG.info("Keeping existing %s run %s", model, expected_iso)
                continue
            previous_model = out["models"].get(model)
            task()
            if not out["models"].get(model, {}).get("series") and previous_model:
                LOG.warning("New %s run unavailable; keeping previous run %s", model, previous_model.get("init"))
                out["models"][model] = previous_model
            out["sources"][model] = {"available": bool(out["models"].get(model, {}).get("series")), "init": out["models"].get(model, {}).get("init"), "attribution": "ECMWF Open Data" if model.startswith(("ecmwf", "aifs")) else "NOAA/NCEP public model data"}
        except Exception as e:
            LOG.exception("Model job failed: %s", model)
            if 'previous_model' in locals() and previous_model:
                out["models"][model] = previous_model
            out["sources"][model] = {"available": False, "error": str(e)}
    merge_archive(out)
    out["verification"] = build_verification(out)
    (DATA / "dashboard.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")
    cache = DATA / ".grib-cache"
    if cache.exists(): shutil.rmtree(cache, ignore_errors=True)
    LOG.info("Dashboard built: %s models available", sum(x.get("available", False) for x in out["sources"].values()))


if __name__ == "__main__":
    main()
