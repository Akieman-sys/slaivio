import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Slaivio typography contract", () => {
  it("self-hosts Inter throughout the product surfaces", () => {
    const layout = read("app/layout.tsx");
    const globalStyles = read("app/globals.css");
    const landing = read("components/landing/landing-page-client.tsx");
    const clerk = read("components/auth/clerk-appearance.ts");

    expect(layout).toContain('import "@fontsource-variable/inter"');
    expect(layout).not.toContain('from "geist/font/sans"');
    expect(globalStyles).toContain('--font-slaivio-sans: "Inter Variable"');
    expect(globalStyles).toContain("font-family: var(--font-slaivio-sans)");
    expect(globalStyles).not.toContain("--font-geist-sans");
    expect(landing).not.toContain("Neue_Haas_Grotesk");
    expect(clerk).toContain('"Inter Variable"');
  });

  it("defines the official type scale and readable operational metadata", () => {
    const globalStyles = read("app/globals.css");

    expect(globalStyles).toContain("--sl-text-page-title: 24px");
    expect(globalStyles).toContain("--sl-text-body: 14px");
    expect(globalStyles).toContain("--sl-text-badge: 12px");
    expect(globalStyles).toContain("--operation-text-caption: var(--sl-text-badge)");
    expect(globalStyles).toContain(".slaivio-app-shell .text-\\[10px\\]");
    expect(globalStyles).toContain('[data-ui="operation-drawer-title"]');
  });

  it("scopes the Pilot visual language to stable shared primitives", () => {
    const globalStyles = read("app/globals.css");
    const shell = read("components/layout/app-shell.tsx");

    expect(globalStyles).toContain("--sl-color-brand: #087a46");
    expect(globalStyles).toContain("--pilot-canvas: var(--sl-color-canvas)");
    expect(globalStyles).toContain("--sl-control-height: 40px");
    expect(globalStyles).toContain("--sl-radius-card: 12px");
    expect(globalStyles).toContain('.slaivio-pilot [data-ui="operation-page-header"]');
    expect(globalStyles).toContain('.slaivio-pilot [data-ui="operation-table"]');
    expect(globalStyles).toContain('.slaivio-pilot [data-ui="operation-button"]');
    expect(shell).toContain('pilot ? "slaivio-pilot" : ""');
  });
});
