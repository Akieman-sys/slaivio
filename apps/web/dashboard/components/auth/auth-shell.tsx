import { ReactNode } from "react";
import Image from "next/image";

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
          <div className="mb-16">
            <Image
              src="/slaivio-logo-official-dark.png"
              alt="Slaivio"
              width={232}
              height={76}
              priority
              className="h-auto w-[176px]"
            />
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

      <section className="relative hidden min-h-screen overflow-hidden bg-[#23262b] lg:block">
        <Image
          src="/landing/official/hero-dashboard.png"
          alt="Tableau de bord opérationnel Slaivio"
          fill
          priority
          sizes="54vw"
          className="object-cover object-left"
        />
        <div className="absolute inset-0 bg-black/10" />
      </section>
    </main>
  );
}
