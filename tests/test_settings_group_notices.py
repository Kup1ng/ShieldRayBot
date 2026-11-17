"""A settings group's warning is shown inside that group's box, right under its title."""

from __future__ import annotations

from tests.settings_json import settings_group, settings_url
from tests.test_update_owner_only import OWNER_SESSION, SHOP_SESSION, RoutesHarness

FORCE_JOIN = "ربات باید ادمین کانال باشد"
TERMS = "ایموجی پریمیوم تلگرام"


class GroupNoticeTests(RoutesHarness):
    async def test_the_owner_limits_tab_puts_each_warning_in_its_group(self) -> None:
        body = (await self.client.get(settings_url("limits"), headers={"cookie": f"session={self.signer.dumps(OWNER_SESSION)}; csrf=token"})).json()
        self.assertEqual(settings_group(body, "کانال اجباری")["notice"]["title"], FORCE_JOIN)
        self.assertEqual(settings_group(body, "قوانین ورود به ربات")["notice"]["title"], TERMS)
        self.assertEqual([group["name"] for group in body["groups"] if group["notice"] and group["notice"]["title"] == FORCE_JOIN], ["کانال اجباری"])
        self.assertIsNone(settings_group(body, "اکانت تست")["notice"])

    async def test_the_shop_limits_tab_does_the_same(self) -> None:
        cookie = f"session={self.signer.dumps(SHOP_SESSION)}; csrf=token"
        body = (await self.client.get("/api/panel/shop-settings?tab=limits", headers={"cookie": cookie})).json()
        notices = {section["title"]: section["notice"] for section in body["sections"]}
        self.assertEqual(notices["کانال اجباری"], "forcejoin")
        self.assertEqual(notices["قوانین ورود به ربات"], "terms")
        self.assertEqual([title for title, notice in notices.items() if notice == "forcejoin"], ["کانال اجباری"])
        self.assertIsNone(notices["اکانت تست"])
