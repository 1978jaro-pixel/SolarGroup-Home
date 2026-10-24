"""Správa účtov z príkazového riadku.

python -m app.cli create-user <meno>
python -m app.cli set-password <meno>
"""

import argparse
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
    args = parser.parse_args(argv)

    settings = get_settings()
    db = Database(settings.db_path)
    db.init()
    auth = AuthService(db, settings.session_hours)

    if args.cmd == "create-user":
        auth.create_user(args.username, _ask_password())
        print(f"Účet {args.username} vytvorený.")
    elif not auth.set_password(args.username, _ask_password()):
        sys.exit("Účet neexistuje.")
    else:
        print("Heslo zmenené, všetky relácie boli odhlásené.")


if __name__ == "__main__":
    main()
