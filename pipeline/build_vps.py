#!/usr/bin/env python3
"""Fetch public stratospheric model fields and publish original LineaMeteo plots."""
from __future__ import annotations

import datetime as dt
import copy
import json
import logging
import os
import re
import shutil
import tempfile
import time
from pathlib import Path
from urllib.parse import urlsplit

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
METRIC_VERSION = "u60-10hpa-60n-zonalmean-v2"
DATA_SCHEMA = 3
LOG = logging.getLogger("vps")
CLIM: dict[str, xr.Dataset] = {}
CLIM_CAP: dict[str, dict[str, np.ndarray]] = {}


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def latest_cycle(now: dt.datetime, hours: tuple[int, ...], delay: int = 8) -> dt.datetime:
    candidate = now - dt.timedelta(hours=delay)
    candidate = candidate.replace(minute=0, second=0, microsecond=0)
    candidate = candidate.replace(hour=max(h for h in hours if h <= candidate.hour),) if any(h <= candidate.hour for h in hours) else (candidate - dt.timedelta(days=1)).replace(hour=max(hours))
    return candidate


def herbie_init(init: dt.datetime) -> dt.datetime:
    """Herbie expects a naive datetime; all pipeline cycle times are UTC."""
    return init.astimezone(dt.timezone.utc).replace(tzinfo=None) if init.tzinfo else init


def map_assets_present(model_data: dict) -> bool:
    """Require every advertised map field, level and lead before reusing a run."""
    maps = model_data.get("maps", {})
    if not maps:
        return False
    expected_fields = {"vortex", "wind", "temp", "height"}
    expected_steps = {str(step) for step in MAP_STEPS}
    for level in LEVELS:
        steps = maps.get(str(level), {})
        if not expected_steps.issubset(steps):
            return False
        if any(not expected_fields.issubset(steps[step]) for step in expected_steps):
            return False
    urls = [url for levels in model_data.get("maps", {}).values()
            for steps in levels.values() for url in steps.values() if isinstance(url, str)]
    return bool(urls) and all((MAPS / Path(urlsplit(url).path).name).is_file() for url in urls)


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
    # GRIB/xarray coordinates can contain floating pressure values (for example
    # 9.999999 instead of 10); select the nearest level only within 1%.
    return ds.sel({lev: level}, method="nearest", tolerance=max(0.05, level * 0.01))


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
        arrays = {}
        coords = None
        for key, url in sources.items():
            ds = xr.open_dataset(url, engine="pydap")
            try:
                name = key if key in ds.data_vars else next(iter(ds.data_vars))
                monthly_fields = [[] for _ in range(12)]
                monthly_indices = [[] for _ in range(12)]
                for start_year in range(1991, 2021, 5):
                    end_year = min(start_year + 4, 2020)
                    # Five-year requests keep NOAA's OPeNDAP response small;
                    # a single 30-year transfer was repeatedly cut off.
                    for attempt in range(4):
                        try:
                            chunk = ds[name].sel(
                                time=slice(f"{start_year}-01-01", f"{end_year}-12-31"),
                                level=list(ALL_LEVELS), lat=slice(90, 20),
                            ).sortby("lat").load()
                            break
                        except Exception:
                            if attempt == 3:
                                raise
                            LOG.warning("NOAA climatology download failed for %s %d–%d (attempt %d/4); reconnecting",
                                        key, start_year, end_year, attempt + 1, exc_info=True)
                            ds.close()
                            time.sleep(2 ** attempt)
                            ds = xr.open_dataset(url, engine="pydap")
                            name = key if key in ds.data_vars else next(iter(ds.data_vars))
                    if coords is None and key == "air":
                        coords = {"levels": chunk.level.values, "lat": chunk.lat.values, "lon": chunk.lon.values}
                    for month in range(1, 13):
                        field = chunk.where(chunk.time.dt.month == month, drop=True)
                        if field.sizes.get("time", 0) == 0:
                            continue
                        monthly_fields[month - 1].append(field.values.astype("float32"))
                        if key == "uwnd":
                            regional = field.interp(lat=60).mean("lon")
                        else:
                            band = field.where((field.lat >= 55) & (field.lat <= 65), drop=True)
                            regional = band.weighted(np.cos(np.deg2rad(band.lat))).mean(("lat", "lon"))
                        monthly_indices[month - 1].append(regional.values.astype("float32"))
                    chunk.close()
                samples = [np.concatenate(month, axis=0) for month in monthly_fields]
                indices = [np.concatenate(month, axis=0) for month in monthly_indices]
                arrays[key + "_mean"] = np.stack([sample.mean(axis=0) for sample in samples]).astype("float32")
                arrays[key + "_std"] = np.stack([sample.std(axis=0) for sample in samples]).astype("float32")
                arrays[key + "_index_mean"] = np.stack([sample.mean(axis=0) for sample in indices]).astype("float32")
                arrays[key + "_index_std"] = np.stack([sample.std(axis=0) for sample in indices]).astype("float32")
            finally:
                ds.close()
        arrays.update(coords or {})
        np.savez_compressed(path, **arrays)
    z = np.load(path)
    coords = {"month": np.arange(1, 13), "level": z["levels"], "lat": z["lat"], "lon": z["lon"]}
    for key in ("air", "hgt", "uwnd"):
        CLIM[key] = xr.Dataset({"mean": (("month", "level", "lat", "lon"), z[key + "_mean"]),
                                "std": (("month", "level", "lat", "lon"), z[key + "_std"])}, coords=coords)
        CLIM_CAP[key] = {"mean": z[key + "_index_mean"], "std": z[key + "_index_std"]}
    LOG.info("Monthly 1991–2020 NCEP/NCAR pressure-level baseline ready")


