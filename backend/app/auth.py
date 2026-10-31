"""Autentifikácia: heslá (scrypt), relácie v SQLite, HttpOnly cookie a ochrana proti CSRF.

Pravidlá:
* ovládanie zariadení aj čítanie stavu vyžaduje prihlásenie,
* meniace požiadavky (POST/PUT/PATCH/DELETE) musia niesť hlavičku ``X-SGH-Request: 1``
  – prehliadač ju z cudzej stránky bez CORS povolenia neodošle,
* cookie má SameSite=Strict a HttpOnly.
"""

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, WebSocket, status

from .db import Database
from .models import UserOut

COOKIE_NAME = "sgh_session"
CSRF_HEADER = "x-sgh-request"
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1  # ~16 MB RAM – vhodné aj pre Pi 4 / 1 GB


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_hex, digest_hex = stored.split("$")
        if algo != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(digest_hex) // 2,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LoginLimiter:
    """Jednoduché obmedzenie počtu neúspešných pokusov o prihlásenie podľa IP."""

    def __init__(self, max_failures: int = 5, window_s: int = 300):
        self.max_failures = max_failures
        self.window_s = window_s
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str) -> deque[float]:
        q = self._failures[key]
        now = time.monotonic()
        while q and now - q[0] > self.window_s:
            q.popleft()
        return q

    def blocked(self, key: str) -> bool:
        return len(self._prune(key)) >= self.max_failures

    def fail(self, key: str) -> None:
        self._prune(key).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


class AuthService:
    def __init__(self, db: Database, session_hours: int):
        self.db = db
        self.session_hours = session_hours
        self.limiter = LoginLimiter()

    def has_users(self) -> bool:
        with self.db.connect() as conn:
            return conn.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None

    def create_user(self, username: str, password: str, role: str = "admin") -> None:
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                (username, hash_password(password), role),
            )

    def set_password(self, username: str, password: str) -> bool:
        with self.db.connect() as conn:
            cur = conn.execute(
                "UPDATE users SET password_hash = ? WHERE username = ?",
                (hash_password(password), username),
            )
            conn.execute(
                "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)",
                (username,),
            )
            return cur.rowcount > 0

    def authenticate(self, username: str, password: str) -> UserOut | None:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT username, password_hash, role FROM users WHERE username = ?", (username,)
            ).fetchone()
        if row is None:
            # Rovnaká časová náročnosť aj pre neexistujúceho používateľa.
            verify_password(password, hash_password("dummy-password"))
            return None
        if not verify_password(password, row["password_hash"]):
            return None
        return UserOut(username=row["username"], role=row["role"])

    def create_session(self, username: str) -> str:
        token = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        with self.db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now.isoformat(),))
            conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) "
                "SELECT ?, id, ?, ? FROM users WHERE username = ?",
                (
                    _token_hash(token),
                    now.isoformat(),
                    (now + timedelta(hours=self.session_hours)).isoformat(),
                    username,
                ),
            )
        return token

    def user_for_token(self, token: str | None) -> UserOut | None:
        if not token:
            return None
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT u.username, u.role, s.expires_at FROM sessions s "
                "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
                (_token_hash(token),),
            ).fetchone()
        if row is None or datetime.fromisoformat(row["expires_at"]) < datetime.now(UTC):
            return None
        return UserOut(username=row["username"], role=row["role"])

    def revoke(self, token: str | None) -> None:
        if token:
            with self.db.connect() as conn:
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))


def get_auth(request: Request) -> AuthService:
    return request.app.state.auth


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def require_user(request: Request, auth: AuthService = Depends(get_auth)) -> UserOut:
    user = auth.user_for_token(request.cookies.get(COOKIE_NAME))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Vyžaduje sa prihlásenie")
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chýba ochranná hlavička požiadavky")
    return user


def websocket_user(websocket: WebSocket) -> UserOut | None:
    auth: AuthService = websocket.app.state.auth
    return auth.user_for_token(websocket.cookies.get(COOKIE_NAME))
