import type { ReactNode } from "react";

export function OperationPageHeader({
  title,
  description,
  actions,
  tabs,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  tabs?: ReactNode;
}) {
  return (
    <header className="operation-page-header border-b border-[#dfe1e3] bg-white">
      <div className="flex min-h-[72px] flex-col gap-3 px-5 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[21px] font-semibold text-[#25292e]">{title}</h1>
          <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#69717a]">
            {description}
          </p>
        </div>
        {actions && (
          <div className="operation-actions flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {tabs && <OperationTabs>{tabs}</OperationTabs>}
    </header>
  );
}

export function OperationTabs({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <nav
      className={`operation-tabs flex min-h-[42px] items-end gap-1 overflow-x-auto border-b border-[#d8dce2] bg-white px-5 sm:px-6 ${className}`}
      aria-label="Vues du module"
    >
      {children}
    </nav>
  );
}
