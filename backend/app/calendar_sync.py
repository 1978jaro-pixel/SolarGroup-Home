"""Kalendár: Google Calendar API (OAuth 2.0, iba čítanie) a súkromná iCal adresa.

* Tokeny a iCal adresy sú v databáze iba zašifrované (``SecretStore``);
  do prehliadača sa nikdy neposielajú.
* Synchronizácia beží na pozadí (``sync_all``) a neblokuje dashboard; výsledok sa ukladá
  do SQLite, takže pri výpadku internetu sa zobrazia posledné uložené udalosti
  (označené ako nesynchronizované).
* Časové pásmo domácnosti (Europe/Bratislava) – udalosti sa ukladajú v miestnom čase s posunom.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import secrets
import time
import uuid
from datetime import date, datetime, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
import icalendar
import recurring_ical_events

from .db import Database
from .radio import RadioError, validate_stream_url
from .secrets_store import SecretStore

log = logging.getLogger("solargroup_home.calendar")

GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"  # noqa: S105 – adresa, nie heslo
GOOGLE_API = "https://www.googleapis.com/calendar/v3"
SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
PAST_DAYS = 7
FUTURE_DAYS = 62
MAX_ICS_BYTES = 5 * 1024 * 1024


class CalendarError(ValueError):
    """Chyba konfigurácie alebo vstupu (HTTP 400)."""


def _iso(dt: datetime | date, tz: ZoneInfo) -> tuple[str, bool]:
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=tz)
        return dt.astimezone(tz).isoformat(timespec="minutes"), False
    return dt.isoformat(), True


def parse_ics(data: bytes, start: datetime, end: datetime, tz: ZoneInfo) -> list[dict]:
    """Udalosti z iCal (vrátane opakovaných) v intervale <start, end)."""
    try:
        cal = icalendar.Calendar.from_ical(data)
    except ValueError as exc:
        raise CalendarError("Adresa nevracia platný iCal kalendár") from exc
    events = []
    for ev in recurring_ical_events.of(cal).between(start, end):
        s = ev.get("DTSTART")
        if s is None:
            continue
        e = ev.get("DTEND")
        s_iso, all_day = _iso(s.dt, tz)
        if e is not None:
            e_iso, _ = _iso(e.dt, tz)
        elif all_day:
            e_iso = (s.dt + timedelta(days=1)).isoformat()
        else:
            e_iso = s_iso
        events.append(
            {
                "uid": str(ev.get("UID", uuid.uuid4().hex)),
                "title": str(ev.get("SUMMARY", "(bez názvu)"))[:300],
                "location": str(ev.get("LOCATION", ""))[:300],
                "start": s_iso,
                "end": e_iso,
                "all_day": all_day,
            }
        )
    return events


def google_event(item: dict, tz: ZoneInfo) -> dict | None:
    if item.get("status") == "cancelled":
        return None
    s, e = item.get("start", {}), item.get("end", {})
    if "date" in s:
        start, end, all_day = s["date"], e.get("date", s["date"]), True
    elif "dateTime" in s:
        start = _iso(datetime.fromisoformat(s["dateTime"]), tz)[0]
        end = _iso(datetime.fromisoformat(e.get("dateTime", s["dateTime"])), tz)[0]
        all_day = False
    else:
        return None
    return {
        "uid": item.get("id", uuid.uuid4().hex),
        "title": (item.get("summary") or "(bez názvu)")[:300],
        "location": (item.get("location") or "")[:300],
        "start": start,
        "end": end,
        "all_day": all_day,
    }


class CalendarService:
    def __init__(
        self,
        db: Database,
        settings,
        secrets_store: SecretStore,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.db = db
        self.settings = settings
        self.secrets = secrets_store
        self.transport = transport
        self.tz = ZoneInfo(settings.timezone)
        self._pending: dict[str, tuple[str, float]] = {}
        self._tokens: dict[str, tuple[str, float]] = {}
        self._lock = asyncio.Lock()

    def client(self, timeout: float = 15.0) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=self.transport,
            timeout=httpx.Timeout(timeout),
            follow_redirects=True,
            max_redirects=5,
        )

    # --- Google OAuth 2.0 (PKCE) -------------------------------------------

    @property
    def google_configured(self) -> bool:
        return bool(self.settings.google_client_id and self.settings.google_client_secret)

    def google_auth_url(self) -> str:
        if not self.google_configured:
            raise CalendarError(
                "Google Kalendár nie je nastavený (SGH_GOOGLE_CLIENT_ID a "
                "SGH_GOOGLE_CLIENT_SECRET v backend/.env)"
            )
        now = time.monotonic()
        self._pending = {k: v for k, v in self._pending.items() if now - v[1] < 600}
        state = secrets.token_urlsafe(24)
        verifier = secrets.token_urlsafe(48)
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .rstrip(b"=")
            .decode()
        )
        self._pending[state] = (verifier, now)
        params = {
            "client_id": self.settings.google_client_id,
            "redirect_uri": self.settings.google_redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return str(httpx.URL(GOOGLE_AUTH, params=params))

    async def google_finish(self, code: str, state: str) -> str:
        pending = self._pending.pop(state, None)
        if pending is None or time.monotonic() - pending[1] > 600:
            raise CalendarError("Prihlásenie vypršalo alebo je neplatné – skúste znova")
        async with self.client() as c:
            r = await c.post(
                GOOGLE_TOKEN,
                data={
                    "code": code,
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret.get_secret_value(),
                    "redirect_uri": self.settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                    "code_verifier": pending[0],
                },
            )
        if r.status_code != 200:
            raise CalendarError("Google odmietol prihlásenie")
        tok = r.json()
        refresh = tok.get("refresh_token")
        if not refresh:
            raise CalendarError(
                "Google nevrátil obnovovací token – odoberte prístup v nastaveniach účtu Google a "
                "skúste znova"
            )
        sid = "g-" + uuid.uuid4().hex[:10]
        self._tokens[sid] = (
            tok["access_token"],
            time.monotonic() + int(tok.get("expires_in", 3600)) - 60,
        )
        cals = await self._google_get(sid, "/users/me/calendarList")
        items = cals.get("items", [])
        primary = next((i for i in items if i.get("primary")), None)
        account = (primary or {}).get("id", "Google účet")
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO calendar_sources (id, kind, name, account, secret) VALUES (?, "
                "'google', ?, ?, ?)",
                (sid, "Google Kalendár", account, self.secrets.encrypt(refresh)),
            )
            conn.executemany(
                "INSERT INTO calendar_calendars (source_id, cal_id, name, color, selected) VALUES "
                "(?, ?, ?, ?, ?)",
                [
                    (
                        sid,
                        i["id"],
                        i.get("summary", i["id"])[:120],
                        i.get("backgroundColor", ""),
                        int(bool(i.get("primary"))),
                    )
                    for i in items
                ],
            )
        await self.sync_source(sid)
        return sid

    async def _access_token(self, sid: str) -> str:
        cached = self._tokens.get(sid)
        if cached and cached[1] > time.monotonic():
            return cached[0]
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT secret FROM calendar_sources WHERE id = ?", (sid,)
            ).fetchone()
        refresh = self.secrets.decrypt(row["secret"]) if row else None
        if not refresh or not self.google_configured:
            raise CalendarError("Prístup ku Google Kalendáru nie je nastavený")
        async with self.client() as c:
            r = await c.post(
                GOOGLE_TOKEN,
                data={
                    "client_id": self.settings.google_client_id,
                    "client_secret": self.settings.google_client_secret.get_secret_value(),
                    "refresh_token": refresh,
                    "grant_type": "refresh_token",
                },
            )
        if r.status_code != 200:
            raise CalendarError(
                "Prístup ku Google Kalendáru bol zrušený alebo vypršal – prihláste sa znova"
            )
        tok = r.json()
        self._tokens[sid] = (
            tok["access_token"],
            time.monotonic() + int(tok.get("expires_in", 3600)) - 60,
        )
        return tok["access_token"]

    async def _google_get(self, sid: str, path: str, params: dict | None = None) -> dict:
        token = await self._access_token(sid)
        async with self.client() as c:
            r = await c.get(
                GOOGLE_API + path, params=params, headers={"Authorization": f"Bearer {token}"}
            )
        r.raise_for_status()
        return r.json()

    # --- iCal ----------------------------------------------------------------

    async def _fetch_ics(self, url: str) -> bytes:
        async with self.client() as c, c.stream("GET", url) as r:
            if r.status_code != 200:
                raise CalendarError(f"iCal adresa vrátila chybu {r.status_code}")
            data = b""
            async for chunk in r.aiter_bytes():
                data += chunk
                if len(data) > MAX_ICS_BYTES:
                    raise CalendarError("Kalendár je príliš veľký")
        return data

    async def add_ical(self, name: str, url: str) -> str:
        url = url.strip()
        if url.startswith("webcal://"):
            url = "https://" + url[len("webcal://") :]
        try:
            url = validate_stream_url(url)
        except RadioError as exc:
            raise CalendarError(str(exc)) from exc
        start, end = self._window()
        try:  # overenie pred uložením
            parse_ics(await self._fetch_ics(url), start, end, self.tz)
        except httpx.HTTPError as exc:
            raise CalendarError(f"iCal adresa je nedostupná ({exc.__class__.__name__})") from exc
        sid = "i-" + uuid.uuid4().hex[:10]
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO calendar_sources (id, kind, name, secret) VALUES (?, 'ical', ?, ?)",
                (sid, name.strip()[:120] or "iCal kalendár", self.secrets.encrypt(url)),
            )
            conn.execute(
                "INSERT INTO calendar_calendars (source_id, cal_id, name, selected) VALUES (?, "
                "'ical', ?, 1)",
                (sid, name.strip()[:120] or "iCal kalendár"),
            )
        await self.sync_source(sid)
        return sid

    # --- synchronizácia ----------------------------------------------------

    def _window(self) -> tuple[datetime, datetime]:
        now = datetime.now(self.tz).replace(hour=0, minute=0, second=0, microsecond=0)
        return now - timedelta(days=PAST_DAYS), now + timedelta(days=FUTURE_DAYS)

    async def sync_source(self, sid: str) -> None:
        with self.db.connect() as conn:
            src = conn.execute(
                "SELECT id, kind, secret FROM calendar_sources WHERE id = ? AND enabled = 1", (sid,)
            ).fetchone()
            cals = conn.execute(
                "SELECT cal_id FROM calendar_calendars WHERE source_id = ? AND selected = 1", (sid,)
            ).fetchall()
        if src is None:
            return
        start, end = self._window()
        events: list[tuple[str, dict]] = []
        error = None
        try:
            if src["kind"] == "ical":
                url = self.secrets.decrypt(src["secret"])
                if not url:
                    raise CalendarError("iCal adresu nemožno dešifrovať")
                events = [
                    ("ical", e) for e in parse_ics(await self._fetch_ics(url), start, end, self.tz)
                ]
            else:
                for c in cals:
                    page = None
                    while True:
                        params = {
                            "singleEvents": "true",
                            "orderBy": "startTime",
                            "timeMin": start.isoformat(),
                            "timeMax": end.isoformat(),
                            "maxResults": "250",
                        }
                        if page:
                            params["pageToken"] = page
                        data = await self._google_get(
                            sid, f"/calendars/{quote(c['cal_id'], safe='')}/events", params
                        )
                        events += [
                            (c["cal_id"], e)
                            for e in (google_event(i, self.tz) for i in data.get("items", []))
                            if e
                        ]
                        page = data.get("nextPageToken")
                        if not page:
                            break
        except (httpx.HTTPError, CalendarError, ValueError, KeyError) as exc:
            error = (
                str(exc)
                if isinstance(exc, CalendarError)
                else f"Synchronizácia zlyhala ({exc.__class__.__name__})"
            )
            log.warning("Kalendár %s: %s", sid, error)
        now = datetime.now(self.tz).isoformat(timespec="seconds")
        with self.db.connect() as conn:
            if error is None:
                conn.execute("DELETE FROM calendar_events WHERE source_id = ?", (sid,))
                conn.executemany(
                    "INSERT OR REPLACE INTO calendar_events (source_id, cal_id, uid, title, "
                    "location, start, end, all_day) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            sid,
                            cal,
                            e["uid"],
                            e["title"],
                            e["location"],
                            e["start"],
                            e["end"],
                            int(e["all_day"]),
                        )
                        for cal, e in events
                    ],
                )
                conn.execute(
                    "UPDATE calendar_sources SET last_sync = ?, last_ok = ?, last_error = NULL "
                    "WHERE id = ?",
                    (now, now, sid),
                )
            else:
                conn.execute(
                    "UPDATE calendar_sources SET last_sync = ?, last_error = ? WHERE id = ?",
                    (now, error, sid),
                )

    async def sync_all(self) -> None:
        if self._lock.locked():
            return
        async with self._lock:
            with self.db.connect() as conn:
                ids = [
                    r["id"]
                    for r in conn.execute("SELECT id FROM calendar_sources WHERE enabled = 1")
                ]
            for sid in ids:
                await self.sync_source(sid)

    async def run_forever(self) -> None:
        minutes = self.settings.calendar_sync_minutes
        while minutes > 0:
            try:
                await self.sync_all()
            except Exception:  # noqa: BLE001 – synchronizácia nesmie zhodiť server
                log.exception("Synchronizácia kalendárov zlyhala")
            await asyncio.sleep(minutes * 60)
