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
  return <PageState icon={<LoaderCircle className="animate-spin" size={19} />} title="Chargement" description={label} />;
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
