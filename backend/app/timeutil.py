"""Lokálny čas domácnosti (predvolene Europe/Bratislava, vrátane letného a zimného času)."""

from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from zoneinfo import ZoneInfo

DEFAULT_TZ = "Europe/Bratislava"


@lru_cache
def zone(name: str = DEFAULT_TZ) -> ZoneInfo:
    return ZoneInfo(name)


def now_in(tz: ZoneInfo) -> datetime:
    return datetime.now(UTC).astimezone(tz)


def parse_hhmm(value: str) -> time:
    h, m = value.split(":")
    return time(int(h), int(m))


def combine_local(day: date, hhmm: str, tz: ZoneInfo) -> datetime:
    """Miestny „nástenný“ čas → časovo uvedomelý datetime.

    Neexistujúci čas pri prechode na letný čas (napr. 02:30) sa posunie dopredu (03:30),
    pri nejednoznačnom čase na jeseň sa použije prvý výskyt.
    """
    naive = datetime.combine(day, parse_hhmm(hhmm))
    return naive.replace(tzinfo=tz).astimezone(UTC).astimezone(tz)


def next_occurrence(hhmm: str, now: datetime) -> datetime:
    """Najbližší výskyt času HH:MM po ``now`` (v jeho časovom pásme)."""
    tz = now.tzinfo
    assert isinstance(tz, ZoneInfo)
    candidate = combine_local(now.date(), hhmm, tz)
    if candidate <= now:
        candidate = combine_local(now.date() + timedelta(days=1), hhmm, tz)
    return candidate
