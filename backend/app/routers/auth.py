from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ..auth import (
    COOKIE_NAME,
    CSRF_HEADER,
    LOOPBACK_HOSTS,
    AuthService,
    client_ip,
    get_auth,
    require_user,
)
from ..models import LoginRequest, SetupRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _require_csrf(request: Request) -> None:
    if request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chýba ochranná hlavička požiadavky")


def _set_cookie(request: Request, response: Response, token: str) -> None:
    settings = request.app.state.settings
    response.set_cookie(
        COOKIE_NAME,
        token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        samesite="strict",
        secure=settings.cookie_secure,
        path="/",
    )


@router.get("/status")
def auth_status(request: Request, auth: AuthService = Depends(get_auth)) -> dict:
    user = auth.user_for_token(request.cookies.get(COOKIE_NAME))
    ip = client_ip(request)
    return {
        "setup_required": not auth.has_users(),
        "setup_allowed_here": ip in LOOPBACK_HOSTS or request.app.state.settings.allow_remote_setup,
        "user": user.model_dump() if user else None,
    }


@router.post("/setup", dependencies=[Depends(_require_csrf)])
def setup(
    body: SetupRequest,
    request: Request,
    response: Response,
    auth: AuthService = Depends(get_auth),
) -> UserOut:
    """Vytvorenie prvého účtu. Povolené iba ak ešte žiadny účet neexistuje a iba lokálne."""
    if auth.has_users():
        raise HTTPException(status.HTTP_409_CONFLICT, "Účet už existuje")
    ip = client_ip(request)
    if ip not in LOOPBACK_HOSTS and not request.app.state.settings.allow_remote_setup:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Prvý účet je možné vytvoriť iba priamo na zariadení (localhost) alebo cez CLI",
        )
    auth.create_user(body.username, body.password)
    request.app.state.db.audit(body.username, "setup", None, {"ip": ip})
    _set_cookie(request, response, auth.create_session(body.username))
    return UserOut(username=body.username, role="admin")


@router.post("/login", dependencies=[Depends(_require_csrf)])
def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    auth: AuthService = Depends(get_auth),
) -> UserOut:
    ip = client_ip(request)
    if auth.limiter.blocked(ip):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Príliš veľa pokusov, skúste to o 5 minút"
        )
    user = auth.authenticate(body.username, body.password)
    if user is None:
        auth.limiter.fail(ip)
        request.app.state.db.audit(body.username, "login_failed", None, {"ip": ip})
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nesprávne meno alebo heslo")
    auth.limiter.reset(ip)
    request.app.state.db.audit(user.username, "login", None, {"ip": ip})
    _set_cookie(request, response, auth.create_session(user.username))
    return user


@router.post("/logout")
def logout(
    request: Request,
    response: Response,
    user: UserOut = Depends(require_user),
    auth: AuthService = Depends(get_auth),
) -> dict:
    auth.revoke(request.cookies.get(COOKIE_NAME))
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}
