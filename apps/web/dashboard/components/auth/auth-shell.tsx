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
        </div>
      </section>

      <section className="relative hidden min-h-screen overflow-hidden bg-[#625df5] lg:block">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.22))]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_65%_20%,rgba(255,255,255,0.34),transparent_34%)]" />
        <div className="absolute bottom-[-120px] right-[-80px] h-[360px] w-[360px] rounded-full bg-white/20 blur-3xl" />
        <div className="absolute left-[18%] top-[18%] h-[180px] w-[280px] rounded-[18px] border border-white/20 bg-white/10 shadow-2xl backdrop-blur" />
        <div className="absolute left-[28%] top-[42%] h-[140px] w-[420px] rounded-[18px] border border-white/20 bg-white/12 shadow-2xl backdrop-blur" />
      </section>
    </main>
  );
}
