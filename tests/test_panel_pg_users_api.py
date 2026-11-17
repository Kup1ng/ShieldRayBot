"""JSON endpoints behind the React PasarGuard pages: permissions, scope, secrets, bounds, degraded panel."""

from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException

from app.api import panel_fetch, pg_pages
from app.api.panel_pg_users_api import register_panel_pg_users_api
from app.services.pg_read import PgReadDenied
from app.services.pg_resources_panel import GROUP_OUT_OF_SCOPE, PG_READ_ERROR

GB = 1024**3
ALL_PAGES = ["pg_users", "pg_templates", "pg_groups", "pg_hosts"]
ALL_USER_ACTIONS = {"create": True, "read": True, "update": True, "delete": True, "reset_usage": True, "revoke_sub": True}
ALL_RESOURCE_ACTIONS = {r: {"create": True, "update": True, "delete": True} for r in ("templates", "groups", "hosts")}

OWNER = {
    "role": "admin",
    "pg_is_owner": True,
    "pg_permissions": ALL_PAGES,
    "pg_user_actions": ALL_USER_ACTIONS,
    "pg_actions": ALL_RESOURCE_ACTIONS,
}
SHOP_A = {
    "role": "reseller",
    "bot_user_id": 2,
    "pg_admin_username": "shop_a",
    "pg_permissions": ALL_PAGES,
    "pg_user_actions": {"read": True, "reset_usage": True},
    "pg_actions": {"hosts": {"create": False, "update": False, "delete": False}},
}
SHOP_B = {**SHOP_A, "bot_user_id": 3, "pg_admin_username": "shop_b"}
NO_PAGES = {"role": "reseller", "bot_user_id": 4, "pg_admin_username": "shop_c", "pg_permissions": []}

USER_ROW_KEYS = {
    "id", "username", "status", "status_label", "disabled", "on_hold", "used_traffic", "data_limit", "traffic_text",
    "traffic_percent", "data_gb", "days_left", "expire_text", "owner", "hwid_limit", "group_ids", "ops",
}
SECRET_WORDS = ("SECRET-SUB-TOKEN", "subscription_url", "sub_url", "credentials", "SECRET-NOTE", "password")


def pg_user(uid: int, username: str, owner: str, **extra: object) -> dict:
    return {
        "id": uid,
        "username": username,
        "status": "active",
        "used_traffic": 5 * GB,
        "data_limit": 10 * GB,
        "admin": {"username": owner},
        "subscription_url": f"https://panel.example/sub/SECRET-SUB-TOKEN-{uid}",
        "note": "SECRET-NOTE",
        "group_ids": [1],
        "hwid_limit": 2,
        **extra,
    }


class FakePg:
    """Records the calls; each staff member gets the users PasarGuard would show them."""

    def __init__(self, users: list[dict] | None = None) -> None:
        self.users = users if users is not None else []
        self.get_users = AsyncMock(side_effect=self._get_users)
        self.get_user_templates = AsyncMock(return_value=[{"id": 7, "name": "Monthly", "token": "hidden"}])
        self.get_groups_simple = AsyncMock(return_value=[{"id": 1, "name": "Main", "secret": "hidden"}])
        self.get_groups = AsyncMock(
            return_value=[
                {"id": 1, "name": "Main", "inbound_tags": ["vless-ws", "trojan"], "total_users": 4, "is_disabled": False, "secret": "hidden"}
            ]
        )
        self.get_group = AsyncMock(return_value={"id": 1, "name": "Main", "inbound_tags": ["vless-ws"], "is_disabled": True})
        self.get_inbounds = AsyncMock(return_value=["vless-ws", {"tag": "trojan"}])
        self.get_hosts = AsyncMock(
            return_value=[
                {"id": 3, "remark": "IR-1", "address": ["a.example", "b.example"], "port": 443, "inbound_tag": "vless-ws", "priority": 1, "is_disabled": False, "secret": "hidden"}
            ]
        )

    async def _get_users(self, **params: object) -> dict:
        return {"users": list(self.users), "total": len(self.users)}


class PgApiCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.staff: dict = {}
        self.pg = FakePg()

        def require_pg_perm(permission: str):
            def dependency() -> dict:
                if permission not in (self.staff.get("pg_permissions") or []):
                    raise HTTPException(403, "forbidden")
                return self.staff

            return dependency

        async def get_db():
            yield None

        app = FastAPI()
        register_panel_pg_users_api(
            app,
            require_staff=lambda: self.staff,
            require_admin=lambda: self.staff,
            require_perm=require_pg_perm,
            require_pg_perm=require_pg_perm,
            get_db=get_db,
        )
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")

        self.client_for: dict[str, FakePg] = {}

        async def read_client(session: object, staff: dict) -> FakePg:
            return self.client_for.get(str(staff.get("pg_admin_username")), self.pg)

        for target in ("app.services.pg_users_panel.staff_pg_read_client", "app.services.pg_resources_panel.staff_pg_read_client"):
            patcher = patch(target, read_client)
            patcher.start()
            self.addCleanup(patcher.stop)

    async def asyncTearDown(self) -> None:
        await self.client.aclose()

    async def get(self, staff: dict, path: str) -> httpx.Response:
        self.staff.clear()
        self.staff.update(staff)
        return await self.client.get(path)


class UsersListTests(PgApiCase):
    async def test_owner_sees_users_with_only_the_screen_fields(self) -> None:
        self.pg.users = [pg_user(1, "alice", "shop_a"), pg_user(2, "bob", "shop_b", status="disabled")]
        response = await self.get(OWNER, "/api/panel/pg/users")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        body = response.json()
        self.assertEqual([r["username"] for r in body["rows"]], ["alice", "bob"])
        for row in body["rows"]:
            self.assertEqual(set(row), USER_ROW_KEYS)
        self.assertTrue(body["show_owner"])
        self.assertEqual([r["owner"] for r in body["rows"]], ["shop_a", "shop_b"])
        self.assertEqual(body["rows"][0]["traffic_percent"], 50)
        self.assertEqual(body["rows"][0]["group_ids"], [1])
        self.assertEqual(body["templates"], [{"id": 7, "name": "Monthly"}])
        self.assertEqual(body["groups"], [{"id": 1, "name": "Main"}])
        self.assertTrue(body["can"]["custom_create"] and body["can"]["template_create"])
        self.assertIsNone(body["error"])

    async def test_subscription_links_tokens_and_notes_never_travel_in_the_list(self) -> None:
        self.pg.users = [pg_user(1, "alice", "shop_a")]
        for staff in (OWNER, SHOP_A):
            text = (await self.get(staff, "/api/panel/pg/users")).text
            for word in (*SECRET_WORDS, "hidden"):
                self.assertNotIn(word, text, (staff["role"], word))

    async def test_a_staff_member_without_the_page_permission_is_refused(self) -> None:
        for path in ("users", "templates", "groups", "hosts"):
            self.assertEqual((await self.get(NO_PAGES, f"/api/panel/pg/{path}")).status_code, 403, path)

    async def test_a_second_shop_never_sees_the_first_shops_users(self) -> None:
        mixed = [pg_user(1, "alice", "shop_a"), pg_user(2, "bob", "shop_b"), pg_user(3, "orphan", "")]
        self.client_for = {"shop_a": FakePg(mixed), "shop_b": FakePg(mixed)}
        first = (await self.get(SHOP_A, "/api/panel/pg/users")).json()
        second = (await self.get(SHOP_B, "/api/panel/pg/users")).json()
        self.assertEqual([r["username"] for r in first["rows"]], ["alice"])
        self.assertEqual([r["username"] for r in second["rows"]], ["bob"])
        self.assertFalse(first["show_owner"])
        self.assertEqual(first["rows"][0]["owner"], "")
        # The panel is asked for the shop's own admin only.
        self.assertEqual(self.client_for["shop_a"].get_users.await_args.kwargs["admin"], "shop_a")

    async def test_a_shop_without_a_panel_identity_sees_no_users(self) -> None:
        self.pg.users = [pg_user(1, "alice", "shop_a")]
        body = (await self.get({**SHOP_A, "pg_admin_username": ""}, "/api/panel/pg/users")).json()
        self.assertEqual(body["rows"], [])

    async def test_row_operations_follow_the_staff_actions_and_the_user_state(self) -> None:
        self.pg.users = [pg_user(1, "alice", "shop_a"), pg_user(2, "bob", "shop_a", status="disabled"), pg_user(3, "x", "shop_a", id=None)]
        self.client_for = {"shop_a": FakePg(self.pg.users)}
        rows = (await self.get(SHOP_A, "/api/panel/pg/users")).json()["rows"]
        self.assertEqual(rows[0]["ops"], ["reset"])
        self.assertEqual(rows[1]["ops"], ["reset"])
        self.assertEqual(rows[2]["ops"], [])
        owner_rows = (await self.get(OWNER, "/api/panel/pg/users")).json()["rows"]
        self.assertEqual(owner_rows[0]["ops"], ["disable", "reset", "revoke", "delete"])
        self.assertEqual(owner_rows[1]["ops"], ["enable", "reset", "revoke", "delete"])

    async def test_create_buttons_follow_the_role_and_the_available_sources(self) -> None:
        template_only = {**OWNER, "pg_is_owner": False, "role": "reseller", "bot_user_id": 2, "pg_admin_username": "shop_a", "pg_access": {"require_template": True}}
        can = (await self.get(template_only, "/api/panel/pg/users")).json()["can"]
        self.assertTrue(can["require_template"])
        self.assertFalse(can["custom_create"])
        self.assertTrue(can["template_create"])
        self.pg.get_user_templates.return_value = []
        can = (await self.get(OWNER, "/api/panel/pg/users")).json()["can"]
        self.assertFalse(can["template_create"])
        self.assertTrue(can["custom_create"])

    async def test_paging_is_bounded_and_offsets_the_panel_query(self) -> None:
        await self.get(OWNER, "/api/panel/pg/users?page=3")
        params = self.pg.get_users.await_args.kwargs
        self.assertEqual((params["offset"], params["limit"]), (100, 50))
        for raw, expected in (("0", 0), ("-4", 0), ("abc", 0), ("999999999", 100_000 - 1)):
            await self.get(OWNER, f"/api/panel/pg/users?page={raw}")
            params = self.pg.get_users.await_args.kwargs
            self.assertEqual(params["limit"], 50)
            self.assertEqual(params["offset"], expected * 50, raw)

    async def test_pager_tells_whether_a_next_page_exists(self) -> None:
        self.pg.users = [pg_user(i, f"u{i}", "shop_a") for i in range(1, 51)]
        pager = (await self.get(OWNER, "/api/panel/pg/users")).json()["pager"]
        self.assertEqual((pager["page"], pager["page_size"], pager["total"]), (1, 50, 50))
        self.assertFalse(pager["has_next"])

    async def test_search_narrows_the_page_and_widens_when_the_panel_matches_exactly(self) -> None:
        self.pg.get_users = AsyncMock(
            side_effect=[{"users": []}, {"users": [pg_user(1, "Alice_VIP", "shop_a"), pg_user(2, "bob", "shop_a")]}]
        )
        body = (await self.get(OWNER, "/api/panel/pg/users?q=alice")).json()
        self.assertEqual([r["username"] for r in body["rows"]], ["Alice_VIP"])
        self.assertEqual(body["q"], "alice")
        first, second = self.pg.get_users.await_args_list
        self.assertEqual(first.kwargs["username"], "alice")
        self.assertNotIn("username", second.kwargs)

    async def test_an_overlong_search_is_cut(self) -> None:
        body = (await self.get(OWNER, f"/api/panel/pg/users?q={'a' * 500}")).json()
        self.assertEqual(len(body["q"]), 100)

    async def test_a_panel_that_is_down_degrades_to_an_empty_page_with_a_safe_notice(self) -> None:
        self.pg.get_users = AsyncMock(side_effect=RuntimeError("Traceback (most recent call last): secret-host:9000"))
        response = await self.get(OWNER, "/api/panel/pg/users")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["rows"], [])
        self.assertTrue(body["error"])
        self.assertNotIn("Traceback", response.text)
        self.assertNotIn("secret-host", response.text)

    async def test_a_staff_member_without_panel_credentials_gets_the_isolation_notice(self) -> None:
        with patch("app.services.pg_users_panel.staff_pg_read_client", AsyncMock(side_effect=PgReadDenied())):
            body = (await self.get(SHOP_A, "/api/panel/pg/users")).json()
        self.assertEqual(body["rows"], [])
        self.assertIn("اعتبارنامه", body["error"])

    async def test_a_slow_panel_times_out_instead_of_hanging(self) -> None:
        async def slow(**params: object) -> dict:
            await asyncio.sleep(5)
            return {"users": []}

        self.pg.get_users = AsyncMock(side_effect=slow)
        with patch("app.services.pg_users_panel.PG_READ_TIMEOUT_SEC", 0.05):
            body = (await self.get(OWNER, "/api/panel/pg/users")).json()
        self.assertEqual(body["rows"], [])
        self.assertIn("دیر", body["error"])

    async def test_templates_and_groups_failing_do_not_hide_the_users(self) -> None:
        self.pg.users = [pg_user(1, "alice", "shop_a")]
        self.pg.get_user_templates = AsyncMock(side_effect=RuntimeError("down"))
        self.pg.get_groups_simple = AsyncMock(side_effect=RuntimeError("down"))
        body = (await self.get(OWNER, "/api/panel/pg/users")).json()
        self.assertEqual(len(body["rows"]), 1)
        self.assertEqual((body["templates"], body["groups"]), ([], []))
        self.assertFalse(body["can"]["custom_create"])


