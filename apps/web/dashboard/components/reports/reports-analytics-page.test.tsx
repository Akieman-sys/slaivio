import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportsAnalyticsPage } from "./reports-analytics-page";
import * as reportsService from "@/services/reports";

vi.mock("@/services/reports", () => ({
  getAnalytics: vi.fn(),
  previewReport: vi.fn(),
  exportReport: vi.fn(),
  saveReportView: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(reportsService.getAnalytics).mockRejectedValue(new Error("offline"));
});

describe("ReportsAnalyticsPage", () => {
  it("shows one actionable error state when analytics cannot be loaded", async () => {
    render(<ReportsAnalyticsPage />);

    expect(await screen.findByText("Analytics indisponibles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.queryByText("Analytics temporairement indisponibles")).not.toBeInTheDocument();
  });
});
