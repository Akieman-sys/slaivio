import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  OperationButton,
  OperationField,
  OperationMetric,
  OperationMetricGrid,
  OperationStatus,
  OperationTab,
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
    expect(screen.getByText("Choisissez un pays configuré")).toBeInTheDocument();
  });

  it("renders the shared action, metric and status language", () => {
    render(<>
      <OperationButton variant="primary">Créer</OperationButton>
      <OperationMetricGrid><OperationMetric label="Colis" value={42} /></OperationMetricGrid>
      <OperationStatus label="Actif" tone="success" />
    </>);

    expect(screen.getByRole("button", { name: "Créer" })).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Actif")).toBeInTheDocument();
  });
});
