"use client";

import { FormEvent, useEffect, useState } from "react";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { catalog, type Service } from "@/services/route-catalog";
import { listShipments, type ExpeditionRecord } from "@/services/shipments";
import {
  allocateDeparture,
  createDeparture,
  departures,
  type Departure,
} from "@/services/departures";

const input =
  "h-9 w-full rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[12px] outline-none focus:border-[#16855f]";
const button =
  "inline-flex h-9 items-center justify-center rounded-[5px] border border-[#d6dadd] bg-white px-3 text-[12px] font-medium hover:bg-[#f5f6f6]";
const primary =
  "inline-flex h-9 items-center justify-center rounded-[5px] bg-[#16855f] px-4 text-[12px] font-semibold text-white hover:bg-[#126f50]";
const label = "grid gap-1.5 text-[12px] font-medium text-[#34393f]";

export function DepartureCommandCenter() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "allocate">("create");
  const [services, setServices] = useState<Service[]>([]);
  const [deps, setDeps] = useState<Departure[]>([]);
  const [ships, setShips] = useState<ExpeditionRecord[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    Promise.all([catalog(), departures(), listShipments({ page_size: 100 })])
      .then(([catalogData, departureItems, shipmentData]) => {
        setServices(catalogData.services);
        setDeps(departureItems);
        setShips(shipmentData.items);
      })
      .catch(() => setError("Les données nécessaires sont indisponibles."));
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "");
    const number = (key: string) => Number(form.get(key) || 0);
    try {
      if (mode === "create") {
        await createDeparture({
          shipping_service_id: value("service"),
          scheduled_at: new Date(value("scheduled")).toISOString(),
          cutoff_at: value("cutoff")
            ? new Date(value("cutoff")).toISOString()
            : null,
          estimated_arrival_at: value("arrival")
            ? new Date(value("arrival")).toISOString()
            : null,
          capacity_weight_kg: number("weight") || null,
          capacity_cbm: number("cbm") || null,
          carrier_name: value("carrier") || null,
          transport_reference: value("reference") || null,
          notes: null,
        });
      } else {
        const shipment = ships.find((item) => item.id === value("shipment"));
        if (!shipment) throw new Error("Expédition introuvable");
        await allocateDeparture(value("departure"), {
          shipment_id: shipment.id,
          weight_kg: shipment.total_weight_kg || 0,
          volume_cbm: shipment.total_volume_cbm || 0,
          idempotency_key: crypto.randomUUID(),
        });
      }
      location.reload();
    } catch (caught) {
      setError(
        (caught as { response?: { data?: { detail?: string } } })?.response
          ?.data?.detail || "Action impossible.",
      );
    }
  }

  return (
    <>
      <button
        className="fixed bottom-5 right-5 z-40 rounded-[5px] bg-[#16855f] px-4 py-2 text-[13px] font-semibold text-white"
        onClick={() => setOpen(true)}
      >
        Gérer les départs
      </button>
      <OperationDrawer
        open={open}
        close={() => setOpen(false)}
        title={mode === "create" ? "Nouveau départ" : "Affecter une expédition"}
        description="Planifiez un départ ou rattachez une expédition à un départ ouvert."
        width="max-w-[640px]"
      >
        <form onSubmit={submit}>
          <div className="flex rounded-[5px] border border-[#d6dadd] bg-[#f7f7f6] p-1">
            <button
              type="button"
              className={mode === "create" ? primary : `${button} border-0 bg-transparent`}
              onClick={() => setMode("create")}
            >
              Créer un départ
            </button>
            <button
              type="button"
              className={mode === "allocate" ? primary : `${button} border-0 bg-transparent`}
              onClick={() => setMode("allocate")}
            >
              Affecter une expédition
            </button>
          </div>
          {mode === "create" ? (
            <>
              <label className={label}>
                Service d’expédition
                <select required name="service" className={input}>
                  <option value="">Sélectionner un service</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.service_name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={label}>
                  Départ planifié
                  <input required name="scheduled" type="datetime-local" className={input} />
                </label>
                <label className={label}>
                  Heure limite
                  <input name="cutoff" type="datetime-local" className={input} />
                </label>
                <label className={label}>
                  Arrivée estimée
                  <input name="arrival" type="datetime-local" className={input} />
                </label>
                <label className={label}>
                  Capacité en kg
                  <input name="weight" type="number" min="0" step="0.001" className={input} />
                </label>
                <label className={label}>
                  Capacité en CBM
                  <input name="cbm" type="number" min="0" step="0.001" className={input} />
                </label>
                <label className={label}>
                  Transporteur
                  <input name="carrier" className={input} placeholder="Nom du transporteur" />
                </label>
              </div>
              <label className={label}>
                Référence de transport
                <input name="reference" className={input} placeholder="Vol, navire ou conteneur" />
              </label>
            </>
          ) : (
            <>
              <label className={label}>
                Départ ouvert
                <select required name="departure" className={input}>
                  <option value="">Sélectionner un départ</option>
                  {deps
                    .filter((departure) => departure.status === "OPEN")
                    .map((departure) => (
                      <option key={departure.id} value={departure.id}>
                        {departure.departure_code}
                      </option>
                    ))}
                </select>
              </label>
              <label className={label}>
                Expédition
                <select required name="shipment" className={input}>
                  <option value="">Sélectionner une expédition</option>
                  {ships.map((shipment) => (
                    <option key={shipment.id} value={shipment.id}>
                      {shipment.expedition_reference} · {shipment.total_weight_kg} kg
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {error && (
            <p className="rounded-[5px] bg-red-50 p-3 text-[12px] text-red-700">{error}</p>
          )}
          <footer className="flex justify-end gap-2 border-t pt-4">
            <button type="button" className={button} onClick={() => setOpen(false)}>
              Annuler
            </button>
            <button className={primary}>Valider</button>
          </footer>
        </form>
      </OperationDrawer>
    </>
  );
}
