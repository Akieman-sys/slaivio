import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Slaivio typography contract", () => {
  it("uses Geist throughout the product surfaces", () => {
    const layout = read("app/layout.tsx");
    const globalStyles = read("app/globals.css");
    const landing = read("components/landing/landing-page-client.tsx");
    const clerk = read("components/auth/clerk-appearance.ts");

    expect(layout).toContain('from "geist/font/sans"');
    expect(globalStyles).toContain("font-family: var(--font-geist-sans)");
    expect(landing).not.toContain("Neue_Haas_Grotesk");
    expect(clerk).toContain("var(--font-geist-sans)");
  });

  it("keeps compact operational metadata readable", () => {
    const globalStyles = read("app/globals.css");

    expect(globalStyles).toContain("--operation-text-caption: 12px");
    expect(globalStyles).toContain(".slaivio-app-shell .text-\\[10px\\]");
    expect(globalStyles).toContain('[data-ui="operation-drawer-title"]');
  });
});
