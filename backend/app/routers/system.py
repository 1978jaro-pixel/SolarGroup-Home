import asyncio
import contextlib
import platform
import socket
import time

from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect

from .. import __version__
from ..adapters import AdapterSet
from ..adapters.base import mark_stale
from ..auth import require_user, websocket_user
from ..deps import get_adapters
from ..models import Integration, SystemInfo

router = APIRouter(prefix="/api", tags=["system"])

STARTED = time.monotonic()
WS_SNAPSHOT_INTERVAL_S = 3


@router.get("/health")
def health(request: Request) -> dict:
    """Verejný endpoint bez citlivých údajov – na monitorovanie."""
    return {"status": "ok", "mode": request.app.state.settings.mode}


@router.get("/system", dependencies=[Depends(require_user)])
async def system_info(request: Request, a: AdapterSet = Depends(get_adapters)) -> SystemInfo:
    db = request.app.state.db
    first = {kind: next(iter(db.devices(kind)), None) for kind in ("heating", "climate", "camera")}

    async def probe(adapter, coro) -> Integration:
        reading = await coro
        return Integration(
            id=type(adapter).__name__,
            name=adapter.name,
            status=reading.status,
            message=reading.message,
        )

    checks = [
        probe(a.energy, a.energy.snapshot()),
        probe(a.weather, a.weather.current()),
    ]
    if first["heating"]:
        checks.append(probe(a.heating, a.heating.state(first["heating"])))
    if first["climate"]:
        checks.append(probe(a.climate, a.climate.state(first["climate"])))
    if first["camera"]:
        checks.append(probe(a.cameras, a.cameras.info(first["camera"])))
    integrations = list(await asyncio.gather(*checks))
    return SystemInfo(
        app="SolarGroup Home",
        version=__version__,
        mode=a.source,
        hostname=socket.gethostname(),
        python=platform.python_version(),
        uptime_s=int(time.monotonic() - STARTED),
        integrations=integrations,
    )


@router.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    """Push aktualizácií: pravidelný snapshot fotovoltiky + udalosti zo zariadení."""
    if websocket_user(websocket) is None:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    app = websocket.app
    queue = app.state.bus.subscribe()
    try:
        while True:
            reading = await app.state.adapters.energy.snapshot()
            reading = mark_stale(reading, app.state.settings.stale_after_seconds)
            payload = reading.model_dump(mode="json")
            await websocket.send_json({"type": "energy", "payload": payload})
            with contextlib.suppress(TimeoutError):
                deadline = time.monotonic() + WS_SNAPSHOT_INTERVAL_S
                while (remaining := deadline - time.monotonic()) > 0:
                    msg = await asyncio.wait_for(queue.get(), timeout=remaining)
                    await websocket.send_json(msg)
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        app.state.bus.unsubscribe(queue)
