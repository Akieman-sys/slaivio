"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

export function SettingsDialog({
  title,
  description,
  navigation,
  children,
  onClose,
}: {
  title: string;
  description: string;
  navigation: ReactNode;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex bg-[#202124]/45 p-0 sm:p-5 lg:p-[4vh]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mx-auto grid h-full w-full max-w-[1440px] overflow-hidden bg-white shadow-[0_24px_80px_rgba(15,23,42,.24)] sm:max-h-[920px] sm:rounded-[8px] sm:border sm:border-[#d8dadd] lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="settings-dialog-navigation min-w-0 overflow-y-auto border-b border-[#dfe1e3] bg-[#fafafa] p-3 lg:border-b-0 lg:border-r">
          <p className="px-2 pb-2 pt-1 text-[11px] font-medium text-[#707780]">Paramètres</p>
          {navigation}
        </aside>
        <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
          <header className="flex min-h-[64px] items-center gap-4 border-b border-[#dfe1e3] px-5 sm:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-semibold text-[#25292e]">{title}</h1>
              <p className="truncate text-[12px] text-[#69717a]">{description}</p>
            </div>
            <button type="button" onClick={onClose} className="ml-auto grid size-9 shrink-0 place-items-center rounded-[5px] text-[#4e555c] hover:bg-[#f0f1f2]" aria-label="Fermer les paramètres" title="Fermer">
              <X size={18} />
            </button>
          </header>
          <div className="min-h-0 overflow-y-auto">{children}</div>
        </section>
      </div>
    </div>
  );
}
