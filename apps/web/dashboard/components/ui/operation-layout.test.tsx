import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OperationButton, OperationMetric, OperationMetricGrid, OperationTab } from "./operation-controls";
import { OperationPageHeader } from "./operation-page-header";
import { OperationMetrics, OperationSearch, OperationTable, OperationToolbar } from "./operation-primitives";

describe("Pilot visual foundation", () => {
  it("exposes one shared structure for operational pages", () => {
    const change = vi.fn();
    render(
      <main>
        <OperationPageHeader
          title="Dossiers"
          description="Suivez le travail de l’agence."
          actions={<OperationButton variant="primary">Nouveau dossier</OperationButton>}
          tabs={<OperationTab active>Tous</OperationTab>}
        />
        <OperationMetrics>
          <OperationMetricGrid><OperationMetric label="Actifs" value={12} /></OperationMetricGrid>
        </OperationMetrics>
        <OperationToolbar search={<OperationSearch value="" onChange={change} placeholder="Rechercher un dossier" />} />
        <OperationTable><table><tbody><tr><td>DOS-001</td></tr></tbody></table></OperationTable>
      </main>,
    );

    expect(screen.getByRole("heading", { name: "Dossiers" }).closest("header")).toHaveAttribute("data-ui", "operation-page-header");
    expect(screen.getByRole("navigation", { name: "Vues du module" })).toHaveAttribute("data-ui", "operation-tabs");
    expect(screen.getByText("Actifs").closest("section")).toHaveAttribute("data-ui", "operation-metrics");
    expect(screen.getByText("DOS-001").closest("section")).toHaveAttribute("data-ui", "operation-table");

    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un dossier" }), { target: { value: "DOS" } });
    expect(change).toHaveBeenCalledWith("DOS");
  });
});
