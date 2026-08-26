"use client";

import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect } from "react";

import { OperationButton } from "@/components/ui/operation-controls";

export function OperationConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  intent = "danger",
  close,
  confirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  intent?: "danger" | "primary";
  close: () => void;
  confirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, close, open]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[95] grid place-items-center bg-[#17212b]/45 px-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="operation-confirm-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) close();
      }}
    >
      <section className="w-full max-w-[440px] overflow-hidden rounded-[12px] border border-[#d9dee2] bg-white shadow-[0_24px_70px_rgba(15,23,42,.24)]">
        <header className="flex items-start gap-3 px-5 pb-3 pt-5">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${intent === "danger" ? "bg-[#fff0ef] text-[#b42318]" : "bg-[#eaf8f1] text-[#087a46]"}`}>
            <AlertTriangle size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="operation-confirm-title" className="text-[17px] font-semibold tracking-[-0.015em] text-[#252b31]">{title}</h2>
            <p className="mt-2 text-[13px] leading-5 text-[#66717b]">{description}</p>
          </div>
          <button type="button" disabled={busy} onClick={close} className="grid h-8 w-8 shrink-0 place-items-center rounded-[6px] text-[#65707a] hover:bg-[#f1f3f3]" aria-label="Fermer">
            <X size={16} />
          </button>
        </header>
        <footer className="flex justify-end gap-2 border-t border-[#e7eaed] bg-[#fafbfb] px-5 py-4">
          <OperationButton disabled={busy} onClick={close}>Annuler</OperationButton>
          <OperationButton variant={intent} disabled={busy} onClick={confirm}>{busy ? "Traitement…" : confirmLabel}</OperationButton>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
