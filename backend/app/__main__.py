"""Spustenie: ``python -m app`` (z adresára backend/)."""

import logging

import uvicorn

from .config import get_settings


def main() -> None:
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
