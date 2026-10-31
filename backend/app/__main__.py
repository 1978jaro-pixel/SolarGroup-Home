"""Spustenie: ``python -m app`` (z adresára backend/)."""

import ctypes
import ctypes.util
import logging

import uvicorn

from .config import get_settings


def _limit_malloc_arenas(n: int = 2) -> None:
    """Obmedzí počet pamäťových arén glibc (M_ARENA_MAX) – na Pi s 1 GB RAM šetrí ~30 MB.

    Každé vlákno obsluhy požiadaviek by inak dostalo vlastnú arénu (po 8 na jadro). Musí
    sa volať pred vytvorením vlákien; mimo glibc (Windows, macOS) sa nič nedeje.
    """
    try:
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6")
        libc.mallopt(-8, n)  # M_ARENA_MAX
    except (OSError, AttributeError):
        pass


def main() -> None:
    _limit_malloc_arenas()
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    s = get_settings()
    if s.host not in ("127.0.0.1", "localhost", "::1"):
        logging.getLogger("solargroup_home").warning(
            "Server počúva na %s – je dostupný z lokálnej siete. "
            "Nepresmerúvajte tento port do internetu.",
            s.host,
        )
    uvicorn.run("app.main:create_app", factory=True, host=s.host, port=s.port, proxy_headers=False)


if __name__ == "__main__":
    main()
