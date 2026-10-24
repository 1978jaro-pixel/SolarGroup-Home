"""Lokálna databáza SQLite (štandardná knižnica, bez ORM – nízka pamäťová náročnosť)."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA_VERSION = 1

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

DEFAULT_DEVICES: list[tuple[str, str | None, str, str, str, dict]] = [
    ("heating-main", None, "heating", "Kúrenie", "buderus", {}),
    ("ac-obyvacka", "obyvacka", "climate", "Klimatizácia obývačka", "sinclair", {}),
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
