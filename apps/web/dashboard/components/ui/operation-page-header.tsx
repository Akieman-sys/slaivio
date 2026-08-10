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
    <header className="border-b border-[#dfe1e3] bg-white">
      <div className="flex min-h-[72px] flex-col gap-3 px-5 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-[#25292e]">{title}</h1>
          <p className="mt-1 max-w-4xl text-[12px] leading-5 text-[#69717a]">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="flex min-h-[40px] items-center gap-1 overflow-x-auto border-t border-[#eceeef] bg-[#fafafa] px-5 py-1 sm:px-6">{tabs}</div>}
    </header>
  );
}
