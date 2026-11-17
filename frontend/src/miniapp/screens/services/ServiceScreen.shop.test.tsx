import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MiniShell } from "../../layout/MiniShell";
import { customerMe, fakeApi, renderMini } from "../../test/harness";
import "../../test/telegram";
import { ScreenRouter } from "../ScreenRouter";

const SERVICE = {
  id: 7,
  username: "svc",
  status: "active",
  status_fa: "فعال",
  traffic_pct: 10,
  addons_allowed: true,
  subscription_url: "https://sub.example.com/sub/token",
  is_cancelled: false,
  cancellation_pending: false,
};

/** A shop's Mini App that opened services, guides, activity and buying, but not management. */
const SHOP_ME = customerMe({ sections: ["services", "guides", "activity", "shop"], shop: { name: "shop" } });

describe("service screen in a shop's Mini App", () => {
  it("keeps renewal, the link and guides, and hides the sections the shop has not opened", async () => {
    const api = fakeApi({
      "GET /api/mini/service/7": () => ({ json: { service: SERVICE } }),
    });
    renderMini(
      <MiniShell>
        <ScreenRouter />
      </MiniShell>,
      { me: SHOP_ME, route: { view: "service", serviceId: 7 } },
    );

    expect(await screen.findByRole("button", { name: "تمدید سرویس" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "کپی لینک" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /راهنمای اتصال/ })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /تمدید خودکار/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /درخواست لغو/ })).toBeNull();
    expect(api.callsTo("GET", "/api/mini/topup")).toHaveLength(0);
  });
});
