"""Lokálna databáza SQLite (štandardná knižnica, bez ORM – nízka pamäťová náročnosť)."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA_VERSION = 3

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    floor INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0
);

-- Zariadenia: config obsahuje iba neutajené parametre (napr. model, IP).
-- Prihlasovacie údaje k zariadeniam patria do .env, nie do databázy v čitateľnej podobe.
CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    adapter TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Internetové rádio: predvoľby, obľúbené, vlastné a z katalógu pridané stanice (v3)
CREATE TABLE IF NOT EXISTS radio_stations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    homepage TEXT NOT NULL DEFAULT '',
    favicon TEXT NOT NULL DEFAULT '',
    countrycode TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    codec TEXT NOT NULL DEFAULT '',
    bitrate INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    favorite INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unknown',
    status_detail TEXT NOT NULL DEFAULT '',
    checked_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Kalendár (v3): zdroje (Google účet / súkromná iCal adresa), vybrané kalendáre, uložené udalosti.
-- `secret` je zašifrovaný (token Google alebo iCal adresa) – nikdy sa neposiela do prehliadača.
CREATE TABLE IF NOT EXISTS calendar_sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    account TEXT NOT NULL DEFAULT '',
    secret TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_sync TEXT,
    last_ok TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS calendar_calendars (
    source_id TEXT NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
    cal_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '',
    selected INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (source_id, cal_id)
);

CREATE TABLE IF NOT EXISTS calendar_events (
    source_id TEXT NOT NULL REFERENCES calendar_sources(id) ON DELETE CASCADE,
    cal_id TEXT NOT NULL,
    uid TEXT NOT NULL,
    title TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, cal_id, uid, start)
);
CREATE INDEX IF NOT EXISTS calendar_events_start ON calendar_events(start);

-- Uložený stav / nastavenia zariadenia (napr. týždenné programy kúrenia, DEMO stav klimatizácie)
CREATE TABLE IF NOT EXISTS device_state (
    device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    username TEXT,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT
);
"""

# Predvolené miestnosti a zariadenia. Pôdorys bytu dodáme neskôr – vtedy sa upravia.
DEFAULT_ROOMS = [
    ("obyvacka", "Obývačka", 0),
    ("kuchyna", "Kuchyňa", 1),
    ("spalna", "Spálňa", 2),
    ("detska", "Detská izba", 3),
    ("pracovna", "Pracovňa", 4),
    ("kupelna", "Kúpeľňa", 5),
    ("chodba", "Chodba", 6),
]

# Okruh kúrenia – pripravené na viac vykurovacích okruhov (heating-2, heating-3 …)
HEATING_CONFIG = {"circuit": 1, "circuit_name": "Vykurovací okruh 1"}

# Schopnosti klimatizácie sú konfigurovateľné – po overení skutočnej jednotky Sinclair
# sa nepodporované funkcie vypnú (napr. "swing_positions": 0, "quiet": false).
AC_CONFIG = {
    "model": "Sinclair",
    "capabilities": {
        "modes": ["auto", "cool", "heat", "fan", "dry"],
        "fan_speeds": 5,
        "swing_positions": 5,
        "quiet": True,
        "eco": True,
        "timer": True,
        "min_temp": 16,
        "max_temp": 30,
        "temp_step": 0.5,
    },
}

DEFAULT_DEVICES: list[tuple[str, str | None, str, str, str, dict]] = [
    ("heating-main", None, "heating", "Kúrenie", "buderus", HEATING_CONFIG),
    ("ac-obyvacka", "obyvacka", "climate", "Klimatizácia obývačka", "sinclair", AC_CONFIG),
    ("light-obyvacka", "obyvacka", "light", "Strop", "generic", {"dimmable": True}),
    ("light-obyvacka-led", "obyvacka", "light", "LED pás", "generic", {"dimmable": True}),
    ("light-kuchyna", "kuchyna", "light", "Strop", "generic", {"dimmable": False}),
    ("light-spalna", "spalna", "light", "Strop", "generic", {"dimmable": True}),
    ("light-detska", "detska", "light", "Strop", "generic", {"dimmable": True}),
    ("light-pracovna", "pracovna", "light", "Strop", "generic", {"dimmable": True}),
    ("light-kupelna", "kupelna", "light", "Strop", "generic", {"dimmable": False}),
    ("light-chodba", "chodba", "light", "Strop", "generic", {"dimmable": False}),
    ("blind-obyvacka", "obyvacka", "blind", "Žalúzie obývačka", "generic", {}),
    ("blind-kuchyna", "kuchyna", "blind", "Žalúzie kuchyňa", "generic", {}),
    ("blind-spalna", "spalna", "blind", "Žalúzie spálňa", "generic", {}),
    ("blind-detska", "detska", "blind", "Žalúzie detská", "generic", {}),
    ("blind-pracovna", "pracovna", "blind", "Žalúzie pracovňa", "generic", {}),
    ("cam-vstup", None, "camera", "Vstup", "tapo", {"model": "C310"}),
    ("cam-zahrada", None, "camera", "Záhrada", "tapo", {"model": "C310"}),
    ("intercom", None, "intercom", "Videovrátnik", "generic", {}),
]


