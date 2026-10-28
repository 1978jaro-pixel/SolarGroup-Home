"""Správa z príkazového riadku.

python -m app.cli create-user <meno>
python -m app.cli set-password <meno>
python -m app.cli radio-check [--favorites] [--fix] [--url URL] [--search NÁZOV --country SK]
"""

import argparse
import asyncio
import getpass
import sys

from .auth import AuthService
from .config import get_settings
from .db import Database


def _ask_password() -> str:
    pw = getpass.getpass("Heslo (min. 10 znakov): ")
    if len(pw) < 10:
        sys.exit("Heslo je príliš krátke.")
    if pw != getpass.getpass("Heslo znova: "):
        sys.exit("Heslá sa nezhodujú.")
    return pw


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name in ("create-user", "set-password"):
        sub.add_parser(name).add_argument("username")
    rc = sub.add_parser(
        "radio-check", help="overí streamy rádií (spúšťa sa na Pi alebo PC s internetom)"
    )
    rc.add_argument("--favorites", action="store_true", help="overiť aj obľúbené a vlastné stanice")
    rc.add_argument(
        "--fix",
        action="store_true",
        help="nefunkčnú predvoľbu nahradiť funkčnou stanicou z katalógu",
    )
    rc.add_argument("--url", help="overiť jednu adresu (nič sa neukladá)")
    rc.add_argument("--search", help="vyhľadať v katalógu Radio Browser a overiť výsledky")
    rc.add_argument("--country", default="", help="kód krajiny pre --search, napr. SK, CZ, AT")
    rc.add_argument("--limit", type=int, default=10)
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.db_path)
    db.init()
    if args.cmd == "radio-check":
        sys.exit(asyncio.run(_radio_check(db, settings.data_path, args)))
    auth = AuthService(db, settings.session_hours)

    if args.cmd == "create-user":
        auth.create_user(args.username, _ask_password())
        print(f"Účet {args.username} vytvorený.")
    elif not auth.set_password(args.username, _ask_password()):
        sys.exit("Účet neexistuje.")
    else:
        print("Heslo zmenené, všetky relácie boli odhlásené.")


async def _radio_check(db: Database, data_dir, args) -> int:
    """Výpis: stav, kodek, názov, poznámka. Návratový kód 0 = všetko overené stanice fungujú."""
    from .radio import PRESETS, RadioError, RadioService

    svc = RadioService(data_dir)
    rows = []

    async def check(name: str, url: str):
        try:
            res = await svc.check(url)
        except RadioError as exc:
            return name, "unavailable", None, str(exc), url
        return name, res.status, res.codec, res.detail, res.url

    if args.url:
        rows.append(await check(args.url, args.url))
    elif args.search:
        try:
            found = await svc.search(args.search, args.country, limit=args.limit)
        except RadioError as exc:
            print(exc)
            return 2
        for s in found:
            rows.append(await check(f"{s['name']} [{s['countrycode']}]", s["url"]))
    else:
        sql = "SELECT id, name, url, source FROM radio_stations WHERE source = 'preset'"
        if args.favorites:
            sql += " OR favorite = 1 OR source != 'preset'"
        with db.connect() as conn:
            stations = conn.execute(sql).fetchall()
        presets = {p["id"]: p for p in PRESETS}
        for st in stations:
            name, status, codec, detail, url = await check(st["name"], st["url"])
            if status != "ok" and args.fix and st["id"] in presets:
                try:
                    cands = await svc.search(presets[st["id"]]["search"], "SK", limit=5)
                except RadioError:
                    cands = []
                for c in cands:
                    n2, s2, c2, d2, u2 = await check(c["name"], c["url"])
                    if s2 == "ok":
                        with db.connect() as conn:
                            conn.execute(
                                "UPDATE radio_stations SET url = ? WHERE id = ?",
                                (c["url"], st["id"]),
                            )
                        status, codec, detail, url = s2, c2, f"opravené z katalógu ({n2})", u2
                        break
            with db.connect() as conn:
                conn.execute(
                    "UPDATE radio_stations SET status = ?, status_detail = ?, "
                    "codec = COALESCE(NULLIF(?, ''), codec), checked_at = datetime('now') "
                    "WHERE id = ?",
                    (status, detail, codec or "", st["id"]),
                )
            rows.append((name, status, codec, detail, url))
    labels = {"ok": "OK", "unavailable": "NEDOSTUPNÁ", "unsupported": "NEPODPOROVANÁ"}
    for name, status, codec, detail, url in rows:
        print(f"{labels.get(status, status):14} {codec or '-':5} {name[:34]:34} {detail}  <{url}>")
    bad = sum(1 for r in rows if r[1] != "ok")
    print(f"\nSpolu {len(rows)}, funkčných {len(rows) - bad}, nefunkčných {bad}.")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    main()
