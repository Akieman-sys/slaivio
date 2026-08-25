import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { OperationPageHeader } from "@/components/ui/operation-page-header";

export default function InboxPage() {
  return (
    <div className="min-h-full bg-[#f5f6f6]">
      <OperationPageHeader
        title="Boîte de réception"
        description="Retrouvez au même endroit les conversations WhatsApp de l’entreprise."
      />
      <main className="p-5 sm:p-6">
        <section className="grid min-h-[360px] place-items-center rounded-[8px] border border-[#e2e6e9] bg-white px-6 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#e6f4ef] text-[#087a46]">
              <MessageCircle size={20} />
            </span>
            <h2 className="mt-4 text-[15px] font-semibold text-[#25292e]">Connectez le numéro WhatsApp de l’entreprise</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#6f7780]">
              Les messages reçus apparaîtront ici dès que le canal WhatsApp Business sera configuré.
            </p>
            <Link href="/app/settings" className="mt-5 inline-flex h-9 items-center justify-center rounded-[6px] bg-[#087a46] px-4 text-[12px] font-semibold text-white hover:bg-[#07683d]">
              Ouvrir les paramètres
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
