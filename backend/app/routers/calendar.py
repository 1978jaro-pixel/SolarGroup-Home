"""API kalendára: zdroje (Google OAuth 2.0 / súkromná iCal adresa), výber kalendárov, udalosti.

Tajomstvá (tokeny, iCal adresy) z backendu nikdy neodchádzajú. Synchronizácia beží na pozadí.
"""

import asyncio
from datetime import datetime, timedelta
from urllib.parse import quote, urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ..auth import require_user
from ..calendar_sync import CalendarError, CalendarService
from ..db import Database
from ..deps import get_db

router = APIRouter(prefix="/api/calendar", tags=["calendar"], dependencies=[Depends(require_user)])


def get_cal(request: Request) -> CalendarService:
    return request.app.state.calendar


class IcalIn(BaseModel):
    name: str = Field(default="Môj kalendár", max_length=120)
    url: str = Field(min_length=10, max_length=2000)


class SelectIn(BaseModel):
    cal_id: str = Field(min_length=1, max_length=300)
    selected: bool


def _bad(exc: CalendarError) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


@router.get("/status")
def cal_status(
    request: Request, db: Database = Depends(get_db), cal: CalendarService = Depends(get_cal)
) -> dict:
    with db.connect() as conn:
        srcs = [
            dict(r)
            for r in conn.execute(
                "SELECT id, kind, name, account, enabled, last_sync, last_ok, last_error FROM "
                "calendar_sources ORDER BY created_at"
            )
        ]
        for s in srcs:
            s["enabled"] = bool(s["enabled"])
            s["calendars"] = [
                {**dict(c), "selected": bool(c["selected"])}
                for c in conn.execute(
                    "SELECT cal_id, name, color, selected FROM calendar_calendars WHERE source_id "
                    "= ? ORDER BY name",
                    (s["id"],),
                )
            ]
    redirect = urlparse(request.app.state.settings.google_redirect_uri)
    return {
        "google_configured": cal.google_configured,
        "google_login_host": f"{redirect.scheme}://{redirect.netloc}",
        "sync_minutes": request.app.state.settings.calendar_sync_minutes,
        "sources": srcs,
    }


@router.get("/events")
def events(request: Request, start: str, end: str, db: Database = Depends(get_db)) -> dict:
    try:
        s = datetime.fromisoformat(start).date().isoformat()
        e = datetime.fromisoformat(end).date().isoformat()
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Neplatný dátum") from exc
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT e.source_id, e.cal_id, e.uid, e.title, e.location, e.start, e.end, e.all_day, "
            "c.color, c.name AS calendar "
            "FROM calendar_events e "
            "JOIN calendar_calendars c ON c.source_id = e.source_id AND c.cal_id = e.cal_id AND "
            "c.selected = 1 "
            "JOIN calendar_sources s ON s.id = e.source_id AND s.enabled = 1 "
            "WHERE e.end >= ? AND e.start < ? ORDER BY e.start",
            (s, e + "T99"),
        ).fetchall()
        srcs = conn.execute(
            "SELECT last_ok, last_error, last_sync FROM calendar_sources WHERE enabled = 1"
        ).fetchall()
    minutes = max(request.app.state.settings.calendar_sync_minutes, 1)
    oks = [r["last_ok"] for r in srcs if r["last_ok"]]
    synced_at = min(oks) if oks and len(oks) == len(srcs) else None
    stale = bool(srcs) and (
        synced_at is None
        or any(r["last_error"] for r in srcs)
        or datetime.fromisoformat(synced_at)
        < datetime.now(datetime.fromisoformat(synced_at).tzinfo) - timedelta(minutes=3 * minutes)
    )
    return {
        "events": [{**dict(r), "all_day": bool(r["all_day"])} for r in rows],
        "sources": len(srcs),
        "synced_at": synced_at,
        "stale": stale,
    }


@router.post("/ical")
async def add_ical(body: IcalIn, cal: CalendarService = Depends(get_cal)) -> dict:
    try:
        sid = await cal.add_ical(body.name, body.url)
    except CalendarError as exc:
        raise _bad(exc) from exc
    return {"id": sid}


@router.delete("/sources/{sid}")
def delete_source(sid: str, db: Database = Depends(get_db)) -> dict:
    with db.connect() as conn:
        n = conn.execute("DELETE FROM calendar_sources WHERE id = ?", (sid,)).rowcount
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zdroj neexistuje")
    return {"ok": True}


@router.patch("/sources/{sid}/calendars")
async def select_calendar(
    sid: str,
    body: SelectIn,
    db: Database = Depends(get_db),
    cal: CalendarService = Depends(get_cal),
) -> dict:
    with db.connect() as conn:
        n = conn.execute(
            "UPDATE calendar_calendars SET selected = ? WHERE source_id = ? AND cal_id = ?",
            (int(body.selected), sid, body.cal_id),
        ).rowcount
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kalendár neexistuje")
    asyncio.create_task(cal.sync_source(sid))
    return {"ok": True}


@router.post("/sync")
async def sync_now(cal: CalendarService = Depends(get_cal)) -> dict:
    # na pozadí – dashboard ani táto požiadavka nečakajú na Google/iCal
    asyncio.create_task(cal.sync_all())
    return {"started": True}


@router.get("/google/start")
def google_start(request: Request, cal: CalendarService = Depends(get_cal)) -> dict:
    redirect = urlparse(request.app.state.settings.google_redirect_uri)
    if request.url.netloc != redirect.netloc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Prihlásenie Google spustite priamo na displeji zariadenia (adresa "
            f"{redirect.scheme}://{redirect.netloc}). "
            "Google z bezpečnostných dôvodov nepovoľuje návrat na adresu v domácej sieti.",
        )
    try:
        return {"url": cal.google_auth_url()}
    except CalendarError as exc:
        raise _bad(exc) from exc


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    code: str = "", state: str = "", error: str = "", cal: CalendarService = Depends(get_cal)
) -> RedirectResponse:
    if error or not code:
        return RedirectResponse(
            f"/kalendar?google=chyba&detail={quote(error or 'zrušené')}", status_code=303
        )
    try:
        await cal.google_finish(code, state)
    except CalendarError as exc:
        return RedirectResponse(f"/kalendar?google=chyba&detail={quote(str(exc))}", status_code=303)
    return RedirectResponse("/kalendar?google=ok", status_code=303)
