"""Šifrované ukladanie tajomstiev (obnovovací token Google, súkromná iCal adresa).

Kľúč (Fernet, AES-128-CBC + HMAC) je v súbore ``secret.key`` v dátovom adresári s právami 0600,
čitateľný iba používateľom služby. Chráni pred únikom tajomstiev zo zálohy databázy alebo z logov;
pri plnom prístupe k zariadeniu (microSD karta) však kľúč leží vedľa databázy – nejde o hardvérovú
ochranu (pozri docs/V0_3_0_AUDIT_A_PLAN.md, kapitola 6).
"""

import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


class SecretStore:
    def __init__(self, data_dir: Path):
        self.key_path = data_dir / "secret.key"
        self._fernet: Fernet | None = None

    def _f(self) -> Fernet:
        if self._fernet is None:
            if not self.key_path.exists():
                self.key_path.parent.mkdir(parents=True, exist_ok=True)
                fd = os.open(self.key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "wb") as f:
                    f.write(Fernet.generate_key())
            self._fernet = Fernet(self.key_path.read_bytes().strip())
        return self._fernet

    def encrypt(self, value: str) -> str:
        return self._f().encrypt(value.encode()).decode()

    def decrypt(self, token: str) -> str | None:
        if not token:
            return None
        try:
            return self._f().decrypt(token.encode()).decode()
        except InvalidToken:
            return None
