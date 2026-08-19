import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
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
