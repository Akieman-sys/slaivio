import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OperationDrawer, OperationDrawerTabs } from "./operation-drawer";

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
});
