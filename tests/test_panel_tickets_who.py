"""The customer-ticket JSON names who opened the ticket, without crossing shops."""

from __future__ import annotations

from sqlalchemy import event

from tests.test_panel_ops_api import OWNER, SHOP_A, SHOP_B, OpsApiCase, shop_staff


class TicketOpenerLabelTests(OpsApiCase):
    async def test_list_and_detail_show_name_username_and_telegram_id(self) -> None:
        listing = (await self.get("/api/panel/tickets", dict(OWNER))).json()
        self.assertEqual(listing["bot_tickets"][0]["user_label"], "Platform buyer (@pbuyer) · آیدی 9001")
        detail = (await self.get("/api/panel/tickets/bot/1", dict(OWNER))).json()
        self.assertEqual(detail["user_label"], "Platform buyer (@pbuyer) · آیدی 9001")

    async def test_another_shops_customer_label_never_reaches_a_shop(self) -> None:
        shop_a = await self.get("/api/panel/tickets", shop_staff(SHOP_A))
        self.assertIn("Shop A buyer", shop_a.text)
        for leaked in ("Shop B buyer", "9021", "Platform buyer", "9001"):
            self.assertNotIn(leaked, shop_a.text)
        denied = await self.get("/api/panel/tickets/bot/3", shop_staff(SHOP_A))
        self.assertEqual(denied.status_code, 404)
        for leaked in ("Shop B buyer", "9021"):
            self.assertNotIn(leaked, denied.text)
        shop_b = await self.get("/api/panel/tickets", shop_staff(SHOP_B))
        self.assertNotIn("Shop A buyer", shop_b.text)

    async def test_labels_are_loaded_in_one_query_for_all_tickets(self) -> None:
        statements: list[str] = []

        def record(conn, cursor, statement, parameters, context, executemany) -> None:  # noqa: ANN001 - SQLAlchemy hook signature
            statements.append(statement)

        sync_engine = self.engine.sync_engine
        event.listen(sync_engine, "before_cursor_execute", record)
        try:
            await self.get("/api/panel/tickets", dict(OWNER))
        finally:
            event.remove(sync_engine, "before_cursor_execute", record)
        user_queries = [sql for sql in statements if "FROM bot_users" in sql]
        self.assertLessEqual(len(user_queries), 1)