def climatology_field(key: str, month: int, level: int, stat: str = "mean") -> xr.DataArray | None:
    ds = CLIM.get(key)
    if ds is None or level not in ds.level.values:
        return None
    return ds[stat].sel(month=month, level=level).rename({"lat": "latitude", "lon": "longitude"})


def climatology_cap(key: str, month: int, level: int, stat: str = "mean") -> float | None:
    regional = CLIM_CAP.get(key)
    if regional is None or level not in ALL_LEVELS:
        return None
    return float(regional[stat][month - 1, ALL_LEVELS.index(level)])


def interp_climatology(base: xr.DataArray, target: xr.DataArray, lat: str, lon: str) -> np.ndarray:
    base = base.assign_coords(longitude=((base.longitude + 180) % 360) - 180).sortby("longitude")
    left = base.isel(longitude=-1).expand_dims(longitude=[float(base.longitude.values[-1] - 360)])
    right = base.isel(longitude=0).expand_dims(longitude=[float(base.longitude.values[0] + 360)])
    cyclic = xr.concat([left, base, right], dim="longitude").sortby("longitude")
    wrapped_lon = ((target[lon] + 180) % 360) - 180
    interpolated = cyclic.interp(latitude=target[lat], longitude=wrapped_lon, kwargs={"fill_value": "extrapolate"})
    # GRIB fields may store horizontal dimensions in either order. Keep all
    # plotted arrays in the explicit (latitude, longitude) order.
    return interpolated.transpose(lat, lon).values


def u60(da: xr.DataArray) -> float:
    lat = coord(da.to_dataset(name="x"), ("latitude", "lat"))
    lon = coord(da.to_dataset(name="x"), ("longitude", "lon"))
    # The headline metric is the zonal mean at exactly 60°N, matching the
    # standard stratospheric-vortex index rather than a broad latitude band.
    at_60n = da.sortby(lat).interp({lat: 60})
    return float(at_60n.mean(lon).compute().item())


