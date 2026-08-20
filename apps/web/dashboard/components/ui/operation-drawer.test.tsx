import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OperationDrawer, OperationDrawerAction, OperationDrawerTabs } from "./operation-drawer";
import { businessLabel } from "./business-labels";

describe("OperationDrawer", () => {
  it("uses the shared segmented navigation for detail panels", () => {
    const change = vi.fn();
    render(
      <OperationDrawer
        open
        title="Fiche opérationnelle"
        close={vi.fn()}
        tabsVariant="segmented"
        tabs={
          <OperationDrawerTabs
            items={[
              { key: "summary", label: "Vue d’ensemble" },
              { key: "operations", label: "Opérations" },
              { key: "history", label: "Historique" },
            ]}
            value="summary"
            onChange={change}
          />
        }
      >
        Contenu
      </OperationDrawer>,
    );

    expect(screen.getByRole("button", { name: "Vue d’ensemble" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Opérations" }));
    expect(change).toHaveBeenCalledWith("operations");
  });

  it("moves surplus detail tabs into the three-dot menu", () => {
    render(
      <OperationDrawerTabs
        items={[
          { key: "summary", label: "Résumé" },
          { key: "packages", label: "Colis" },
          { key: "documents", label: "Documents" },
          { key: "history", label: "Historique" },
          { key: "audit", label: "Audit" },
        ]}
        value="summary"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Audit" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Autres" })).toBeInTheDocument();
  });

  it("shares professional action buttons and human business labels", () => {
    render(<OperationDrawerAction intent="danger" icon="archive">Archiver</OperationDrawerAction>);
    expect(screen.getByRole("button", { name: "Archiver" })).toHaveAttribute("data-ui", "operation-drawer-action");
    expect(businessLabel("DOCUMENT_MISSING")).toBe("Document manquant");
    expect(businessLabel("DUE")).toBe("À effectuer");
  });
});
