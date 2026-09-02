"use client";

import { Archive, Edit3, RotateCcw, Trash2, X } from "lucide-react";
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
          className={`relative inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 text-[14px] font-[580] transition-colors ${
            value === item.key
              ? "border-[#12ad64] text-[#126847]"
              : "border-transparent text-[#6b747d] hover:border-[#cbd2d6] hover:text-[#20262c]"
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
  icon?: "edit" | "archive" | "restore" | "delete" | ReactNode;
}) {
  const textLabel = typeof children === "string" ? children : undefined;
  const resolvedIcon = icon || (intent === "danger" && textLabel && ["Retirer", "Supprimer"].some(label=>textLabel.startsWith(label)) ? "delete" : undefined);
  const Icon = resolvedIcon === "edit" ? Edit3 : resolvedIcon === "archive" ? Archive : resolvedIcon === "restore" ? RotateCcw : resolvedIcon === "delete" ? Trash2 : null;
  const iconOnly = Boolean(resolvedIcon && textLabel && ["Modifier", "Retirer", "Archiver", "Restaurer", "Supprimer"].some(label=>textLabel.startsWith(label)));
  const colors = intent === "primary"
    ? "border-[#0faf63] bg-[#12c76f] text-white hover:bg-[#0faf63]"
    : intent === "danger"
      ? "border-[#e6c7c7] bg-white text-[#a62b25] hover:bg-[#fff5f5]"
      : "border-[#d4d9df] bg-white text-[#30363d] hover:bg-[#f5f7f7]";
  return (
    <button
      type="button"
      {...props}
      data-ui="operation-drawer-action"
      aria-label={iconOnly ? props["aria-label"] || textLabel : props["aria-label"]}
      title={iconOnly ? props.title || textLabel : props.title}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border text-[13px] font-semibold shadow-[0_1px_1px_rgba(15,23,42,.03)] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${iconOnly ? "w-9 px-0" : "px-3"} ${colors} ${className}`}
    >
      {Icon ? <Icon size={15} aria-hidden="true" /> : typeof resolvedIcon === "string" ? null : resolvedIcon}
      {iconOnly ? <span className="sr-only">{children}</span> : children}
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
      className={`fixed inset-0 z-[65] flex items-center justify-center bg-[#17212b]/35 p-3 backdrop-blur-[1px] transition-opacity duration-200 sm:p-6 ${visible ? "opacity-100" : "opacity-0"}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) close();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <section
        data-ui="operation-drawer"
        className={`flex max-h-[calc(100dvh-24px)] w-full ${width} flex-col overflow-hidden rounded-[12px] border border-[#d8dce0] bg-white shadow-[0_24px_72px_rgba(15,23,42,.22)] transition duration-200 ease-out sm:max-h-[calc(100dvh-48px)] ${visible ? "scale-100 opacity-100" : "scale-[.98] opacity-0"}`}
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
            ? "operation-drawer-segmented-tabs flex min-h-[52px] shrink-0 items-end gap-6 overflow-visible border-b border-[#dfe3e7] bg-white px-6"
            : "operation-tabs flex min-h-[42px] shrink-0 items-end gap-6 overflow-visible border-b border-[#dfe1e3] px-5"}
          >
            {tabs}
          </div>
        )}
        <div className={`operation-form-surface min-h-0 flex-1 overflow-y-auto bg-white p-6 sm:p-7 ${bodyClassName}`}>
          {children}
        </div>
        {footer && <footer className="operation-drawer-footer flex min-h-[68px] shrink-0 items-center justify-end gap-2.5 border-t border-[#dfe3e7] bg-[#fbfcfc] px-6 py-3.5">{footer}</footer>}
      </section>
    </div>
  );
}
