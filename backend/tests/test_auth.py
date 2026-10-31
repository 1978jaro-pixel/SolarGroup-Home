from app.auth import hash_password, verify_password

from .conftest import CSRF, PASSWORD, make_client


def test_password_hashing():
    h = hash_password("abc-def-ghi")
    assert h.startswith("scrypt$")
    assert verify_password("abc-def-ghi", h)
    assert not verify_password("zle", h)
    assert not verify_password("abc", "nezmysel")


def test_health_is_public(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["mode"] == "demo"
    assert r.headers["x-frame-options"] == "DENY"


def test_everything_else_requires_login(client):
    for path in ("/api/energy/snapshot", "/api/heating", "/api/lights", "/api/system"):
        assert client.get(path).status_code == 401, path
    r = client.post("/api/lights/light-kuchyna", json={"on": True}, headers=CSRF)
    assert r.status_code == 401


def test_setup_then_login_logout(client):
    st = client.get("/api/auth/status").json()
    assert st["setup_required"] and st["setup_allowed_here"]

    body = {"username": "jaro", "password": PASSWORD}
    assert client.post("/api/auth/setup", json=body).status_code == 403  # bez CSRF hlavičky
    assert client.post("/api/auth/setup", json=body, headers=CSRF).status_code == 200
    assert client.post("/api/auth/setup", json=body, headers=CSRF).status_code == 409
    assert client.get("/api/energy/snapshot").status_code == 200

    assert client.post("/api/auth/logout", headers=CSRF).status_code == 200
    assert client.get("/api/energy/snapshot").status_code == 401

    bad = {"username": "jaro", "password": "nespravne-heslo"}
    assert client.post("/api/auth/login", json=bad, headers=CSRF).status_code == 401
    assert client.post("/api/auth/login", json=body, headers=CSRF).status_code == 200
    assert client.get("/api/auth/status").json()["user"]["username"] == "jaro"


def test_short_password_rejected(client):
    body = {"username": "jaro", "password": "kratke"}
    r = client.post("/api/auth/setup", json=body, headers=CSRF)
    assert r.status_code == 422


def test_remote_setup_forbidden(tmp_path):
    with make_client(tmp_path, client_ip="192.168.1.20") as c:
        assert c.get("/api/auth/status").json()["setup_allowed_here"] is False
        body = {"username": "jaro", "password": PASSWORD}
        assert c.post("/api/auth/setup", json=body, headers=CSRF).status_code == 403


def test_login_rate_limit(authed):
    authed.post("/api/auth/logout", headers=CSRF)
    bad = {"username": "jaro", "password": "nespravne-heslo"}
    codes = [authed.post("/api/auth/login", json=bad, headers=CSRF).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5 and codes[5] == 429


def test_mutation_requires_csrf_header(authed):
    r = authed.post("/api/lights/light-kuchyna", json={"on": True})
    assert r.status_code == 403


def test_websocket_requires_login(client):
    from starlette.websockets import WebSocketDisconnect

    try:
        with client.websocket_connect("/api/ws") as ws:
            ws.receive_json()
        raise AssertionError("websocket nemal byť povolený")
    except WebSocketDisconnect as exc:
        assert exc.code == 4401