def geopotential_height(da: xr.DataArray, name: str) -> xr.DataArray:
    """Convert geopotential (m²/s²) to height (m); leave height fields in metres."""
    units = str(da.attrs.get("units", "")).lower().replace("^", "**").replace(" ", "")
    is_geopotential = "m**2s**-2" in units or "m**2/s**2" in units or "m2s-2" in units
    if not units and name == "z":
        is_geopotential = float(abs(da).median().compute()) > 10000
    return da / 9.80665 if is_geopotential else da


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
    if field in ("vortex", "height") and zname is None:
        return None
    if field in ("vortex", "temp") and tname is None:
        return None
    if field == "wind" and uname is None:
        return None
    chosen = {"vortex": tname, "height": zname, "temp": tname, "wind": uname}[field]
    assert chosen
    da = polar_cap(pressure(ds, level)[chosen]).squeeze()
    lat = coord(da.to_dataset(name="x"), ("latitude", "lat"))
    lon = coord(da.to_dataset(name="x"), ("longitude", "lon"))
    lonv, latv = np.meshgrid(da[lon].values, da[lat].values)
    da = da.transpose(lat, lon)
    values = da.values.astype(float)
    zvalues = None
    if field in ("vortex", "height"):
        zda = polar_cap(pressure(ds, level)[zname]).squeeze().transpose(lat, lon)
        zvalues = geopotential_height(zda, zname).values.astype(float)
        if field == "height":
            values = zvalues
    valid = dt.datetime.fromisoformat(init.replace("Z", "+00:00")) + dt.timedelta(hours=step)
    if field in ("vortex", "temp"):
        # ECMWF/GRIB temperatures are Kelvin; NOAA PSL air climatology is °C.
        values = values - 273.15
    if field in ("temp", "height"):
        base = climatology_field("air" if field == "temp" else "hgt", valid.month, level)
        if base is None:
            LOG.warning("1991–2020 climatology unavailable: %s at %s hPa", field, level)
            return None
        values = values - interp_climatology(base, da, lat, lon)
    MAPS.mkdir(parents=True, exist_ok=True)
    out = MAPS / f"{model}_{level}hpa_{field}_{step:03d}.png"
    fig = plt.figure(figsize=(9.3, 8.0), dpi=150, facecolor="white")
    try:
        import cartopy.crs as ccrs
        import cartopy.feature as cfeature
        ax = fig.add_axes([.055, .17, .89, .72], projection=ccrs.NorthPolarStereo())
        ax.set_extent([-180, 180, 20, 90], ccrs.PlateCarree())
        ax.add_feature(cfeature.COASTLINE.with_scale("110m"), linewidth=.65, edgecolor="#294457", zorder=4)
        ax.add_feature(cfeature.BORDERS.with_scale("110m"), linewidth=.3, edgecolor="#667d8d", zorder=4)
        gl = ax.gridlines(crs=ccrs.PlateCarree(), linewidth=.4, color="#71899a", alpha=.45, linestyle="--", zorder=3)
        gl.xlabel_style = {"size": 7}; gl.ylabel_style = {"size": 7}
        if field == "temp":
            cf = ax.contourf(lonv, latv, values, levels=np.arange(-30, 31, 3), cmap="RdBu_r", extend="both", transform=ccrs.PlateCarree())
            cax = fig.add_axes([.20, .12, .60, .022])
            fig.colorbar(cf, cax=cax, orientation="horizontal", label="Scarto dalla media · °C")
        elif field == "wind":
            cf = ax.contourf(lonv, latv, values, levels=np.arange(-60, 66, 6), cmap="RdBu_r", extend="both", transform=ccrs.PlateCarree())
            cax = fig.add_axes([.20, .12, .60, .022])
            fig.colorbar(cf, cax=cax, orientation="horizontal", label="Vento zonale · m/s")
        elif field == "vortex":
            lo = float(np.nanpercentile(values, 5)); hi = float(np.nanpercentile(values, 95))
            cf = ax.contourf(lonv, latv, values, levels=np.linspace(lo, hi, 19), cmap="RdYlBu_r", extend="both", transform=ccrs.PlateCarree())
            cax = fig.add_axes([.20, .12, .60, .022])
            fig.colorbar(cf, cax=cax, orientation="horizontal", label="Temperatura prevista · °C")
            zlevels = np.arange(np.floor(np.nanmin(zvalues) / 500) * 500, np.ceil(np.nanmax(zvalues) / 500) * 500 + 1, 500)
            contours = ax.contour(lonv, latv, zvalues, colors="#263a4a", linewidths=.7, levels=zlevels, transform=ccrs.PlateCarree())
            ax.clabel(contours, inline=True, fontsize=7, fmt="%d m")
        else:
            cf = ax.contourf(lonv, latv, values, levels=np.arange(-1200, 1201, 100), cmap="RdBu_r", extend="both", transform=ccrs.PlateCarree())
            cax = fig.add_axes([.20, .12, .60, .022])
            fig.colorbar(cf, cax=cax, orientation="horizontal", label="Scarto dalla media · m")
            zlevels = np.arange(np.floor(np.nanmin(zvalues) / 500) * 500, np.ceil(np.nanmax(zvalues) / 500) * 500 + 1, 500)
            contours = ax.contour(lonv, latv, zvalues, colors="#263a4a", linewidths=.6, levels=zlevels, transform=ccrs.PlateCarree())
            ax.clabel(contours, inline=True, fontsize=6, fmt="%d m")
        field_titles = {"vortex": "Struttura del vortice", "temp": "Anomalia di temperatura",
                        "height": "Anomalia di geopotenziale", "wind": "Vento zonale"}
        fig.text(.08, .965, "LINEAMETEO  ·  OSSERVATORIO STRATOSFERICO", color="#075b91", fontsize=9, fontweight="bold", va="top")
        fig.text(.08, .925, f"{field_titles[field]}  ·  {level} hPa", color="#17354e", fontsize=14, fontweight="bold", va="top")
        fig.text(.08, .888, f"{model.replace('_', ' ').upper()}  ·  run {init}  ·  valida {valid:%d/%m/%Y %H} UTC  ·  scadenza +{step} h",
                 color="#52697a", fontsize=9, va="top")
        if field == "vortex":
            explanation = "Colori: temperatura prevista (°C)  ·  linee: geopotenziale previsto (m; intervallo 500 m)"
        elif field == "temp":
            explanation = "Colori: scarto della temperatura dalla media mensile NOAA PSL 1991–2020  ·  rosso sopra la media, blu sotto"
        elif field == "height":
            explanation = "Colori: scarto del geopotenziale dalla media mensile NOAA PSL 1991–2020  ·  linee: geopotenziale previsto (m)"
        else:
            explanation = "Colori: vento zonale (m/s)  ·  rosso/positivo = da ovest verso est, blu/negativo = da est verso ovest"
        if field in ("vortex", "height"):
            explanation += "  ·  isolinee ogni 500 m"
        fig.text(.08, .065, explanation, color="#17354e", fontsize=8, fontweight="medium", va="center", wrap=True)
        fig.text(.08, .025, "Area rappresentata: emisfero nord da 20°N al Polo  ·  Grafica LineaMeteo  ·  Fonte: " +
                 ("ECMWF Open Data" if model.startswith(("ecmwf", "aifs")) else "NOAA/NCEP"),
                 color="#667d8d", fontsize=7, va="center")
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
                if normal is not None:
                    rec[f"u{level}normal"] = normal
                    rec[f"u{level}anom"] = current - normal
                if sd is not None: rec[f"u{level}sd"] = sd
                if normal is not None and sd not in (None, 0): rec[f"u{level}sigma"] = (current - normal) / sd
            if t_name:
                current_c = cap_mean(levds[t_name]) - 273.15; rec[f"t{level}"] = current_c
                normal = climatology_cap("air", valid.month, level); sd = climatology_cap("air", valid.month, level, "std")
                if normal is not None:
                    rec[f"t{level}normal"] = normal
                    rec[f"t{level}anom"] = current_c - normal
                if sd is not None: rec[f"t{level}sd"] = sd
                if normal is not None and sd not in (None, 0): rec[f"t{level}sigma"] = (current_c - normal) / sd
            if z_name:
                z = cap_mean(geopotential_height(levds[z_name], z_name))
                rec[f"z{level}"] = z
                normal = climatology_cap("hgt", valid.month, level); sd = climatology_cap("hgt", valid.month, level, "std")
                if normal is not None:
                    rec[f"z{level}normal"] = normal
                    rec[f"z{level}anom"] = z - normal
                if sd is not None: rec[f"z{level}sd"] = sd
                if normal is not None and sd not in (None, 0): rec[f"z{level}sigma"] = (z - normal) / sd
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
            h = Herbie(herbie_init(init), model=noaa_model, product=product, fxx=step, save_dir=str(DATA / ".grib-cache"), **kwargs)
            levexpr = "1000|925|850|700|500|300|200|150|100|70|50|30|20|15|10|7|5|3|2|1" if model_key == "gfs" else "1000|925|850|700|500|300|200|150|100|70|50|30|10"
            path = h.download(searchString=":(UGRD|VGRD|TMP|HGT):(?:" + levexpr + ") mb:", verbose=False)
            if path is None: raise RuntimeError("NOAA/Herbie non ha restituito un sottoinsieme GRIB")
            ds = open_grib(Path(path))
            try: save_model_step(ds, model_key, init_iso, step, out, levels)
            finally: ds.close()
        except Exception as e:
            # Keep the traceback in Actions logs: NOAA data errors must be diagnosable
            # instead of silently looking like a run with no available maps.
            LOG.warning("NOAA %s +%sh skipped: %s", model_key, step, e, exc_info=True)
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
                    h = Herbie(herbie_init(init), model="gefs", product="atmos.5", member=key, fxx=lead,
                               save_dir=tmp, verbose=False)
                    path = h.download(searchString=":UGRD:10 mb:", verbose=False)
                    if path is None: continue
                    ds = open_grib(Path(path))
                    try:
                        uname = var_name(ds, ("u", "u_grd"))
                        if uname: member_paths[key][lead] = u60(pressure(ds, 10)[uname])
                    finally: ds.close()
                except Exception as e:
                    LOG.warning("GEFS %s +%sh member unavailable: %s", key, lead, e, exc_info=True)
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


