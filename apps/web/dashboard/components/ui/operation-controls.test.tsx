import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  OperationButton,
  OperationActionMenu,
  OperationField,
  OperationFilterPopover,
  OperationMetric,
  OperationMetricGrid,
  OperationStatus,
  OperationTab,
  OperationTabMenu,
} from "./operation-controls";

describe("operational design primitives", () => {
  it("exposes accessible tabs and agency-friendly fields", () => {
    render(<>
      <OperationTab active count={12}>En entrepôt</OperationTab>
      <OperationField label="Pays d’origine" hint="Choisissez un pays configuré" required>
        <select aria-label="Pays d’origine"><option>Chine</option></select>
      </OperationField>
    </>);

    expect(screen.getByRole("button", { name: /En entrepôt 12/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /En entrepôt 12/i })).toHaveAttribute("data-ui", "operation-tab");
    expect(screen.getByText("Choisissez un pays configuré")).toBeInTheDocument();
  });

  it("renders the shared action, metric and status language", () => {
    render(<>
      <OperationButton variant="primary">Créer</OperationButton>
      <OperationMetricGrid><OperationMetric label="Colis" value={42} /></OperationMetricGrid>
      <OperationStatus label="Actif" tone="success" />
    </>);

    expect(screen.getByRole("button", { name: "Créer" })).toHaveAttribute("data-ui", "operation-button");
    expect(screen.getByRole("button", { name: "Créer" })).toHaveAttribute("data-variant", "primary");
    expect(screen.getByText("42")).toHaveAttribute("data-ui", "metric-value");
    expect(screen.getByText("Colis")).toHaveAttribute("data-ui", "metric-label");
    expect(screen.getByText("Actif")).toHaveAttribute("data-ui", "operation-status");
  });

  it("opens the shared secondary navigation without a Plus select", () => {
    const change = vi.fn();
    render(
      <OperationTabMenu
        items={[["analytics", "Analytics"], ["settings", "Paramètres"]]}
        value=""
        onChange={change}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Autres" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Analytics" }));
    expect(change).toHaveBeenCalledWith("analytics");
  });

  it("opens the compact shared actions menu", () => {
    render(
      <OperationActionMenu>
        <button type="button">Voir les analytics</button>
      </OperationActionMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(trigger).not.toHaveTextContent("Actions");
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir les analytics" })).toBeInTheDocument();
  });

  it("opens the shared filter panel and exposes reset and apply actions", () => {
    const reset = vi.fn();
    render(
      <OperationFilterPopover activeCount={2} onReset={reset} title="Filtrer les colis">
        <OperationField label="Entrepôt">
          <select><option>Guangzhou</option></select>
        </OperationField>
      </OperationFilterPopover>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Filtres 2/i }));
    expect(screen.getByRole("dialog", { name: "Filtrer les colis" })).toBeInTheDocument();
    expect(screen.getByText("2 critères actifs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(reset).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Afficher les résultats" }));
    expect(screen.queryByRole("dialog", { name: "Filtrer les colis" })).not.toBeInTheDocument();
  });
});
