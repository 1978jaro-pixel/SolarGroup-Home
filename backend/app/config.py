"""Konfigurácia aplikácie.

Všetky nastavenia sa načítavajú z premenných prostredia (prefix ``SGH_``) alebo
z lokálneho súboru ``backend/.env``. Žiadne heslá ani kľúče nie sú v zdrojovom kóde.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SGH_",
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    mode: Literal["demo", "live"] = "demo"
    # Predvolene iba loopback – žiadne automatické sprístupnenie do siete.
    host: str = "127.0.0.1"
    port: int = 8080
    data_dir: Path = Path("data")

    session_hours: int = 12
    cookie_secure: bool = False
    # Prvotné vytvorenie účtu cez web je povolené iba z tohto počítača.
    allow_remote_setup: bool = False

    stale_after_seconds: int = 120

    solargroup_url: str | None = None
    solargroup_token: SecretStr | None = None

    weather_enabled: bool = True
    weather_lat: float = 49.2231
    weather_lon: float = 18.7394

    frontend_dist: Path = PROJECT_DIR / "frontend" / "dist"

    @property
    def data_path(self) -> Path:
        path = self.data_dir if self.data_dir.is_absolute() else BACKEND_DIR / self.data_dir
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def db_path(self) -> Path:
        return self.data_path / "solargroup-home.sqlite3"


@lru_cache
def get_settings() -> Settings:
    return Settings()
