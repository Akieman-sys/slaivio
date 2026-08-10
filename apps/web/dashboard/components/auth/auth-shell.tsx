import { ReactNode } from "react";
import Image from "next/image";
import { CheckCircle2, Eye, Info, LockKeyhole } from "lucide-react";

const proofPoints = [
  "WhatsApp vers dossier en quelques secondes",
  "Suivi colis, départs, retraits et entrepôts",
  "Finance, documents et analytics dans le même OS",
];

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-white text-[#2c2c2f] lg:grid-cols-[50%_50%]">
      <section className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-24">
            <Image
              src="/slaivio-logo-official-dark.png"
              alt="Slaivio"
              width={232}
              height={76}
              priority
              className="h-auto w-[220px]"
            />
          </div>

          <div className="mb-6">
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em] text-[#333]">
              {title}
            </h1>
            <p className="mt-2 max-w-[320px] text-[16px] leading-6 text-[#333]">
              {description}
            </p>
          </div>

          <div className="slaivo-auth-panel">{children}</div>

          <div className="mt-8 flex items-start gap-3 rounded-[6px] border border-[#d9d9d6] bg-white p-4 text-[13px] leading-5 text-[#4f4f53] shadow-sm">
            <Info size={17} className="mt-0.5 shrink-0 text-[#5f5af6]" />
            <div>
              <div className="font-semibold text-[#333]">Accès agence sécurisé</div>
              <div className="mt-1">
                Connectez-vous avec le compte de votre organisation pour reprendre vos opérations.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative hidden min-h-screen overflow-hidden bg-[#625df5] lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.22))]" />
        <div className="absolute left-16 top-16 text-white/95">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[12px] font-semibold">
            <LockKeyhole size={14} />
            Cargo OS
          </div>
          <h2 className="mt-8 max-w-xl text-[44px] font-semibold leading-[1.05] tracking-[-0.02em]">
            Votre back-office cargo, clair pour les équipes et solide pour la croissance.
          </h2>
          <div className="mt-8 grid max-w-md gap-3">
            {proofPoints.map((point) => (
              <div key={point} className="flex items-center gap-3 text-[15px] text-white/92">
                <CheckCircle2 size={18} />
                {point}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-16 left-16 right-16 rounded-[8px] border border-white/25 bg-white/14 p-5 text-white shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-white text-[#625df5]">
              <Eye size={19} />
            </div>
            <div>
              <div className="text-[15px] font-semibold">Vue opérateur complète</div>
              <div className="mt-1 text-[13px] text-white/80">
                Dossiers, tracking, finance, documents et support restent dans une même interface.
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
