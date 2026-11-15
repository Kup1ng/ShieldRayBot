"use client";

import type { ComponentType } from "react";

import { useMini } from "../state/store";
import type { ViewId } from "../types";
import { AccountScreen } from "./account/AccountScreen";
import { ClubScreen } from "./club/ClubScreen";
import { HomeScreen } from "./home/HomeScreen";
import { OpsScreen } from "./ops/OpsScreen";
import { ReviewScreen } from "./review/ReviewScreen";
import { ServiceScreen } from "./services/ServiceScreen";
import { ServicesScreen } from "./services/ServicesScreen";
import { ShopScreen } from "./shop/ShopScreen";
import { SupportScreen } from "./support/SupportScreen";
import { TicketScreen } from "./support/TicketScreen";

const SCREENS: Record<ViewId, ComponentType> = {
  home: HomeScreen,
  services: ServicesScreen,
  service: ServiceScreen,
  shop: ShopScreen,
  account: AccountScreen,
  support: SupportScreen,
  ticket: TicketScreen,
  club: ClubScreen,
  review: ReviewScreen,
  ops: OpsScreen,
};

/** One screen at a time; the key remounts it so every visit starts from fresh state. */
export function ScreenRouter() {
  const { route } = useMini();
  const Screen = SCREENS[route.view] ?? HomeScreen;
  return <Screen key={`${route.view}:${route.serviceId ?? ""}:${route.ticketId ?? ""}`} />;
}
