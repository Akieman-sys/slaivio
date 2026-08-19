"use client";

import { Check, Ellipsis } from "lucide-react";
import { createPortal } from "react-dom";
import {
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
    <div ref={root} className={`relative ml-auto flex shrink-0 self-center ${className}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex h-8 items-center gap-2 rounded-[6px] border px-2.5 text-[12px] font-semibold transition-colors ${selected ? "border-[#b8ddca] bg-[#edf8f2] text-[#087a46]" : "border-transparent text-[#626d77] hover:border-[#d9dde1] hover:bg-[#f4f5f5] hover:text-[#2c333a]"}`}
      >
        <Ellipsis size={16} aria-hidden="true" />
        <span>{selected?.[1] || label}</span>
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
