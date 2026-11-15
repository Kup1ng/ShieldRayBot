"""Mini App usage chart: local Tehran buckets from PasarGuard usage, and who may read it."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.miniapp_service_usage import USAGE_UNAVAILABLE, register_miniapp_service_usage
from app.db.models import Base, BotUser, UserService
from app.services.dashboard_trend import TEHRAN
from app.services.pasarguard import PasarGuardError
from app.services.service_usage_chart import (
    bucket_usage,
    parse_usage_range,
    service_usage_series,
    usage_records,
    usage_window,
)
from app.services.users import reset_shop_reseller_id, set_shop_reseller_id

GB = 1024**3
# 14:20 in Tehran (UTC+03:30).
NOW = datetime(2026, 11, 15, 10, 50, tzinfo=timezone.utc)


def stat(at: datetime, amount: Any) -> dict[str, Any]:
    return {"period_start": at.isoformat(), "total_traffic": amount}


class FakeReader:
    def __init__(self, payload: Any = None, error: Exception | None = None) -> None:
        self.payload = payload if payload is not None else {"stats": {}}
        self.error = error
        self.calls: list[dict[str, Any]] = []

    async def get_user_usage(self, user_id: int, **params: Any) -> Any:
        self.calls.append({"user_id": user_id, **params})
        if self.error:
            raise self.error
        return self.payload


class UsageWindowTests(unittest.TestCase):
    def test_week_is_seven_tehran_days_ending_today(self) -> None:
        window = usage_window("week", NOW)
        self.assertEqual(window.period, "day")
        self.assertEqual(len(window.buckets), 7)
        self.assertEqual(window.buckets[0], datetime(2026, 11, 9, tzinfo=TEHRAN))
        self.assertEqual(window.buckets[-1], datetime(2026, 11, 15, tzinfo=TEHRAN))
        self.assertEqual(window.start, datetime(2026, 11, 8, 20, 30, tzinfo=timezone.utc))
        self.assertEqual(window.end, NOW)

    def test_month_is_thirty_days_and_today_is_the_hours_so_far(self) -> None:
        self.assertEqual(len(usage_window("month", NOW).buckets), 30)
        today = usage_window("today", NOW)
        self.assertEqual(today.period, "hour")
        self.assertEqual(len(today.buckets), 15)
        self.assertEqual(today.buckets[0], datetime(2026, 11, 15, tzinfo=TEHRAN))

    def test_window_end_is_rounded_to_the_minute_so_repeated_reads_share_a_cache_key(self) -> None:
        later = NOW + timedelta(seconds=41, microseconds=5)
        self.assertEqual(usage_window("week", later).end, usage_window("week", NOW).end)

    def test_range_defaults_to_the_week_and_rejects_anything_unknown(self) -> None:
        self.assertEqual(parse_usage_range(None), "week")
        self.assertEqual(parse_usage_range("month"), "month")
        for bad in ("year", "WEEK", "today;drop"):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                parse_usage_range(bad)


class BucketTests(unittest.TestCase):
    def test_every_node_series_is_summed_and_quiet_days_count_as_zero(self) -> None:
        window = usage_window("week", NOW)
        day = datetime(2026, 11, 12, tzinfo=TEHRAN)
        payload = {"stats": {"1": [stat(day, 2 * GB)], "2": [stat(day + timedelta(hours=5), GB)], "-1": []}}
        points = bucket_usage(usage_records(payload), window)
        self.assertEqual(len(points), 7)
        self.assertEqual([p["bytes"] for p in points], [0, 0, 0, 3 * GB, 0, 0, 0])
        self.assertEqual(points[3]["at"], day.isoformat())

    def test_a_late_utc_evening_belongs_to_the_next_tehran_day(self) -> None:
        window = usage_window("week", NOW)
        late_utc = datetime(2026, 11, 13, 21, 0, tzinfo=timezone.utc)  # 00:30 on the 14th in Tehran
        points = bucket_usage(usage_records({"stats": {"-1": [stat(late_utc, 5)]}}), window)
        self.assertEqual(points[5]["bytes"], 5)

    def test_records_outside_the_window_and_malformed_values_are_ignored(self) -> None:
        window = usage_window("week", NOW)
        inside = datetime(2026, 11, 10, tzinfo=TEHRAN)
        rows = [
            stat(inside - timedelta(days=30), 9 * GB),
            stat(inside, -5),
            stat(inside, True),
            stat(inside, float("nan")),
            stat(inside, "7"),
            {"period_start": "not a date", "total_traffic": 1},
            "junk",
            stat(inside, 4),
        ]
        points = bucket_usage(usage_records({"stats": {"-1": rows}}), window)
        self.assertEqual(sum(p["bytes"] for p in points), 4)

    def test_an_unexpected_payload_gives_an_empty_chart_not_an_error(self) -> None:
        window = usage_window("today", NOW)
        for payload in (None, [], "text", {"stats": None}, {"stats": {"-1": "x"}}):
            with self.subTest(payload=payload):
                self.assertEqual({p["bytes"] for p in bucket_usage(usage_records(payload), window)}, {0})


class SeriesTests(unittest.IsolatedAsyncioTestCase):
    async def test_asks_the_panel_for_the_window_once_and_totals_it(self) -> None:
        day = datetime(2026, 11, 14, tzinfo=TEHRAN)
        reader = FakeReader({"stats": {"-1": [stat(day, 3 * GB // 2)]}})
        series = await service_usage_series(reader, 77, "week", now=NOW)
        self.assertEqual(len(reader.calls), 1)
        call = reader.calls[0]
        self.assertEqual((call["user_id"], call["period"]), (77, "day"))
        self.assertEqual(call["start"], datetime(2026, 11, 8, 20, 30, tzinfo=timezone.utc))
        self.assertEqual(call["end"], NOW)
        self.assertEqual(series["total_bytes"], 3 * GB // 2)
        self.assertEqual(series["total_text"], "1.5 گیگ")
        self.assertEqual(series["range"], "week")


class ClientUsageParamsTests(unittest.IsolatedAsyncioTestCase):
    async def test_the_client_sends_the_window_as_iso_query_parameters(self) -> None:
        from app.services.pasarguard import PasarGuardClient

        client = PasarGuardClient()
        start = datetime(2026, 11, 8, 20, 30, tzinfo=timezone.utc)
        with patch.object(client, "request", AsyncMock(return_value={"stats": {}})) as request:
            await client.get_user_usage(110, period="day", start=start, end=NOW, cache_max_age=60.0)
        request.assert_awaited_once_with(
            "GET",
            "/api/user/by-id/110/usage",
            params={"period": "day", "start": "2026-11-08T20:30:00+00:00", "end": "2026-11-15T10:50:00+00:00"},
            cache_max_age=60.0,
        )


class MiniUsageRouteTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.session = async_sessionmaker(self.engine, expire_on_commit=False)()
        self.session.add_all([
            BotUser(id=1, telegram_id=101, referral_code="owner", role="user"),
            BotUser(id=2, telegram_id=102, referral_code="other", role="user"),
            UserService(id=10, bot_user_id=1, pg_user_id=110, pg_username="mine"),
            UserService(id=20, bot_user_id=2, pg_user_id=120, pg_username="theirs"),
            UserService(id=30, bot_user_id=1, pg_user_id=130, pg_username="shop-sold", shop_id=7),
            UserService(id=40, bot_user_id=1, pg_username="unlinked"),
        ])
        await self.session.commit()
        self.shop_token = set_shop_reseller_id(None)
        self.reader = FakeReader({"stats": {"-1": [stat(datetime.now(TEHRAN), GB)]}})

        async def load_user(*_args: Any, **_kwargs: Any) -> BotUser | None:
            return await self.session.scalar(select(BotUser).where(BotUser.id == 1))

        self.patches = [
            patch("app.api.miniapp_service_usage.load_mini_user", AsyncMock(side_effect=load_user)),
            patch("app.api.miniapp_service_usage.get_pg", lambda: self.reader),
        ]
        for p in self.patches:
            p.start()
        app = FastAPI()

        async def get_db():
            yield self.session

        register_miniapp_service_usage(app, get_db=get_db)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

    async def asyncTearDown(self) -> None:
        await self.client.aclose()
        for p in reversed(self.patches):
            p.stop()
        reset_shop_reseller_id(self.shop_token)
        await self.session.close()
        await self.engine.dispose()

    async def test_the_owner_gets_the_chart_of_their_service_uncached(self) -> None:
        response = await self.client.get("/api/mini/service/10/usage?range=today")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("no-store", response.headers["cache-control"])
        body = response.json()
        self.assertEqual(body["range"], "today")
        self.assertEqual(body["total_bytes"], GB)
        self.assertEqual(self.reader.calls[0]["user_id"], 110)

    async def test_another_customers_service_or_another_shops_is_not_found_and_the_panel_is_not_asked(self) -> None:
        for service_id in (20, 30, 999):
            with self.subTest(service_id=service_id):
                response = await self.client.get(f"/api/mini/service/{service_id}/usage")
                self.assertEqual(response.status_code, 404)
        self.assertEqual(self.reader.calls, [])

    async def test_an_unknown_range_is_refused_before_any_panel_read(self) -> None:
        response = await self.client.get("/api/mini/service/10/usage?range=year")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.reader.calls, [])

    async def test_a_service_without_a_panel_user_has_no_chart(self) -> None:
        response = await self.client.get("/api/mini/service/40/usage")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], USAGE_UNAVAILABLE)

    async def test_a_panel_failure_shows_a_persian_message_and_never_the_panel_text(self) -> None:
        self.reader.error = PasarGuardError("GET /api/user/by-id/110/usage failed (500)", 500, "secret panel trace")
        response = await self.client.get("/api/mini/service/10/usage")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"], USAGE_UNAVAILABLE)
        self.assertNotIn("secret", response.text)
        self.assertNotIn("/api/user", response.text)


if __name__ == "__main__":
    unittest.main()
