"""Spoločné závislosti pre routery."""

from fastapi import HTTPException, Request, status

from .adapters import AdapterSet
from .adapters.base import mark_stale
from .db import Database
from .events import EventBus
from .models import Reading


def get_db(request: Request) -> Database:
    return request.app.state.db


def get_adapters(request: Request) -> AdapterSet:
    return request.app.state.adapters


def get_bus(request: Request) -> EventBus:
    return request.app.state.bus


def finalize(request: Request, reading: Reading) -> Reading:
    return mark_stale(reading, request.app.state.settings.stale_after_seconds)


def device_or_404(db: Database, device_id: str, kind: str) -> dict:
    device = db.device(device_id)
    if device is None or device["kind"] != kind:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zariadenie neexistuje")
    return device
