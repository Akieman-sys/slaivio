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
      <div className="flex min-h-[64px] flex-col gap-3 px-6 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] text-[#666]">
            <span>Opérations</span><span aria-hidden="true">›</span><span className="font-medium text-[#1f2328]">{title}</span>
          </div>
          <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-[#2f2f32]">{title}</h1>
          <p className="mt-1 max-w-4xl text-[13px] leading-5 text-[#666]">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {tabs && <div className="flex items-center gap-1 overflow-x-auto border-t border-[#eeeeeb] px-5 py-2">{tabs}</div>}
    </header>
  );
}
