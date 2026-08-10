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
    <header className="border-b border-[#d9d9d6] bg-white">
      <div className="flex min-h-[58px] flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[#ffba00] text-[15px] font-semibold text-[#202124] shadow-sm ring-1 ring-black/10">
            {title.slice(0, 2)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-[#202124]">{title}</h1>
            <p className="mt-0.5 max-w-4xl truncate text-[13px] leading-5 text-[#6b7075]">{description}</p>
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs && <div className="flex min-h-[36px] items-center gap-1 overflow-x-auto border-t border-[#eeeeeb] bg-[#fff7df] px-5 py-1">{tabs}</div>}
    </header>
  );
}
