import { afterEach, describe, expect, it } from "vitest";

import { appNavigation, canAccessRoute } from "./app-navigation";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PILOT_MODE;
});

describe("pilot navigation", () => {
  it("organizes the product around agency tasks", () => {
    expect(appNavigation.map((group) => group.label)).toEqual([
      "Clients",
      "Opérations",
      "Offre commerciale",
      "Communication",
      "Pilotage",
    ]);
  });

  it("hides preview capabilities during an agency pilot", () => {
    process.env.NEXT_PUBLIC_PILOT_MODE = "1";
    const broadcast = appNavigation.flatMap((group) => group.routes).find((route) => route.href === "/app/broadcasts");
    const clients = appNavigation.flatMap((group) => group.routes).find((route) => route.href === "/app/clients");

    expect(broadcast && canAccessRoute(broadcast, ["broadcasts.read"], true)).toBe(false);
    expect(clients && canAccessRoute(clients, ["clients.read"], true)).toBe(true);
  });
});