class TemplatesGroupsHostsTests(PgApiCase):
    async def test_templates_show_limit_duration_and_group_ids_only(self) -> None:
        self.pg.get_user_templates = AsyncMock(
            return_value={"templates": [{"id": 7, "name": "Monthly", "data_limit": 30 * GB, "expire_duration": 30 * 86400, "group_ids": [1, 2], "token": "hidden"}]}
        )
        response = await self.get(OWNER, "/api/panel/pg/templates")
        body = response.json()
        self.assertEqual(
            body["rows"],
            [{"id": 7, "name": "Monthly", "data_limit": 30 * GB, "limit_text": "30 گیگ", "data_gb": 30.0, "expire_days": 30, "group_ids": [1, 2]}],
        )
        self.assertEqual(body["groups"], [{"id": 1, "name": "Main"}])
        self.assertEqual(body["can"], {"create": True, "update": True, "delete": True})
        self.assertNotIn("hidden", response.text)

    async def test_an_unlimited_template_has_no_limit_and_no_duration(self) -> None:
        self.pg.get_user_templates = AsyncMock(return_value=[{"id": 8, "name": "Open", "data_limit": 0, "expire_duration": 0, "group_ids": []}])
        row = (await self.get(OWNER, "/api/panel/pg/templates")).json()["rows"][0]
        self.assertEqual((row["data_limit"], row["limit_text"], row["expire_days"], row["data_gb"]), (None, "نامحدود", None, None))

    async def test_a_read_only_shop_sees_no_write_flags(self) -> None:
        for page in ("templates", "groups", "hosts"):
            can = (await self.get(SHOP_A, f"/api/panel/pg/{page}")).json()["can"]
            self.assertEqual(can, {"create": False, "update": False, "delete": False}, page)

    async def test_template_rows_respect_the_staff_allow_list(self) -> None:
        self.pg.get_user_templates = AsyncMock(return_value=[{"id": 7, "name": "A"}, {"id": 8, "name": "B"}])
        shop = {**SHOP_A, "pg_access": {"allowed_template_ids": [8]}}
        rows = (await self.get(shop, "/api/panel/pg/templates")).json()["rows"]
        self.assertEqual([r["id"] for r in rows], [8])

    async def test_groups_list_inbound_tags_as_plain_strings(self) -> None:
        response = await self.get(OWNER, "/api/panel/pg/groups")
        body = response.json()
        self.assertEqual(
            body["rows"],
            [{"id": 1, "name": "Main", "inbound_tags": ["vless-ws", "trojan"], "total_users": 4, "is_disabled": False}],
        )
        self.assertEqual(body["inbound_tags"], ["vless-ws", "trojan"])
        self.assertIsNone(body["edit_group"])
        self.assertNotIn("hidden", response.text)

    async def test_hostile_group_tags_are_returned_as_data_not_markup(self) -> None:
        self.pg.get_groups = AsyncMock(return_value=[{"id": 2, "name": "<b>x</b>", "inbound_tags": ["<script>1</script>"]}])
        row = (await self.get(OWNER, "/api/panel/pg/groups")).json()["rows"][0]
        self.assertEqual(row["inbound_tags"], ["<script>1</script>"])

    async def test_groups_edit_query_returns_the_group_when_allowed(self) -> None:
        body = (await self.get(OWNER, "/api/panel/pg/groups?edit=1")).json()
        self.assertEqual(body["edit_group"]["name"], "Main")
        self.assertTrue(body["edit_group"]["is_disabled"])

    async def test_groups_edit_query_for_a_group_outside_the_allow_list_is_refused(self) -> None:
        shop = {**SHOP_A, "pg_access": {"allowed_group_ids": [1]}}
        body = (await self.get(shop, "/api/panel/pg/groups?edit=99")).json()
        self.assertIsNone(body["edit_group"])
        self.assertEqual(body["error"], GROUP_OUT_OF_SCOPE)
        self.pg.get_group.assert_not_awaited()

    async def test_groups_without_inbounds_still_list_with_a_notice(self) -> None:
        self.pg.get_inbounds = AsyncMock(side_effect=RuntimeError("down"))
        body = (await self.get(OWNER, "/api/panel/pg/groups")).json()
        self.assertEqual(len(body["rows"]), 1)
        self.assertEqual((body["inbound_tags"], body["error"]), ([], PG_READ_ERROR))

    async def test_hosts_show_addresses_as_a_list(self) -> None:
        response = await self.get(OWNER, "/api/panel/pg/hosts")
        body = response.json()
        self.assertEqual(
            body["rows"],
            [{"id": 3, "remark": "IR-1", "address": ["a.example", "b.example"], "port": 443, "inbound_tag": "vless-ws", "priority": 1, "is_disabled": False}],
        )
        self.assertEqual(body["inbound_tags"], ["vless-ws", "trojan"])
        self.assertNotIn("hidden", response.text)

    async def test_a_host_address_given_as_one_string_is_a_one_item_list(self) -> None:
        self.pg.get_hosts = AsyncMock(return_value=[{"id": 4, "remark": "R", "address": "one.example"}])
        row = (await self.get(OWNER, "/api/panel/pg/hosts")).json()["rows"][0]
        self.assertEqual((row["address"], row["port"], row["priority"]), (["one.example"], None, 0))

    async def test_hosts_with_the_panel_down_degrade_to_a_notice(self) -> None:
        self.pg.get_hosts = AsyncMock(side_effect=RuntimeError("boom"))
        response = await self.get(OWNER, "/api/panel/pg/hosts")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["rows"], [])
        self.assertTrue(body["error"])
        self.assertNotIn("boom", response.text)


