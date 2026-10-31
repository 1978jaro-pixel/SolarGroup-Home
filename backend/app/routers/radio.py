"""API internetového rádia. Prehrávanie prebieha v prehliadači (kiosku); backend spravuje stanice,
katalóg, overovanie streamov, logá a posledný stav (stanica, hlasitosť). Nič sa nespúšťa samo.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ..auth import require_user
from ..db import Database
from ..deps import get_db
from ..radio import RadioError, RadioService, new_custom_id, validate_stream_url

router = APIRouter(prefix="/api/radio", tags=["radio"], dependencies=[Depends(require_user)])

SELECT_STATION = (
    "SELECT id, name, url, homepage, favicon, countrycode, tags, codec, bitrate, source, favorite, "
    "sort, status, status_detail, checked_at FROM radio_stations"
)


def get_radio(request: Request) -> RadioService:
    return request.app.state.radio


def _bad(exc: RadioError) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))


def _row(r) -> dict:
    d = dict(r)
    d["favorite"] = bool(d["favorite"])
    d["tags"] = [t for t in d["tags"].split(",") if t]
    d["logo"] = f"/api/radio/logo/{d['id']}" if d["favicon"] else None
    return d


def _station(db: Database, sid: str) -> dict:
    with db.connect() as conn:
        r = conn.execute(SELECT_STATION + " WHERE id = ?", (sid,)).fetchone()
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stanica neexistuje")
    return _row(r)


class StationIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=8, max_length=2000)
    id: str | None = Field(default=None, max_length=60)  # rb-<uuid> pri stanici z katalógu
    homepage: str = Field(default="", max_length=500)
    favicon: str = Field(default="", max_length=500)
    countrycode: str = Field(default="", max_length=2)
    tags: list[str] = Field(default_factory=list, max_length=10)
    codec: str = Field(default="", max_length=10)
    bitrate: int = Field(default=0, ge=0, le=10000)
    favorite: bool = True


class StationPatch(BaseModel):
    favorite: bool | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)


class CheckIn(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class RadioState(BaseModel):
    station_id: str | None = Field(default=None, max_length=60)
    volume: float = Field(default=0.6, ge=0, le=1)


@router.get("/stations")
def stations(db: Database = Depends(get_db)) -> list[dict]:
    with db.connect() as conn:
        rows = conn.execute(
            SELECT_STATION + " ORDER BY source = 'preset' DESC, sort, name COLLATE NOCASE"
        ).fetchall()
    return [_row(r) for r in rows]


@router.post("/stations")
def add_station(body: StationIn, db: Database = Depends(get_db)) -> dict:
    try:
        url = validate_stream_url(body.url)
    except RadioError as exc:
        raise _bad(exc) from exc
    sid = body.id if body.id and body.id.startswith("rb-") else new_custom_id()
    source = "catalog" if sid.startswith("rb-") else "custom"
    with db.connect() as conn:
        dup = conn.execute(
            "SELECT id FROM radio_stations WHERE url = ? OR id = ?", (url, sid)
        ).fetchone()
        if dup:
            conn.execute("UPDATE radio_stations SET favorite = 1 WHERE id = ?", (dup["id"],))
            sid = dup["id"]
        else:
            conn.execute(
                "INSERT INTO radio_stations (id, name, url, homepage, favicon, countrycode, tags, "
                "codec, bitrate, source, favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    sid,
                    body.name.strip(),
                    url,
                    body.homepage,
                    body.favicon,
                    body.countrycode.upper(),
                    ",".join(body.tags),
                    body.codec.upper(),
                    body.bitrate,
                    source,
                    int(body.favorite),
                ),
            )
    return _station(db, sid)


@router.patch("/stations/{sid}")
def patch_station(sid: str, body: StationPatch, db: Database = Depends(get_db)) -> dict:
    _station(db, sid)
    with db.connect() as conn:
        if body.favorite is not None:
            conn.execute(
                "UPDATE radio_stations SET favorite = ? WHERE id = ?", (int(body.favorite), sid)
            )
        if body.name is not None:
            conn.execute(
                "UPDATE radio_stations SET name = ? WHERE id = ?", (body.name.strip(), sid)
            )
    return _station(db, sid)


@router.delete("/stations/{sid}")
def delete_station(sid: str, db: Database = Depends(get_db)) -> dict:
    st = _station(db, sid)
    if st["source"] == "preset":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Predvolenú stanicu nemožno odstrániť – môžete ju odobrať z obľúbených",
        )
    with db.connect() as conn:
        conn.execute("DELETE FROM radio_stations WHERE id = ?", (sid,))
    if db.get_setting("radio.state", {}).get("station_id") == sid:
        db.set_setting("radio.state", {**db.get_setting("radio.state", {}), "station_id": None})
    return {"ok": True}


@router.post("/stations/{sid}/check")
async def check_station(
    sid: str, db: Database = Depends(get_db), radio: RadioService = Depends(get_radio)
) -> dict:
    st = _station(db, sid)
    try:
        res = await radio.check(st["url"])
    except RadioError as exc:
        raise _bad(exc) from exc
    with db.connect() as conn:
        conn.execute(
            "UPDATE radio_stations SET status = ?, status_detail = ?, "
            "codec = COALESCE(NULLIF(?, ''), codec), checked_at = datetime('now') WHERE id = ?",
            (res.status, res.detail, res.codec or "", sid),
        )
    return _station(db, sid)


@router.post("/check")
async def check_url(body: CheckIn, radio: RadioService = Depends(get_radio)) -> dict:
    try:
        return (await radio.check(body.url)).as_dict()
    except RadioError as exc:
        raise _bad(exc) from exc


@router.get("/search")
async def search(
    q: str = "",
    country: str = "",
    tag: str = "",
    language: str = "",
    limit: int = 40,
    radio: RadioService = Depends(get_radio),
) -> list[dict]:
    try:
        rows = await radio.search(q, country, tag, language, limit)
    except RadioError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return [{**s, "logo": f"/api/radio/logo/{s['id']}" if s["favicon"] else None} for s in rows]


@router.get("/state")
def get_state(db: Database = Depends(get_db)) -> RadioState:
    return RadioState(**db.get_setting("radio.state", {}))


@router.put("/state")
def put_state(body: RadioState, db: Database = Depends(get_db)) -> RadioState:
    db.set_setting("radio.state", body.model_dump())
    return body


@router.get("/logo/{sid}")
async def logo(
    sid: str, db: Database = Depends(get_db), radio: RadioService = Depends(get_radio)
) -> Response:
    with db.connect() as conn:
        r = conn.execute("SELECT favicon FROM radio_stations WHERE id = ?", (sid,)).fetchone()
    favicon = r["favicon"] if r else (radio.known.get(sid) or {}).get("favicon", "")
    res = await radio.logo(favicon)
    if res is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Logo nie je k dispozícii")
    data, ctype = res
    return Response(
        data,
        media_type=ctype,
        headers={
            "Cache-Control": "private, max-age=604800",
            "Content-Security-Policy": "default-src 'none'",
        },
    )
