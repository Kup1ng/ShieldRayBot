"""Usage over time of one customer service, for the Mini App usage chart.

One PasarGuard read per window (``/api/user/by-id/{id}/usage``), summed into local Tehran
hours (today) or days (last week, last month). Periods without traffic count as zero, so a week
always has seven points whatever the panel left out.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Protocol, TypedDict

from app.services.dashboard_trend import TEHRAN
from app.services.formatting import format_bytes

UsageRange = Literal["today", "week", "month"]
USAGE_RANGES: tuple[UsageRange, ...] = ("today", "week", "month")
DEFAULT_USAGE_RANGE: UsageRange = "week"
# The chart is a glance, not a meter: a minute-old read is fine and spares the panel.
USAGE_CACHE_MAX_AGE_SEC = 60.0
_DAYS_BACK: dict[UsageRange, int] = {"today": 0, "week": 6, "month": 29}


class UsageReader(Protocol):
    async def get_user_usage(
        self, user_id: int, *, period: str, start: datetime, end: datetime, cache_max_age: float | None = None
    ) -> Any: ...


class UsagePoint(TypedDict):
    at: str
    bytes: int


class UsageSeries(TypedDict):
    range: UsageRange
    period: str
    points: list[UsagePoint]
    total_bytes: int
    total_text: str


@dataclass(frozen=True, slots=True)
class UsageWindow:
    period: str
    buckets: tuple[datetime, ...]
    start: datetime
    end: datetime


def parse_usage_range(value: str | None) -> UsageRange:
    """The requested range; an unknown one is a client error, not a silent default."""
    if not value:
        return DEFAULT_USAGE_RANGE
    for allowed in USAGE_RANGES:
        if value == allowed:
            return allowed
    raise ValueError("unknown usage range")


def usage_window(range_key: UsageRange, now: datetime) -> UsageWindow:
    """The local buckets of a range and the UTC window that covers them, ending now."""
    local_now = now.astimezone(TEHRAN)
    today = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_key == "today":
        buckets = tuple(today + timedelta(hours=h) for h in range(local_now.hour + 1))
        period = "hour"
    else:
        first = today - timedelta(days=_DAYS_BACK[range_key])
        buckets = tuple(first + timedelta(days=d) for d in range(_DAYS_BACK[range_key] + 1))
        period = "day"
    end = now.astimezone(timezone.utc).replace(second=0, microsecond=0)
    return UsageWindow(period=period, buckets=buckets, start=buckets[0].astimezone(timezone.utc), end=end)


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _traffic(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != value or value < 0:
        return 0
    return int(value)


def usage_records(payload: Any) -> list[tuple[datetime, int]]:
    """Every (period start, bytes) the panel answered, from all of its per-node series."""
    stats = payload.get("stats") if isinstance(payload, Mapping) else None
    series = stats.values() if isinstance(stats, Mapping) else []
    records: list[tuple[datetime, int]] = []
    for rows in series:
        for row in rows if isinstance(rows, list) else []:
            at = _parse_time(row.get("period_start")) if isinstance(row, Mapping) else None
            if at is not None:
                records.append((at, _traffic(row.get("total_traffic"))))
    return records


def bucket_usage(records: list[tuple[datetime, int]], window: UsageWindow) -> list[UsagePoint]:
    """Sum the records into the window's local buckets; records outside it are dropped."""
    step = timedelta(hours=1) if window.period == "hour" else timedelta(days=1)
    totals = dict.fromkeys(window.buckets, 0)
    first, last_end = window.buckets[0], window.buckets[-1] + step
    for at, amount in records:
        local = at.astimezone(TEHRAN)
        if not first <= local < last_end:
            continue
        index = int((local - first) // step)
        totals[window.buckets[index]] += amount
    return [{"at": bucket.isoformat(), "bytes": totals[bucket]} for bucket in window.buckets]


async def service_usage_series(reader: UsageReader, pg_user_id: int, range_key: UsageRange, *, now: datetime) -> UsageSeries:
    """The chart of one panel user over a range; panel errors propagate to the caller."""
    window = usage_window(range_key, now)
    payload = await reader.get_user_usage(
        pg_user_id, period=window.period, start=window.start, end=window.end, cache_max_age=USAGE_CACHE_MAX_AGE_SEC
    )
    points = bucket_usage(usage_records(payload), window)
    total = sum(point["bytes"] for point in points)
    return {
        "range": range_key,
        "period": window.period,
        "points": points,
        "total_bytes": total,
        "total_text": format_bytes(total),
    }
