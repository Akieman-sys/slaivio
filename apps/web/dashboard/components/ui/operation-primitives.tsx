import { Search } from "lucide-react";
import type { ReactNode } from "react";

export function OperationMetrics({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`operation-metrics border-b border-[#dfe3e7] bg-white px-5 py-4 sm:px-6 ${className}`}>{children}</section>;
}

export function OperationToolbar({
  search,
  filters,
  children,
  className = "",
}: {
  search?: ReactNode;
  filters?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`operation-toolbar flex min-h-[54px] flex-col gap-2 border-b border-[#e1e5e9] bg-white px-5 py-2 sm:px-6 lg:flex-row lg:items-center ${className}`}>
      <div className="min-w-0 flex-1">{search}</div>
      {filters && <div className="flex shrink-0 flex-wrap items-center gap-2">{filters}</div>}
      {children}
    </div>
  );
}

export function OperationSearch({
  value,
  onChange,
  placeholder = "Rechercher",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex h-9 w-full max-w-[360px] items-center gap-2 rounded-[6px] border border-[#d4d9df] bg-white px-3 focus-within:border-[#12a865] focus-within:ring-2 focus-within:ring-[#12c76f]/10">
      <Search size={15} className="shrink-0 text-[#69727c]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#8a929b]"
      />
    </label>
  );
}

export function ActiveFilterBar({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className="operation-filter-bar flex min-h-10 flex-wrap items-center gap-2 border-b border-[#e5e8eb] bg-[#fafbfb] px-5 py-2 sm:px-6">{children}</div>;
}

export function OperationTable({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`operation-table min-w-0 overflow-hidden rounded-[8px] border border-[#dfe3e7] bg-white ${className}`}>
      <div className="max-w-full overflow-auto">{children}</div>
    </section>
  );
}

export function OperationContent({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`operation-content min-w-0 px-5 py-5 sm:px-6 ${className}`}>{children}</div>;
}