class Database:
    def __init__(self, path: Path | str):
        self.path = str(path)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init(self) -> None:
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
            row = conn.execute("SELECT version FROM schema_version").fetchone()
            if row is None:
                conn.execute("INSERT INTO schema_version (version) VALUES (?)", (SCHEMA_VERSION,))
                self._seed(conn)
            else:
                if row["version"] < 2:
                    self._migrate_v2(conn)
                if row["version"] < 3:
                    self._migrate_v3(conn)

    @staticmethod
    def _seed(conn: sqlite3.Connection) -> None:
        conn.executemany("INSERT INTO rooms (id, name, sort) VALUES (?, ?, ?)", DEFAULT_ROOMS)
        conn.executemany(
            "INSERT INTO devices (id, room_id, kind, name, adapter, config, sort) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (d[0], d[1], d[2], d[3], d[4], json.dumps(d[5]), i)
                for i, d in enumerate(DEFAULT_DEVICES)
            ],
        )
        Database._seed_radio(conn)

    @staticmethod
    def _migrate_v2(conn: sqlite3.Connection) -> None:
        """v1 → v2: konfigurácia okruhu kúrenia a schopností klimatizácie (iba ak je prázdna)."""
        for device_id, config in (("heating-main", HEATING_CONFIG), ("ac-obyvacka", AC_CONFIG)):
            conn.execute(
                "UPDATE devices SET config = ? WHERE id = ? AND config = '{}'",
                (json.dumps(config), device_id),
            )
        conn.execute("UPDATE schema_version SET version = 2")

    @staticmethod
    def _seed_radio(conn: sqlite3.Connection) -> None:
        from .radio import PRESETS

        conn.executemany(
            "INSERT OR IGNORE INTO radio_stations "
            "(id, name, url, homepage, countrycode, source, sort) "
            "VALUES (?, ?, ?, ?, 'SK', 'preset', ?)",
            [(p["id"], p["name"], p["urls"][0], p["homepage"], i) for i, p in enumerate(PRESETS)],
        )

    @staticmethod
    def _migrate_v3(conn: sqlite3.Connection) -> None:
        """v2 → v3: tabuľky rádia a kalendára (vytvorí SCHEMA), slovenské predvoľby rádií."""
        Database._seed_radio(conn)
        conn.execute("UPDATE schema_version SET version = 3")

    # --- Nastavenia (kľúč → JSON) -------------------------------------------

    def get_setting(self, key: str, default=None):
        with self.connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return json.loads(row["value"]) if row else default

    def set_setting(self, key: str, value) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value, ensure_ascii=False)),
            )

    # --- Uložený stav zariadení ------------------------------------------

    def load_state(self, device_id: str) -> dict | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT state FROM device_state WHERE device_id = ?", (device_id,)
            ).fetchone()
        return json.loads(row["state"]) if row else None

    def save_state(self, device_id: str, state: dict) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO device_state (device_id, state, updated_at) "
                "VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(device_id) DO UPDATE SET state = excluded.state, "
                "updated_at = excluded.updated_at",
                (device_id, json.dumps(state, ensure_ascii=False)),
            )

    # --- Pomocné dotazy -------------------------------------------------

    def rooms(self) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute("SELECT id, name, floor FROM rooms ORDER BY sort").fetchall()
        return [dict(r) for r in rows]

    def devices(self, kind: str | None = None) -> list[dict]:
        sql = (
            "SELECT d.id, d.room_id, r.name AS room_name, d.kind, d.name, d.adapter, d.config "
            "FROM devices d LEFT JOIN rooms r ON r.id = d.room_id WHERE d.enabled = 1"
        )
        params: tuple = ()
        if kind:
            sql += " AND d.kind = ?"
            params = (kind,)
        sql += " ORDER BY d.sort"
        with self.connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        result = []
        for r in rows:
            item = dict(r)
            item["config"] = json.loads(item["config"] or "{}")
            result.append(item)
        return result

    def device(self, device_id: str) -> dict | None:
        return next((d for d in self.devices() if d["id"] == device_id), None)

    def audit(self, username: str | None, action: str, target: str | None, detail: dict) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO audit_log (username, action, target, detail) VALUES (?, ?, ?, ?)",
                (username, action, target, json.dumps(detail, ensure_ascii=False)),
            )