def fetch_ecmwf_ensemble_odds(init: dt.datetime, out: dict) -> None:
    """Count ECMWF ENS perturbed members with easterly U60 at sampled leads."""
    from ecmwf.opendata import Client
    leads = (168, 240, 288, 336)
    path = DATA / ".ecmwf-ens-u10.grib2"
    try:
        Client(source="ecmwf", model="ifs", resol="0p25").retrieve(
            date=init.strftime("%Y%m%d"), time=int(init.strftime("%H")), stream="enfo", type="pf",
            step=list(leads), param="u", levelist=10, number=list(range(1, 51)), target=str(path))
        ds = open_grib(path)
        try:
            uname = var_name(ds, ("u", "u_grd"))
            if not uname: raise RuntimeError("campo U non trovato nell’ensemble ECMWF")
            rows = []
            for lead in leads:
                vals = []
                for member in range(1, 51):
                    try: vals.append(u60(ds[uname].sel(step=np.timedelta64(lead, "h"), number=member)))
                    except Exception: pass
                rows.append({"leadHours": lead, "members": len(vals), "membersBelowZero": sum(v < 0 for v in vals),
                             "rawShare": sum(v < 0 for v in vals) / len(vals) if vals else None})
            out.setdefault("probabilities", {})["ecmwf_ens"] = {"source": "ECMWF ENS", "run": init.strftime("%Y-%m-%dT%H:%MZ"),
                "sampledLeadsHours": list(leads), "method": "frazione grezza dei membri con U60<0; non probabilità calibrata", "rows": rows}
        finally: ds.close()
    except Exception as e:
        LOG.warning("ECMWF ensemble member fractions unavailable: %s", e)
    finally:
        path.unlink(missing_ok=True)


