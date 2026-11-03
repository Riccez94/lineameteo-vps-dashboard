#!/usr/bin/env python3
"""Build a compact, day-of-year-matched ECMWF IFS S2S hindcast reference."""
from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path

import numpy as np

LOG = logging.getLogger("vps.hindcast")
ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "public" / "data" / "ifs_s2s_hindcast.json"
SOURCE = "https://registry.opendata.aws/ifs-s2s-forecast-data/"


def _doy(value: dt.datetime) -> int:
    # Keep seasonal matching consistent in leap and non-leap years.
    return value.timetuple().tm_yday - (1 if value.month > 2 and _is_leap(value.year) else 0)


def _is_leap(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def _cached_for(now: dt.datetime) -> dict | None:
    try:
        product = json.loads(TARGET.read_text("utf-8"))
        made = dt.datetime.fromisoformat(product["generatedAt"].replace("Z", "+00:00"))
        center = int(product["windowCenterDay"])
        delta = abs(center - _doy(now))
        delta = min(delta, 365 - delta)
        age = (now - made).total_seconds()
        if product.get("available") and age < 35 * 86400 and delta <= 4 and product.get("series"):
            return product
        if not product.get("available") and age < 24 * 3600:
            return product
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def build_hindcast(now: dt.datetime | None = None) -> dict | None:
    """Aggregate matched 10-hPa U60 hindcasts; gracefully retain prior cache."""
    now = now or dt.datetime.now(dt.timezone.utc)
    cached = _cached_for(now)
    if cached:
        LOG.info("Using cached ECMWF IFS S2S hindcast reference")
        return cached
    try:
        prior = json.loads(TARGET.read_text("utf-8"))
    except (OSError, ValueError):
        prior = None
    try:
        import icechunk
        import xarray as xr

        storage = icechunk.s3_storage(
            bucket="planette-ifs-46-day", prefix="reforecasts",
            region="us-east-2", anonymous=True,
        )
        repo = icechunk.Repository.open(storage)
        store = repo.readonly_session("main").store
        ds = xr.open_zarr(store, group="pressure/1p5latx1p5lon", consolidated=False, chunks={})
        field = ds["u"]
        dims = {name.lower(): name for name in field.dims}
        coords = {name.lower(): name for name in field.coords}
        init_name = coords.get("init_time") or dims.get("init_time")
        lead_name = coords.get("lead") or dims.get("lead")
        level_name = coords.get("pressure_level") or dims.get("pressure_level")
        lat_name = coords.get("lat") or coords.get("latitude") or dims.get("lat") or dims.get("latitude")
        lon_name = coords.get("lon") or coords.get("longitude") or dims.get("lon") or dims.get("longitude")
        if not all((init_name, lead_name, level_name, lat_name, lon_name)):
            raise ValueError(f"hindcast axes not found: {field.dims}")

        init_values = np.asarray(ds[init_name].values)
        init_dates = [dt.datetime.fromisoformat(np.datetime_as_string(v, unit="s").replace("Z", "+00:00"))
                      for v in init_values]
        center_day = _doy(now)
        distances = []
        for stamp in init_dates:
            day = _doy(stamp)
            distance = abs(day - center_day)
            distances.append(min(distance, 365 - distance))
        init_indices = np.flatnonzero(np.asarray(distances) <= 15)
        if not len(init_indices):
            raise ValueError("no seasonal-matched init times in the hindcast archive")

        lead_values = np.asarray(ds[lead_name].values)
        lead_hours = []
        for value in lead_values:
            if np.issubdtype(np.asarray(value).dtype, np.timedelta64):
                hours = float(value / np.timedelta64(1, "h"))
            else:
                # The source stores lead in days when it is numeric.
                hours = float(value) * 24
            lead_hours.append(int(round(hours)))
        lead_indices = np.flatnonzero((np.asarray(lead_hours) >= 0) & (np.asarray(lead_hours) <= 45 * 24))
        selected_leads = [lead_hours[i] for i in lead_indices]
        lat_values = np.asarray(ds[lat_name].values, dtype=float)
        lat_index = int(np.nanargmin(np.abs(lat_values - 60.0)))
        selected = field.isel({init_name: init_indices, lead_name: lead_indices, lat_name: lat_index})
        selected = selected.sel({level_name: 10}, method="nearest")
        zonal = selected.mean(dim=lon_name, skipna=True).load()
        values = np.asarray(zonal.values, dtype=float)
        # Normalize to (member, init, lead), tolerating source dimension order.
        member_dims = [d for d in zonal.dims if d not in (init_name, lead_name)]
        if len(member_dims) != 1:
            raise ValueError(f"unexpected hindcast dimensions after zonal mean: {zonal.dims}")
        values = np.moveaxis(values, [zonal.dims.index(member_dims[0]), zonal.dims.index(init_name), zonal.dims.index(lead_name)], [0, 1, 2])

        series = []
        for i, lead in enumerate(selected_leads):
            sample = values[:, :, i].reshape(-1)
            sample = sample[np.isfinite(sample)]
            if not len(sample):
                continue
            q = np.percentile(sample, [10, 25, 50, 75, 90])
            series.append({"leadHours": lead, "n": int(len(sample)), "mean": float(np.mean(sample)),
                           "p10": float(q[0]), "p25": float(q[1]), "median": float(q[2]),
                           "p75": float(q[3]), "p90": float(q[4])})
        if len(series) < 30:
            raise ValueError(f"hindcast archive yielded only {len(series)} lead samples")
        product = {
            "available": True, "generatedAt": now.isoformat(), "windowCenterDay": center_day,
            "windowDays": 31, "firstYear": int(min(d.year for d in init_dates)),
            "lastYear": int(max(d.year for d in init_dates)), "initSamples": int(len(init_indices)),
            "membersPerInit": int(values.shape[0]), "leadDays": 45, "series": series,
            "method": "Percentili dei membri IFS S2S a 10 hPa, U zonale mediata lungo i paralleli e campionata alla latitudine più vicina a 60°N; inizializzazioni entro ±15 giorni dell’anno rispetto alla data corrente.",
            "attribution": "ECMWF IFS S2S Reforecasts via Planette Open Data · 2006–2025 · CC BY 4.0",
            "source": SOURCE,
        }
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        temporary = TARGET.with_suffix(".json.tmp")
        temporary.write_text(json.dumps(product, ensure_ascii=False, separators=(",", ":")), "utf-8")
        temporary.replace(TARGET)
        LOG.info("Built IFS S2S hindcast reference: %d seasonal init dates, %d lead samples", len(init_indices), len(series))
        ds.close()
        return product
    except Exception as exc:
        LOG.warning("ECMWF IFS S2S hindcast reference unavailable; continuing with operational feeds: %s", exc)
        if cached or (isinstance(prior, dict) and prior.get("available") and prior.get("series")):
            return cached or prior
        unavailable = {"available": False, "generatedAt": now.isoformat(), "windowCenterDay": _doy(now),
                       "series": [], "message": "Archivio hindcast non raggiungibile; il tentativo automatico verrà ripetuto entro 24 ore.",
                       "source": SOURCE}
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        TARGET.write_text(json.dumps(unavailable, ensure_ascii=False, separators=(",", ":")), "utf-8")
        return unavailable
