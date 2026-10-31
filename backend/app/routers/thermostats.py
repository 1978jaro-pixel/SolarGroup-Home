"""API kúrenia (Buderus) a klimatizácie (Sinclair). Všetky endpointy vyžadujú prihlásenie.

Pravidlá pre LIVE režim:
* príkaz vráti iba stav potvrdený zariadením – pri nedostupnom zariadení HTTP 503,
* nepodporované alebo nebezpečné nastavenia sa odmietnu ešte pred odoslaním (HTTP 400).
"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..adapters import AdapterSet, AdapterUnavailable
from ..auth import require_user
from ..climate_logic import ClimateError, capabilities_of, validate_command
from ..db import Database
from ..deps import device_or_404, finalize, get_adapters, get_bus, get_db
from ..events import EventBus
from ..heating_logic import HeatingError
from ..models import ClimateCommand, HeatingCommand, Reading, UserOut, WeeklyProgram

router = APIRouter(prefix="/api", tags=["thermostats"], dependencies=[Depends(require_user)])


def _unavailable(exc: AdapterUnavailable) -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Zariadenie nedostupné: {exc}")


def _invalid(exc: ValueError) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


# --- Kúrenie --------------------------------------------------------------------


@router.get("/heating")
async def heating_list(
    request: Request, db: Database = Depends(get_db), a: AdapterSet = Depends(get_adapters)
) -> list[Reading]:
    readings = await asyncio.gather(*(a.heating.state(d) for d in db.devices("heating")))
    return [finalize(request, r) for r in readings]


@router.post("/heating/{device_id}")
async def heating_command(
    device_id: str,
    cmd: HeatingCommand,
    db: Database = Depends(get_db),
    a: AdapterSet = Depends(get_adapters),
    bus: EventBus = Depends(get_bus),
    user: UserOut = Depends(require_user),
):
    device = device_or_404(db, device_id, "heating")
    try:
        state = await a.heating.command(device, cmd)
    except AdapterUnavailable as exc:
        raise _unavailable(exc) from exc
    except HeatingError as exc:
        raise _invalid(exc) from exc
    db.audit(user.username, "heating", device_id, cmd.model_dump(mode="json", exclude_none=True))
    bus.publish("heating", state.model_dump(mode="json"))
    return state


@router.get("/heating/{device_id}/schedule")
async def heating_schedule(
    device_id: str,
    request: Request,
    db: Database = Depends(get_db),
    a: AdapterSet = Depends(get_adapters),
) -> Reading:
    device = device_or_404(db, device_id, "heating")
    return finalize(request, await a.heating.schedule(device))


@router.put("/heating/{device_id}/schedule/{program}")
async def heating_set_schedule(
    device_id: str,
    program: int,
    weekly: WeeklyProgram,
    db: Database = Depends(get_db),
    a: AdapterSet = Depends(get_adapters),
    bus: EventBus = Depends(get_bus),
    user: UserOut = Depends(require_user),
):
    if program not in (1, 2):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Program neexistuje")
    device = device_or_404(db, device_id, "heating")
    try:
        schedule = await a.heating.set_schedule(device, program, weekly)
    except AdapterUnavailable as exc:
        raise _unavailable(exc) from exc
    db.audit(user.username, "heating_schedule", device_id, {"program": program})
    bus.publish("heating_schedule", {"device_id": device_id, "program": program})
    return schedule


# --- Klimatizácia -----------------------------------------------------------------


@router.get("/climate")
async def climate_list(
    request: Request, db: Database = Depends(get_db), a: AdapterSet = Depends(get_adapters)
) -> list[Reading]:
    readings = await asyncio.gather(*(a.climate.state(d) for d in db.devices("climate")))
    return [finalize(request, r) for r in readings]


@router.post("/climate/{device_id}")
async def climate_command(
    device_id: str,
    cmd: ClimateCommand,
    db: Database = Depends(get_db),
    a: AdapterSet = Depends(get_adapters),
    bus: EventBus = Depends(get_bus),
    user: UserOut = Depends(require_user),
):
    device = device_or_404(db, device_id, "climate")
    try:
        validate_command(cmd, capabilities_of(device))
        state = await a.climate.command(device, cmd)
    except AdapterUnavailable as exc:
        raise _unavailable(exc) from exc
    except ClimateError as exc:
        raise _invalid(exc) from exc
    db.audit(user.username, "climate", device_id, cmd.model_dump(mode="json", exclude_none=True))
    bus.publish("climate", state.model_dump(mode="json"))
    return state
