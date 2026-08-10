import { ReactNode } from "react";

import { SlaivioBrand } from "@/components/ui/slaivio-brand";

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
    <main className="grid min-h-screen bg-white text-[#25292e] lg:grid-cols-[46%_54%]">
      <section className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-14">
            <SlaivioBrand />
          </div>

          <div className="mb-6">
            <h1 className="text-[30px] font-semibold leading-tight text-[#25292e]">
              {title}
            </h1>
            <p className="mt-2 max-w-[380px] text-[14px] leading-6 text-[#69717a]">
              {description}
            </p>
          </div>

          <div className="slaivo-auth-panel">{children}</div>
        </div>
      </section>

      <section className="slaivio-auth-visual relative hidden min-h-screen overflow-hidden lg:flex lg:items-center lg:justify-center">
        <div className="slaivio-auth-grid absolute inset-0" />
        <h2 className="relative z-10 max-w-[620px] px-14 text-center text-[46px] font-semibold leading-[1.12] text-white">
          Pilotez chaque mouvement cargo avec clarté.
        </h2>
      </section>
    </main>
  );
}
