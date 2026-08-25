import { afterEach, describe, expect, it } from "vitest";

import {
  getProductProfile,
  isPilotVisiblePath,
  pilotRedirectTarget,
  PRODUCT_PROFILES,
} from "./product-profile";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PRODUCT_PROFILE;
  delete process.env.NEXT_PUBLIC_PILOT_MODE;
});

describe("Pilot V1 product profile", () => {
  it("is the safe default product surface", () => {
    expect(getProductProfile()).toBe(PRODUCT_PROFILES.PILOT_V1);
  });

  it("allows the former surface only through an explicit profile", () => {
    process.env.NEXT_PUBLIC_PRODUCT_PROFILE = "CARGO_OS";
    expect(getProductProfile()).toBe(PRODUCT_PROFILES.CARGO_OS);
  });

  it("allows only Pilot pages and their detail routes", () => {
    expect(isPilotVisiblePath("/app")).toBe(true);
    expect(isPilotVisiblePath("/app/dossiers/123")).toBe(true);
    expect(isPilotVisiblePath("/app/inbox")).toBe(true);
    expect(isPilotVisiblePath("/app/settings")).toBe(true);
    expect(isPilotVisiblePath("/app/followups/analytics")).toBe(false);
    expect(isPilotVisiblePath("/app/packages")).toBe(false);
    expect(isPilotVisiblePath("/app/assistant")).toBe(false);
  });

  it("redirects former client and assistant entry points to their Pilot replacement", () => {
    expect(pilotRedirectTarget("/app/clients/123")).toBe("/app/dossiers");
    expect(pilotRedirectTarget("/app/assistant")).toBe("/app/inbox");
    expect(pilotRedirectTarget("/app/pricing")).toBe("/app");
  });
});
