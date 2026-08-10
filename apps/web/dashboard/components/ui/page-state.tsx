import { AlertTriangle, Ban, Inbox, LoaderCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

type StateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

function PageState({ icon, title, description, action }: StateProps & { icon: ReactNode }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center p-6">
      <section className="w-full max-w-md rounded-lg border border-[var(--line)] bg-white p-7 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]" role="status">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-[#f0f0ee] text-slate-600">{icon}</div>
        <h1 className="mt-4 text-base font-semibold text-[var(--ink)]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </section>
    </div>
  );
}

export function LoadingState({ label = "Chargement des données…" }: { label?: string }) {
  return (
    <div className="grid min-h-[46vh] place-items-center bg-[#f7f7f6] p-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center text-center">
        <span className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-[9px] bg-[#087a46] shadow-[0_8px_24px_rgba(8,122,70,.18)]"><span className="absolute inset-0 animate-pulse bg-white/10" /><LoaderCircle className="relative animate-spin text-white" size={19} /></span>
        <p className="mt-4 text-[13px] font-medium text-[#343a40]">{label}</p>
        <span className="mt-3 h-1 w-32 overflow-hidden rounded-full bg-[#dde2df]"><span className="block h-full w-1/2 animate-[slaivioLoading_1.25s_ease-in-out_infinite] rounded-full bg-[#16855f]" /></span>
      </div>
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <PageState icon={<Inbox size={19} />} {...props} />;
}

export function ErrorState({ retry, ...props }: StateProps & { retry?: () => void }) {
  const action = retry ? (
    <button onClick={retry} className="inline-flex h-9 items-center gap-2 rounded-md bg-[#292928] px-3 text-sm font-medium text-white hover:bg-black">
      <RotateCw size={15} /> Réessayer
    </button>
  ) : props.action;
  return <PageState icon={<AlertTriangle size={19} />} {...props} action={action} />;
}

export function ForbiddenState({ description = "Votre rôle ne permet pas d’accéder à cette section." }: { description?: string }) {
  return <PageState icon={<Ban size={19} />} title="Accès refusé" description={description} />;
}
