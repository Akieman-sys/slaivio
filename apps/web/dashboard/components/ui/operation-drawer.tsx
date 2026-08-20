"use client";

import { Archive, Edit3, RotateCcw, X } from "lucide-react";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { OperationTabMenu } from "@/components/ui/operation-controls";

export type OperationDrawerTabItem = {
  key: string;
  label: string;
  count?: number;
};

export function OperationDrawerTabs({
  items,
  value,
  onChange,
  primaryKeys,
  primaryCount = 4,
}: {
  items: OperationDrawerTabItem[];
  value: string;
  onChange: (value: string) => void;
  primaryKeys?: string[];
  primaryCount?: number;
}) {
  const visible = primaryKeys?.length
    ? items.filter((item) => primaryKeys.includes(item.key)).slice(0, primaryCount)
    : items.slice(0, primaryCount);
  const overflow = items.filter((item) => !visible.some((entry) => entry.key === item.key));
  const overflowActive = overflow.some((item) => item.key === value);

  return (
    <>
      {visible.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-current={value === item.key ? "page" : undefined}
          onClick={() => onChange(item.key)}
          className={`inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-[7px] border px-3.5 text-[14px] font-[580] transition-colors ${
            value === item.key
              ? "border-[#ccd4da] bg-white text-[#20262c] shadow-sm"
              : "border-transparent text-[#5d6873] hover:bg-[#eceff1] hover:text-[#20262c]"
          }`}
        >
          {item.label}
          {Boolean(item.count) && (
            <span className="min-w-5 rounded-full bg-[#e7ebed] px-1.5 py-0.5 text-center text-[12px] font-semibold text-[#59636c]">
              {item.count}
            </span>
          )}
        </button>
      ))}
      {overflow.length > 0 && (
        <OperationTabMenu
          items={overflow.map((item) => [item.key, item.label] as const)}
          value={overflowActive ? value : ""}
          onChange={onChange}
          className="self-center"
        />
      )}
    </>
  );
}

export function OperationDrawerAction({
  intent = "default",
  icon,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  intent?: "default" | "primary" | "danger";
  icon?: "edit" | "archive" | "restore" | ReactNode;
}) {
  const Icon = icon === "edit" ? Edit3 : icon === "archive" ? Archive : icon === "restore" ? RotateCcw : null;
  const colors = intent === "primary"
    ? "border-[#0faf63] bg-[#12c76f] text-white hover:bg-[#0faf63]"
    : intent === "danger"
      ? "border-[#e6c7c7] bg-white text-[#a62b25] hover:bg-[#fff5f5]"
      : "border-[#d4d9df] bg-white text-[#30363d] hover:bg-[#f5f7f7]";
  return (
    <button
      type="button"
      data-ui="operation-drawer-action"
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border px-3 text-[13px] font-semibold shadow-[0_1px_1px_rgba(15,23,42,.03)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${colors} ${className}`}
      {...props}
    >
      {Icon ? <Icon size={15} aria-hidden="true" /> : typeof icon === "string" ? null : icon}
      {children}
    </button>
  );
}

export function OperationDrawer({
  open,
  title,
  description,
  close,
  children,
  tabs,
  tabsVariant = "segmented",
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
        data-ui="operation-drawer"
        className={`ml-auto flex h-full w-full ${width} flex-col border-l border-[#d8dce0] bg-white shadow-[-24px_0_56px_rgba(15,23,42,.18)] transition-transform duration-200 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}
      >
        <header data-ui="operation-drawer-header" className="shrink-0 border-b border-[#dfe3e7] bg-white px-6 py-5">
          <div className="flex min-h-10 items-center gap-4">
            {headerLeading && <div className="shrink-0">{headerLeading}</div>}
            <div className="min-w-0 flex-1">
              <h2 data-ui="operation-drawer-title" className="truncate text-[20px] font-[680] tracking-[-0.02em] text-[#20252b]">
                {title}
              </h2>
              {description && (
                <p data-ui="operation-drawer-description" className="mt-1.5 max-w-2xl text-[13px] leading-5 text-[#66717c]">
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
          {headerMeta && <div data-ui="operation-drawer-meta" className="mt-2.5 flex flex-wrap items-center gap-2">{headerMeta}</div>}
        </header>
        {tabs && (
          <div className={tabsVariant === "segmented"
            ? "operation-drawer-segmented-tabs flex min-h-[58px] shrink-0 items-center gap-1.5 overflow-visible border-b border-[#dfe3e7] bg-[#f7f8f9] px-6 py-2.5"
            : "operation-tabs flex min-h-[42px] shrink-0 items-end gap-1 overflow-visible border-b border-[#dfe1e3] px-5"}
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
