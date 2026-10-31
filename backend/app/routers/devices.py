"""API pre moduly domácnosti. Všetky endpointy vyžadujú prihlásenie."""

import asyncio
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..adapters import AdapterSet, AdapterUnavailable
from ..adapters.demo import local_now
from ..auth import require_user
from ..db import Database
from ..deps import device_or_404, finalize, get_adapters, get_bus, get_db
from ..events import EventBus
from ..models import (
    BlindCommand,
    BlindGroupCommand,
    LightCommand,
    Reading,
    UserOut,
)

router = APIRouter(prefix="/api", tags=["home"], dependencies=[Depends(require_user)])


def _unavailable(exc: AdapterUnavailable) -> HTTPException:
    return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Zariadenie nedostupné: {exc}")


async def _all(request: Request, coros) -> list[Reading]:
    return [finalize(request, r) for r in await asyncio.gather(*coros)]


# --- Miestnosti ---------------------------------------------------------------


@router.get("/rooms")
def rooms(db: Database = Depends(get_db)) -> list[dict]:
    return db.rooms()


# --- Fotovoltika ----------------------------------------------------------------


@router.get("/energy/snapshot")
async def energy_snapshot(request: Request, a: AdapterSet = Depends(get_adapters)) -> Reading:
    return finalize(request, await a.energy.snapshot())


@router.get("/energy/history")
async def energy_history(
    request: Request, day: date | None = None, a: AdapterSet = Depends(get_adapters)
) -> Reading:
    return finalize(request, await a.energy.history(day or local_now().date()))


# --- Svetlá -----------------------------------------------------------------------


@router.get("/lights")
async def lights_list(
    request: Request, db: Database = Depends(get_db), a: AdapterSet = Depends(get_adapters)
) -> list[Reading]:
    return await _all(request, [a.lights.state(d) for d in db.devices("light")])


@router.post("/lights/{device_id}")
async def light_command(
    device_id: str,
    cmd: LightCommand,
    db: Database = Depends(get_db),
    a: AdapterSet = Depends(get_adapters),
    bus: EventBus = Depends(get_bus),
    user: UserOut = Depends(require_user),
):
    device = device_or_404(db, device_id, "light")
    try:
        state = await a.lights.command(device, cmd)
    except AdapterUnavailable as exc:
        raise _unavailable(exc) from exc
    db.audit(user.username, "light", device_id, cmd.model_dump(exclude_none=True))
    bus.publish("light", state.model_dump(mode="json"))
    return state


# --- Žalúzie ----------------------------------------------------------------------


@router.get("/blinds")
async def blinds_list(
    request: Request, db: Database = Depends(get_db), a: AdapterSet = Depends(get_adapters)
) -> list[Reading]:
    return await _all(request, [a.blinds.state(d) for d in db.devices("blind")])


@router.post("/blinds/group")
async def blinds_group(
    cmd: BlindGroupCommand,
    db: Database = Depends(get_db),
    a: AdapterSet = Depends(get_adapters),
    bus: EventBus = Depends(get_bus),
    user: UserOut = Depends(require_user),
):
    devices = db.devices("blind")
    if cmd.device_ids is not None:
        devices = [d for d in devices if d["id"] in set(cmd.device_ids)]
    try:
        states = [await a.blinds.set_position(d, cmd.position) for d in devices]
    except AdapterUnavailable as exc:
        raise _unavailable(exc) from exc
    db.audit(user.username, "blinds_group", None, cmd.model_dump())
    for s in states:
        bus.publish("blind", s.model_dump(mode="json"))
    return states


@router.post("/blinds/{device_id}")
async def blind_command(
    device_id: str,
    cmd: BlindCommand,
    db: Database = Depends(get_db),
    a: AdapterSet = Depends(get_adapters),
    bus: EventBus = Depends(get_bus),
    user: UserOut = Depends(require_user),
):
    device = device_or_404(db, device_id, "blind")
    try:
        state = await a.blinds.set_position(device, cmd.position)
    except AdapterUnavailable as exc:
        raise _unavailable(exc) from exc
    db.audit(user.username, "blind", device_id, cmd.model_dump())
    bus.publish("blind", state.model_dump(mode="json"))
    return state


# --- Kamery a videovrátnik ------------------------------------------------------


@router.get("/cameras")
async def cameras_list(
    request: Request, db: Database = Depends(get_db), a: AdapterSet = Depends(get_adapters)
) -> list[Reading]:
    return await _all(request, [a.cameras.info(d) for d in db.devices("camera")])


@router.get("/intercom")
def intercom(request: Request, a: AdapterSet = Depends(get_adapters)) -> Reading:
    return Reading(
        status="unavailable",
        source=a.source,
        message="Videovrátnik zatiaľ nie je integrovaný",
    )


# --- Počasie ------------------------------------------------------------------------


@router.get("/weather")
async def weather(request: Request, a: AdapterSet = Depends(get_adapters)) -> Reading:
    return finalize(request, await a.weather.current())
