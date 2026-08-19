"use client";

import { Check, Ellipsis, Menu, SlidersHorizontal, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-[#12c76f] text-white hover:bg-[#0fb766]",
  secondary: "border-[#d4d9df] bg-white text-[#30363d] hover:bg-[#f6f7f7]",
  ghost: "border-transparent bg-transparent text-[#4f5964] hover:bg-[#f0f2f2]",
  danger: "border-[#efc7c7] bg-white text-[#b42318] hover:bg-[#fff5f5]",
};

export function OperationButton({
  variant = "secondary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      data-ui="operation-button"
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
}

export function OperationTab({
  active,
  count,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      data-ui="operation-tab"
      className={`shrink-0 border-b-2 px-3 text-[13px] font-medium ${active ? "border-[#12c76f] text-[#087a46]" : "border-transparent text-[#68717b] hover:text-[#25292e]"} ${className}`}
      {...props}
    >
      {children}
      {typeof count === "number" && (
        <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-[#e8f8ef] text-[#087a46]" : "bg-[#f0f2f3] text-[#6d7680]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

export function OperationTabMenu<T extends string>({
  items,
  value,
  onChange,
  label = "Autres",
  className = "",
}: {
  items: ReadonlyArray<readonly [T, string]>;
  value?: T | "";
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const selected = items.find(([key]) => key === value);
  const anchor = root.current?.getBoundingClientRect();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      ) setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative flex shrink-0 self-center ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        aria-label={selected ? `Autres vues, vue active : ${selected[1]}` : label}
        title={selected?.[1] || label}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-[6px] border transition-colors ${selected ? "border-[#b8ddca] bg-[#edf8f2] text-[#087a46]" : "border-transparent text-[#626d77] hover:border-[#d9dde1] hover:bg-[#f4f5f5] hover:text-[#2c333a]"}`}
      >
        <Ellipsis size={16} aria-hidden="true" />
      </button>
      {open && anchor && createPortal(
        <div
          ref={menu}
          role="menu"
          className="fixed z-[90] min-w-[220px] overflow-hidden rounded-[8px] border border-[#d9dde1] bg-white p-1.5 shadow-[0_14px_36px_rgba(15,23,42,.16)]"
          style={{ top: anchor.bottom + 6, right: Math.max(8, window.innerWidth - anchor.right) }}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8a939c]">
            Autres vues
          </p>
          {items.map(([key, itemLabel]) => {
            const active = key === value;
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`flex min-h-9 w-full items-center justify-between gap-4 rounded-[6px] px-2.5 text-left text-[13px] transition-colors ${active ? "bg-[#edf8f2] font-semibold text-[#087a46]" : "text-[#3f4851] hover:bg-[#f3f5f5]"}`}
              >
                <span>{itemLabel}</span>
                {active && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

export function OperationActionMenu({ children, label = "Actions" }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const anchor = root.current?.getBoundingClientRect();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  return <div ref={root} className="relative order-first shrink-0">
    <OperationButton onClick={() => setOpen((current) => !current)} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} className="w-9 px-0">
      <Menu size={17} aria-hidden="true" />
    </OperationButton>
    {open && anchor && createPortal(
      <div ref={menu} role="menu" className="fixed z-[95] min-w-[210px] overflow-hidden rounded-[8px] border border-[#d9dde1] bg-white p-1.5 shadow-[0_14px_36px_rgba(15,23,42,.16)] [&>button]:flex [&>button]:min-h-9 [&>button]:w-full [&>button]:items-center [&>button]:gap-2 [&>button]:rounded-[6px] [&>button]:px-2.5 [&>button]:text-left [&>button]:text-[13px] [&>button]:text-[#3f4851] [&>button:hover]:bg-[#f3f5f5]" style={{ top: anchor.bottom + 6, right: Math.max(8, window.innerWidth - anchor.right) }} onClick={(event) => { if ((event.target as HTMLElement).closest("button,a")) setOpen(false); }}>
        {children}
      </div>, document.body,
    )}
  </div>;
}

export function OperationFilterPopover({
  open: controlledOpen,
  onOpenChange,
  activeCount = 0,
  onReset,
  children,
  title = "Filtrer les résultats",
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  activeCount?: number;
  onReset: () => void;
  children: ReactNode;
  title?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback((next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }, [controlledOpen, onOpenChange]);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const anchor = root.current?.getBoundingClientRect();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnResize = () => setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [open, setOpen]);

  const panelWidth = Math.min(380, typeof window === "undefined" ? 380 : window.innerWidth - 16);
  const left = anchor
    ? Math.max(8, Math.min(anchor.right - panelWidth, window.innerWidth - panelWidth - 8))
    : 8;

  const spaceBelow = anchor && typeof window !== "undefined" ? window.innerHeight - anchor.bottom - 12 : 520;
  const openAbove = Boolean(anchor && spaceBelow < 300 && anchor.top > spaceBelow);
  const maxPanelHeight = anchor && typeof window !== "undefined"
    ? Math.max(220, Math.min(560, openAbove ? anchor.top - 14 : spaceBelow))
    : 560;

  return (
    <div ref={root} className="relative">
      <OperationButton
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={open ? "border-[#9ed8bc] bg-[#edf8f2] text-[#087a46]" : ""}
      >
        <SlidersHorizontal size={15} />
        Filtres
        {activeCount > 0 && (
          <span className="rounded-full bg-[#d9f3e5] px-1.5 py-0.5 text-[10px] font-bold text-[#087a46]">
            {activeCount}
          </span>
        )}
      </OperationButton>
      {open && anchor && createPortal(
        <div
          ref={panel}
          role="dialog"
          aria-label={title}
          className="fixed z-[95] flex overflow-hidden rounded-[10px] border border-[#d9dde1] bg-white shadow-[0_18px_48px_rgba(15,23,42,.18)]"
          style={{ ...(openAbove ? { bottom: window.innerHeight - anchor.top + 7 } : { top: anchor.bottom + 7 }), left, width: panelWidth, maxHeight: maxPanelHeight, flexDirection: "column" }}
        >
          <header className="flex min-h-12 items-center justify-between border-b border-[#e6e9ec] px-4">
            <div>
              <h3 className="text-[14px] font-semibold text-[#293139]">{title}</h3>
              {activeCount > 0 && <p className="text-[11px] text-[#73808a]">{activeCount} critère{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}</p>}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-[6px] text-[#65707a] hover:bg-[#f1f3f4]" aria-label="Fermer les filtres">
              <X size={16} />
            </button>
          </header>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
            {children}
          </div>
          <footer className="flex items-center justify-between border-t border-[#e6e9ec] bg-[#fafbfb] px-4 py-3">
            <button type="button" onClick={onReset} className="text-[12px] font-semibold text-[#606b75] hover:text-[#252b31]">
              Réinitialiser
            </button>
            <OperationButton type="button" variant="primary" onClick={() => setOpen(false)}>
              Afficher les résultats
            </OperationButton>
          </footer>
        </div>,
        document.body,
      )}
    </div>
  );
}

export function OperationMetricGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div data-ui="metric-grid" className={`grid grid-cols-2 divide-x divide-y divide-[#eceff2] overflow-hidden rounded-[8px] border border-[#e2e6e9] bg-white md:grid-cols-4 md:divide-y-0 ${className}`}>{children}</div>;
}

export function OperationMetric({
  label,
  value,
  detail,
  tone = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const colors = {
    default: "text-[#25292e]",
    success: "text-[#087a46]",
    warning: "text-[#a15c00]",
    danger: "text-[#b42318]",
  };
  return (
    <div className={`min-w-0 px-4 py-3.5 ${className}`} {...props}>
      <p data-ui="metric-label" className="truncate text-[11px] font-medium text-[#6a737d]">{label}</p>
      <p data-ui="metric-value" className={`mt-1 truncate text-[23px] font-semibold tracking-[-0.035em] ${colors[tone]}`}>{value}</p>
      {detail && <p data-ui="metric-detail" className="mt-1 truncate text-[11px] text-[#7a838d]">{detail}</p>}
    </div>
  );
}

export function OperationStatus({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const colors = {
    neutral: "bg-[#f0f2f3] text-[#59636e]",
    success: "bg-[#e8f8ef] text-[#087a46]",
    warning: "bg-[#fff4df] text-[#8b5400]",
    danger: "bg-[#fff0f0] text-[#b42318]",
    info: "bg-[#edf4ff] text-[#285ea8]",
  };
  return <span data-ui="operation-status" className={`inline-flex min-h-6 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${colors[tone]}`}>{label}</span>;
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section data-ui="form-section" className="grid gap-5 border-b border-[#e5e9ed] pb-6 last:border-b-0 last:pb-0">
      <div>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#242a30]">{title}</h3>
        {description && <p className="mt-1 text-[12px] leading-5 text-[#69747f]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function OperationField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label data-ui="operation-field" className="grid min-w-0 gap-2">
      <span data-ui="field-label">{label}{required && <span className="ml-1 text-[#b42318]">*</span>}</span>
      {children}
      {hint && <small className="text-[12px] font-normal leading-[18px] text-[#74808b]">{hint}</small>}
    </label>
  );
}