def merge_archive(out: dict) -> None:
    history_path = DATA / "history.json"
    try: history = json.loads(history_path.read_text("utf-8")) if history_path.exists() else {"runs": {}}
    except Exception: history = {"runs": {}}
    if history.get("metricVersion") != METRIC_VERSION:
        # Historical values used a 55–65°N band and cannot be compared with
        # the standard U60 index. Preserve them separately, then start a clean
        # archive so trend and verification plots never mix definitions.
        legacy = {k: history[k] for k in ("metricVersion", "runs", "analyses", "updated") if k in history}
        history = {"runs": {}, "analyses": {}, "metricVersion": METRIC_VERSION}
        if legacy:
            history["previousMetricArchive"] = legacy
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
    out = {"schema": DATA_SCHEMA, "metricVersion": METRIC_VERSION, "generatedAt": None, "models": {}, "sources": {}, "verification": {}, "probabilities": {}}
    old_path = DATA / "dashboard.json"
    if old_path.exists():
        try:
            previous = json.loads(old_path.read_text("utf-8"))
            if previous.get("schema") == DATA_SCHEMA and previous.get("metricVersion") == METRIC_VERSION:
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
        previous_model = copy.deepcopy(out["models"].get(model))
        previous_source = copy.deepcopy(out["sources"].get(model, {}))
        try:
            expected_iso = expected[model].strftime("%Y-%m-%dT%H:%MZ")
            current_model = previous_model or {}
            if (current_model.get("init") == expected_iso and current_model.get("series")
                    and map_assets_present(current_model)):
                LOG.info("Keeping existing %s run %s", model, expected_iso)
                out["sources"][model] = {**previous_source, "available": True, "init": expected_iso,
                                          "status": "current", "error": None}
                continue
            if current_model.get("init") == expected_iso and current_model.get("series"):
                LOG.info("Rebuilding %s run %s because its map PNG files are missing", model, expected_iso)
            task()
            candidate = out["models"].get(model, {})
            has_usable_wind = any(p.get("u10") is not None for p in candidate.get("series", []))
            if not has_usable_wind and previous_model:
                LOG.warning("New %s run %s has no usable U60 samples; keeping previous run %s", model, expected_iso, previous_model.get("init"))
                out["models"][model] = previous_model
                out["sources"][model] = {**previous_source, "available": bool(previous_model.get("series")),
                                          "init": previous_model.get("init"), "status": "stale",
                                          "expectedInit": expected_iso, "error": "Il nuovo run non contiene campioni U60 utilizzabili; mantenuto il run precedente."}
            else:
                out["sources"][model] = {"available": bool(candidate.get("series")), "init": candidate.get("init"),
                                          "status": "current" if candidate.get("init") == expected_iso else "stale",
                                          "expectedInit": expected_iso, "error": None if candidate.get("init") == expected_iso else "Il feed non ha ancora pubblicato il run atteso.",
                                          "attribution": "ECMWF Open Data" if model.startswith(("ecmwf", "aifs")) else "NOAA/NCEP public model data"}
        except Exception as e:
            LOG.exception("Model job failed: %s", model)
            if previous_model:
                out["models"][model] = previous_model
            out["sources"][model] = {**previous_source, "available": bool(previous_model and previous_model.get("series")),
                                      "init": previous_model.get("init") if previous_model else None,
                                      "status": "stale" if previous_model else "unavailable",
                                      "expectedInit": expected[model].strftime("%Y-%m-%dT%H:%MZ"), "error": str(e),
                                      "attribution": "ECMWF Open Data" if model.startswith(("ecmwf", "aifs")) else "NOAA/NCEP public model data"}
    expected_ens_run = cycle_ifs.strftime("%Y-%m-%dT%H:%MZ")
    if out.get("probabilities", {}).get("ecmwf_ens", {}).get("run") != expected_ens_run:
        fetch_ecmwf_ensemble_odds(cycle_ifs, out)
    merge_archive(out)
    out["verification"] = build_verification(out)
    out["generatedAt"] = utcnow().isoformat()
    statuses = [out["sources"].get(model, {}).get("status", "unavailable") for model, _ in jobs]
    out["updateStatus"] = {"state": "ok" if all(status == "current" for status in statuses) else "partial",
                           "completedAt": out["generatedAt"], "currentModels": statuses.count("current"),
                           "modelCount": len(jobs), "staleModels": [model for model, _ in jobs if out["sources"].get(model, {}).get("status") == "stale"],
                           "unavailableModels": [model for model, _ in jobs if out["sources"].get(model, {}).get("status") == "unavailable"]}
    target = DATA / "dashboard.json"
    temp_target = target.with_suffix(".json.tmp")
    temp_target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")
    temp_target.replace(target)
    cache = DATA / ".grib-cache"
    if cache.exists(): shutil.rmtree(cache, ignore_errors=True)
    LOG.info("Dashboard built: %s models available", sum(x.get("available", False) for x in out["sources"].values()))


if __name__ == "__main__":
    main()