class PageHandlerTests(unittest.IsolatedAsyncioTestCase):
    """The old GET handlers now hand out the React page behind the same permission guard."""

    async def asyncSetUp(self) -> None:
        self.denied = False

        def require_pg_perm(permission: str):
            def dependency() -> dict:
                if self.denied:
                    raise HTTPException(403, "forbidden")
                return {"role": "admin"}

            return dependency

        render = MagicMock(side_effect=AssertionError("the server-rendered page must not be used"))
        app = FastAPI()
        pg_pages.register_pg_pages(app, render=render, require_pg_perm=require_pg_perm, get_db=lambda: None)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        self.pages: list[str] = []

        def fake_html(page: str) -> str:
            self.pages.append(page)
            return f"<html>{page}</html>"

        patcher = patch("app.api.spa_pages.spa_html", fake_html)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def asyncTearDown(self) -> None:
        await self.client.aclose()

    async def test_each_page_serves_its_react_shell_without_touching_the_panel(self) -> None:
        for path in ("/pg/users", "/pg/templates", "/pg/groups", "/pg/hosts"):
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertEqual(response.text, f"<html>{path.lstrip('/')}</html>")
            self.assertEqual(response.headers["cache-control"], "no-store")

    async def test_a_staff_member_without_the_permission_gets_no_shell(self) -> None:
        self.denied = True
        for path in ("/pg/users", "/pg/templates", "/pg/groups", "/pg/hosts"):
            self.assertEqual((await self.client.get(path)).status_code, 403, path)
        self.assertEqual(self.pages, [])


class FormErrorAnswerTests(unittest.TestCase):
    """A create/edit form that fails redirects with ?form_err=; the panel must see it as an error."""

    def test_a_form_error_redirect_is_an_error_answer_with_the_message(self) -> None:
        status, body = panel_fetch.redirect_payload("/pg/users?form_err=%D9%86%D8%A7%D9%85%20%D9%86%D8%A7%D9%85%D8%B9%D8%AA%D8%A8%D8%B1&modal=create")
        self.assertEqual(status, 200)
        self.assertFalse(body["ok"])
        self.assertEqual(body["message"], "نام نامعتبر")
        self.assertNotIn("form_err", urlsplit(body["location"]).query)

    def test_a_success_redirect_stays_a_success(self) -> None:
        status, body = panel_fetch.redirect_payload("/pg/users?ok=%DA%A9%D8%A7%D8%B1%D8%A8%D8%B1%20%D8%B3%D8%A7%D8%AE%D8%AA%D9%87%20%D8%B4%D8%AF")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["message"], "کاربر ساخته شد")


if __name__ == "__main__":
    unittest.main()
