import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components/landing/streamlined-landing-page.tsx"), "utf8");

describe("Slaivio public landing", () => {
  it("positions Slaivio as the Cargo digitization platform", () => {
    expect(source).toContain("Digitalisez les opérations de votre agence Cargo");
    expect(source).toContain("Une seule relation client, plusieurs canaux");
    expect(source).toContain('name="WhatsApp Business"');
    expect(source).toContain('name="Email / Gmail"');
  });

  it("does not present planned communication channels as available", () => {
    expect(source).toContain('name="Email / Gmail" status={t.soon}');
    expect(source).toContain('name="TikTok" status={t.soon}');
  });

  it("keeps the experience calm and product-led", () => {
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("n°1");
    expect(source).not.toContain("★★★★★");
    expect(source).toContain("<ProductPreview />");
  });
});
