"""Vstupný bod FastAPI aplikácie."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import __version__
from .adapters import build_adapters
from .auth import AuthService
from .calendar_sync import CalendarService
from .config import Settings, get_settings
from .db import Database
from .events import EventBus
from .radio import RadioService
from .routers import auth, calendar, devices, radio, system, thermostats
from .secrets_store import SecretStore

log = logging.getLogger("solargroup_home")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "connect-src 'self'; media-src 'self' http: https:; frame-ancestors 'none'; base-uri 'self'"
    ),
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        log.info("SolarGroup Home %s štartuje v režime %s", __version__, settings.mode.upper())
        # synchronizácia kalendárov na pozadí (neblokuje dashboard)
        task = (
            asyncio.create_task(app.state.calendar.run_forever())
            if settings.calendar_sync_minutes > 0
            else None
        )
        yield
        if task:
            task.cancel()

    app = FastAPI(
        title="SolarGroup Home",
        version=__version__,
        lifespan=lifespan,
        # Dokumentácia API iba v DEMO režime, aby sa v LIVE neprezrádzala štruktúra.
        docs_url="/api/docs" if settings.mode == "demo" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.mode == "demo" else None,
    )

    db = Database(settings.db_path)
    db.init()
    app.state.settings = settings
    app.state.db = db
    app.state.auth = AuthService(db, settings.session_hours)
    app.state.adapters = build_adapters(settings, db)
    app.state.bus = EventBus()
    app.state.radio = RadioService(settings.data_path)
    app.state.secrets = SecretStore(settings.data_path)
    app.state.calendar = CalendarService(db, settings, app.state.secrets)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response

    app.include_router(auth.router)
    app.include_router(system.router)
    app.include_router(devices.router)
    app.include_router(thermostats.router)
    app.include_router(radio.router)
    app.include_router(calendar.router)

    @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def api_not_found(path: str):
        return JSONResponse({"detail": "Neznámy endpoint"}, status_code=404)

    _mount_frontend(app, settings.frontend_dist)
    return app


def _mount_frontend(app: FastAPI, dist: Path) -> None:
    """V produkcii backend servíruje zostavený frontend (jeden proces – šetrí RAM)."""
    index = dist / "index.html"
    if not index.is_file():
        log.info("Frontend nie je zostavený (%s) – beží iba API", dist)
        return
    if (dist / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    root = dist.resolve()

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
