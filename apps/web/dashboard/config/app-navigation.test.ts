import { describe, expect, it } from "vitest";

import { canAccessRoute, getAppNavigation } from "./app-navigation";
import { PRODUCT_PROFILES } from "./product-profile";

describe("product navigation", () => {
  it("exposes only the official Pilot V1 surface", () => {
    const navigation = getAppNavigation(PRODUCT_PROFILES.PILOT_V1);
    const routes = navigation.flatMap((group) => group.routes);

    expect(routes.map((route) => route.href)).toEqual([
      "/app/dossiers",
      "/app/inbox",
      "/app/followups",
      "/app/knowledge",
      "/app/settings",
    ]);
    expect(routes.some((route) => route.href === "/app/clients")).toBe(false);
    expect(routes.some((route) => route.href === "/app/assistant")).toBe(false);
    expect(routes.some((route) => route.href === "/app/packages")).toBe(false);
  });

  it("preserves the former Cargo OS navigation behind its explicit profile", () => {
    const routes = getAppNavigation(PRODUCT_PROFILES.CARGO_OS).flatMap((group) => group.routes);

    expect(routes.some((route) => route.href === "/app/clients")).toBe(true);
    expect(routes.some((route) => route.href === "/app/packages")).toBe(true);
    expect(routes.some((route) => route.href === "/app/pricing")).toBe(true);
  });

  it("continues to filter visible routes by permission", () => {
    const dossier = getAppNavigation(PRODUCT_PROFILES.PILOT_V1)
      .flatMap((group) => group.routes)
      .find((route) => route.href === "/app/dossiers");

    expect(dossier && canAccessRoute(dossier, ["dossiers.read"], true)).toBe(true);
    expect(dossier && canAccessRoute(dossier, [], true)).toBe(false);
  });
});
