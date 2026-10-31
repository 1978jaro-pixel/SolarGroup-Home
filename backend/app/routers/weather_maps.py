"""API radaru zrážok a mapového podkladu pre Počasie → Radar (načítava sa až po otvorení)."""

from fastapi import APIRouter, Depends, HTTPException, Path, Request, Response

from ..auth import require_user
from ..weather_maps import RADAR_TILE_TTL, MapError, WeatherMaps

router = APIRouter(prefix="/api/weather", tags=["weather"], dependencies=[Depends(require_user)])


def get_maps(request: Request) -> WeatherMaps:
    return request.app.state.maps


def _err(exc: MapError) -> HTTPException:
    return HTTPException(exc.status, str(exc))


def _png(data: bytes, max_age: int) -> Response:
    return Response(
        data, media_type="image/png", headers={"Cache-Control": f"private, max-age={max_age}"}
    )


@router.get("/radar/frames")
async def radar_frames(maps: WeatherMaps = Depends(get_maps)) -> dict:
    try:
        return await maps.frames()
    except MapError as exc:
        raise _err(exc) from exc


@router.get("/radar/{ts}/{z}/{x}/{y}.png")
async def radar_tile(
    ts: int = Path(ge=0),
    z: int = Path(ge=0, le=20),
    x: int = Path(ge=0),
    y: int = Path(ge=0),
    maps: WeatherMaps = Depends(get_maps),
) -> Response:
    try:
        return _png(await maps.radar_tile(ts, z, x, y), RADAR_TILE_TTL)
    except MapError as exc:
        raise _err(exc) from exc


@router.get("/map/{z}/{x}/{y}.png")
async def map_tile(
    z: int = Path(ge=0, le=20),
    x: int = Path(ge=0),
    y: int = Path(ge=0),
    maps: WeatherMaps = Depends(get_maps),
) -> Response:
    try:
        return _png(await maps.map_tile(z, x, y), 7 * 86400)
    except MapError as exc:
        raise _err(exc) from exc
