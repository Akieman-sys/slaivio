"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export function OperationDrawer({
  open,
  title,
  description,
  close,
  children,
  tabs,
  tabsVariant = "underline",
  headerActions,
  headerLeading,
  headerMeta,
  footer,
  bodyClassName = "",
  width = "max-w-[720px]",
}: {
  open: boolean;
  title: string;
  description?: string;
  close: () => void;
  children: ReactNode;
  tabs?: ReactNode;
  tabsVariant?: "underline" | "segmented";
  headerActions?: ReactNode;
  headerLeading?: ReactNode;
  headerMeta?: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
  width?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setVisible(true));
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previous;
      setVisible(false);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open]);
  if (!open) return null;
  return (
    <div
      className={`fixed inset-0 z-[65] bg-[#17212b]/35 backdrop-blur-[1px] transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <aside
        className={`ml-auto flex h-full w-full ${width} flex-col border-l border-[#d8dce0] bg-white shadow-[-24px_0_56px_rgba(15,23,42,.18)] transition-transform duration-200 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="shrink-0 border-b border-[#dfe3e7] bg-white px-6 py-5">
          <div className="flex min-h-10 items-center gap-4">
            {headerLeading && <div className="shrink-0">{headerLeading}</div>}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[20px] font-[680] tracking-[-0.02em] text-[#20252b]">
                {title}
              </h2>
              {description && (
                <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-[#66717c]">
                  {description}
                </p>
              )}
            </div>
            {headerActions && (
              <div className="flex shrink-0 items-center gap-1.5">
                {headerActions}
              </div>
            )}
            <button
              type="button"
              onClick={close}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-[7px] text-[#59616a] transition-colors hover:bg-[#f0f2f3] hover:text-[#20252b]"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
          {headerMeta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{headerMeta}</div>}
        </header>
        {tabs && (
          <div className={tabsVariant === "segmented"
            ? "operation-drawer-segmented-tabs flex min-h-[58px] shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[#dfe3e7] bg-[#f7f8f9] px-6 py-2.5"
            : "operation-tabs flex min-h-[42px] shrink-0 items-end gap-1 overflow-x-auto border-b border-[#dfe1e3] px-5"}
          >
            {tabs}
          </div>
        )}
        <div className={`operation-form-surface min-h-0 flex-1 overflow-y-auto bg-white p-6 sm:p-7 ${bodyClassName}`}>
          {children}
        </div>
        {footer && <footer className="operation-drawer-footer flex min-h-[68px] shrink-0 items-center justify-end gap-2.5 border-t border-[#dfe3e7] bg-[#fbfcfc] px-6 py-3.5">{footer}</footer>}
      </aside>
    </div>
  );
}
