import { AlertTriangle, Ban, Inbox, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

type StateProps = { title: string; description: string; action?: ReactNode };

function PageState({ icon, title, description, action }: StateProps & { icon: ReactNode }) {
  return <div className="flex min-h-[280px] items-center justify-center bg-white p-6">
    <section className="w-full max-w-md text-center" role="status">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[8px] bg-[#f0f2f2] text-[#65707b]">{icon}</div>
      <h2 className="mt-4 text-[16px] font-semibold text-[#25292e]">{title}</h2>
      <p className="mt-1.5 text-[13px] leading-5 text-[#6d7680]">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </section>
  </div>;
}

export function LoadingState({ label = "Chargement des données…" }: { label?: string }) {
  return <div className="grid min-h-[280px] place-items-center bg-white p-6" role="status" aria-live="polite">
    <div className="flex flex-col items-center text-center">
      <span className="flex h-8 items-center gap-1" aria-hidden>{[0, 1, 2].map((item) => <span key={item} className="h-2 w-2 animate-bounce rounded-full bg-[#12c76f]" style={{ animationDelay: `${item * 120}ms` }} />)}</span>
      <p className="mt-3 text-[13px] font-medium text-[#65707b]">{label}</p>
    </div>
  </div>;
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[5px] bg-[#e9ecee] ${className}`} />;
}

export function TableSkeleton({ rows = 6, columns = 5, label = "Chargement du tableau" }: { rows?: number; columns?: number; label?: string }) {
  const cells = Array.from({ length: Math.max(2, columns) });
  return <div className="bg-white" role="status" aria-label={label}>
    <div className="grid h-11 items-center gap-5 border-b border-[#e4e7ea] bg-[#f7f8fa] px-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(72px, 1fr))` }}>
      {cells.map((_, index) => <SkeletonLine key={index} className={`h-2.5 ${index % 3 === 0 ? "w-24" : index % 3 === 1 ? "w-16" : "w-20"}`} />)}
    </div>
    {Array.from({ length: rows }, (_, index) => <div key={index} className="grid h-14 items-center gap-5 border-b border-[#eef0f2] px-5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(72px, 1fr))` }}>
      {cells.map((_, cell) => <SkeletonLine key={cell} className={`h-3 ${cell % 3 === 0 ? "w-2/3" : cell % 3 === 1 ? "w-1/2" : "w-3/5"}`} />)}
    </div>)}
  </div>;
}

export function ModulePageSkeleton() {
  return <div className="min-h-full bg-[#f5f6f6]" role="status" aria-label="Ouverture du module">
    <div className="border-b border-[#dfe3e7] bg-white px-5 py-4 sm:px-6"><SkeletonLine className="h-5 w-44" /><SkeletonLine className="mt-2 h-3 w-[min(440px,75%)]" /></div>
    <div className="flex h-11 items-end gap-5 border-b border-[#dfe3e7] bg-white px-5 sm:px-6">{["w-24", "w-20", "w-28", "w-20"].map((width, index) => <SkeletonLine key={index} className={`mb-3 h-3 ${width}`} />)}</div>
    <div className="border-b border-[#dfe3e7] bg-white px-5 py-4 sm:px-6"><div className="grid grid-cols-2 divide-x divide-y divide-[#eceff2] overflow-hidden rounded-[8px] border border-[#e2e6e9] md:grid-cols-4 md:divide-y-0">{Array.from({ length: 4 }, (_, index) => <div key={index} className="px-4 py-3.5"><SkeletonLine className="h-2.5 w-20" /><SkeletonLine className="mt-2 h-6 w-14" /></div>)}</div></div>
    <div className="flex h-[54px] items-center border-b border-[#e1e5e9] bg-white px-5 sm:px-6"><SkeletonLine className="h-9 w-[min(360px,70%)]" /></div>
    <TableSkeleton />
  </div>;
}

export function EmptyState(props: StateProps) { return <PageState icon={<Inbox size={19} />} {...props} />; }

export function ErrorState({ retry, ...props }: StateProps & { retry?: () => void }) {
  const action = retry ? <button onClick={retry} className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-[#25292e] px-3 text-[13px] font-medium text-white hover:bg-black"><RotateCw size={15} /> Réessayer</button> : props.action;
  return <PageState icon={<AlertTriangle size={19} />} {...props} action={action} />;
}

export function ForbiddenState({ description = "Votre rôle ne permet pas d’accéder à cette section." }: { description?: string }) {
  return <PageState icon={<Ban size={19} />} title="Accès refusé" description={description} />;
}
