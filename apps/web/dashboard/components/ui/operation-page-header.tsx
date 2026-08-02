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
    <header className="border-b border-[#d8dce2] bg-white">
      <div className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] text-[#616b77]">
            <span>Opérations</span><span aria-hidden="true">›</span><span className="font-medium text-[#1f2328]">{title}</span>
          </div>
          <h1 className="mt-3 text-[30px] font-semibold tracking-[-0.03em] text-[#1f2328]">{title}</h1>
          <p className="mt-1 max-w-4xl text-[13px] leading-5 text-[#616b77]">{description}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {tabs && <div className="flex items-center gap-1 overflow-x-auto border-t border-[#eef0f3] px-5 py-2">{tabs}</div>}
    </header>
  );
}
