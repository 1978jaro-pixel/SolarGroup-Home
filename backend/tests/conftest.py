import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

CSRF = {"X-SGH-Request": "1"}
PASSWORD = "velmi-tajne-heslo"


def make_client(tmp_path, client_ip="127.0.0.1", **overrides) -> TestClient:
    settings = Settings(
        _env_file=None,
        data_dir=tmp_path,
        frontend_dist=tmp_path / "no-dist",
        weather_enabled=False,
        **overrides,
    )
    return TestClient(create_app(settings), client=(client_ip, 50000))


@pytest.fixture
def client(tmp_path):
    with make_client(tmp_path) as c:
        yield c


@pytest.fixture
def authed(client):
    body = {"username": "jaro", "password": PASSWORD}
    r = client.post("/api/auth/setup", json=body, headers=CSRF)
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def live_client(tmp_path):
    with make_client(tmp_path, mode="live") as c:
        r = c.post("/api/auth/setup", json={"username": "jaro", "password": PASSWORD}, headers=CSRF)
        assert r.status_code == 200
        yield c
