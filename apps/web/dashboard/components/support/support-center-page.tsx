"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronRight, Download, LifeBuoy, MessageSquare, Paperclip, Plus, RefreshCcw } from "lucide-react";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer } from "@/components/ui/operation-drawer";
import { OperationPageHeader, OperationTabs } from "@/components/ui/operation-page-header";
import { OperationContent, OperationSearch, OperationTable, OperationToolbar } from "@/components/ui/operation-primitives";
import {
  addTicketMessage,
  createTicket,
  getTicket,
  listArticles,
  listTickets,
  ticketAttachmentUrl,
  transitionTicket,
  uploadTicketAttachment,
  type Article,
  type Ticket,
  type TicketDetail,
} from "@/services/support";

const button = "inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-[#d3d8dd] bg-white px-3 text-[13px] text-[#2f3437] hover:bg-[#f5f6f6]";
const primary = "inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-[#167d57] px-3 text-[13px] font-medium text-white hover:bg-[#116b49]";
const input = "h-9 w-full rounded-[5px] border border-[#d3d8dd] bg-white px-3 text-[13px] outline-none focus:border-[#167d57] focus:ring-2 focus:ring-[#12c76f]/10";

export function SupportCenterPage() {
  const [tab, setTab] = useState<"help" | "tickets">("help");
  const [articles, setArticles] = useState<Article[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [article, setArticle] = useState<Article | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTab(params.get("view") === "tickets" ? "tickets" : "help");
    if (params.get("new") === "1") setCreating(true);
  }, []);

  const load = useCallback(async () => {
    try {
      setError("");
      const [nextArticles, nextTickets] = await Promise.all([
        listArticles(tab === "help" ? q : undefined),
        listTickets({ status: status || undefined, q: tab === "tickets" && q ? q : undefined }),
      ]);
      setArticles(nextArticles);
      setTickets(nextTickets);
    } catch {
      setError("Le centre de support est indisponible.");
    }
  }, [q, status, tab]);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  async function open(id: string) {
    setSelected(await getTicket(id));
  }

  return (
    <div className="min-h-full bg-[#f7f8f8]">
      <OperationPageHeader
        title="Support et Centre d’aide"
        description="Consultez les ressources utiles et suivez les demandes adressées à l’équipe Slaivio."
        actions={
          <>
            <button className={button} onClick={load}><RefreshCcw size={15} />Actualiser</button>
            <PermissionGuard permission="support.create">
              <button className={primary} onClick={() => setCreating(true)}>
                <Plus size={15} />
                Nouveau ticket
              </button>
            </PermissionGuard>
          </>
        }
      />
      <OperationTabs>
        <Tab active={tab === "help"} onClick={() => setTab("help")} icon={<BookOpen size={16} />} label="Centre d’aide" />
        <Tab active={tab === "tickets"} onClick={() => setTab("tickets")} icon={<LifeBuoy size={16} />} label={`Tickets (${tickets.length})`} />
      </OperationTabs>
      <OperationToolbar
        search={<OperationSearch value={q} onChange={setQ} placeholder="Rechercher un article ou un ticket" />}
        filters={
          tab === "tickets" ? (
            <select className={`${input} max-w-[210px]`} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tous les statuts</option>
              {["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED", "REOPENED"].map((item) => <option key={item}>{item}</option>)}
            </select>
          ) : undefined
        }
      />

      <OperationContent>
        {error && <p className="mb-3 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        {tab === "help" ? <ArticleGrid articles={articles} open={setArticle} /> : <TicketTable tickets={tickets} open={open} />}
      </OperationContent>

      {creating && <Create close={() => setCreating(false)} done={async (id) => { setCreating(false); setTab("tickets"); await load(); await open(id); }} />}
      {selected && <Detail detail={selected} close={() => setSelected(null)} reload={() => open(selected.ticket.id)} />}
      {article && (
        <Panel close={() => setArticle(null)} title={article.title} description={article.category}>
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-[#2f3437]">{article.content}</p>
        </Panel>
      )}
    </div>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex h-[42px] items-center gap-2 border-b-2 px-2 text-[13px] ${active ? "border-[#167d57] font-medium text-[#126543]" : "border-transparent text-[#69717a] hover:text-[#25292e]"}`}>
      {icon}
      {label}
    </button>
  );
}

function ArticleGrid({ articles, open }: { articles: Article[]; open: (article: Article) => void }) {
  if (!articles.length) {
    return <div className="rounded-[6px] border border-[#d3d3d0] bg-white p-16 text-center text-[13px] text-[#9aa0a6]">Aucun article d’aide dans cette vue.</div>;
  }
  return (
    <OperationTable className="overflow-hidden rounded-[6px] border border-[#d3d8dd]">
      <div className="grid grid-cols-[220px_1fr_80px] border-b border-[#d9d9d6] bg-[#f7f7f5] px-4 py-2 text-[12px] font-medium text-[#5f6368]">
        <span>Catégorie</span><span>Article</span><span />
      </div>
      {articles.map((article) => (
        <button key={article.id} onClick={() => open(article)} className="grid min-h-11 w-full grid-cols-[220px_1fr_80px] items-center border-b border-[#eeeeeb] px-4 py-2 text-left text-[13px] last:border-0 hover:bg-[#f8f8f7]">
          <span className="font-medium text-[#167d57]">{article.category}</span>
          <span>
            <span className="block font-medium text-[#202124]">{article.title}</span>
            <span className="mt-1 line-clamp-1 text-[#6b7075]">{article.summary}</span>
          </span>
          <ChevronRight size={16} className="justify-self-end text-[#6b7075]" />
        </button>
      ))}
    </OperationTable>
  );
}

function TicketTable({ tickets, open }: { tickets: Ticket[]; open: (id: string) => void }) {
  if (!tickets.length) {
    return <div className="rounded-[6px] border border-[#d3d3d0] bg-white p-16 text-center text-[13px] text-[#9aa0a6]">Aucun ticket dans cette vue.</div>;
  }
  return (
    <OperationTable className="rounded-[6px] border border-[#d3d8dd]">
      <table className="w-full whitespace-nowrap text-left text-[12px]">
        <thead className="border-b border-[#d9d9d6] bg-[#f7f7f5] text-[#5f6368]">
          <tr>{["Référence", "Sujet", "Priorité", "Statut", "SLA", "Messages", "Mise à jour"].map((item) => <th className="px-4 py-2 font-medium" key={item}>{item}</th>)}</tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="h-11 cursor-pointer border-b border-[#eeeeeb] last:border-0 hover:bg-[#f8f8f7]" onClick={() => open(ticket.id)}>
              <td className="px-4 py-2 font-semibold">{ticket.ticket_reference}</td>
              <td className="px-4 py-2">{ticket.subject}</td>
              <td className="px-4 py-2">{ticket.priority}</td>
              <td className="px-4 py-2">{ticket.status}</td>
              <td className={`px-4 py-2 ${ticket.first_response_overdue || ticket.resolution_overdue ? "text-red-700" : "text-emerald-700"}`}>{ticket.first_response_overdue || ticket.resolution_overdue ? "Dépassé" : "Dans le délai"}</td>
              <td className="px-4 py-2">{ticket.message_count}</td>
              <td className="px-4 py-2">{new Date(ticket.updated_at).toLocaleDateString("fr-FR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </OperationTable>
  );
}

function Create({ close, done }: { close: () => void; done: (id: string) => void }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const ticket = await createTicket({
        subject: String(form.get("subject")),
        description: String(form.get("description")),
        category: String(form.get("category")),
        priority: String(form.get("priority")),
      });
      done(ticket.id);
    } catch {
      setError("Création impossible.");
    }
  }
  return (
    <OperationDrawer open title="Nouveau ticket" description="Décrivez la demande afin de la transmettre au support Slaivio." close={close} width="max-w-[620px]">
      <form onSubmit={submit} className="grid gap-3">
        <input required minLength={5} name="subject" className={input} placeholder="Objet de la demande" />
        <div className="grid grid-cols-2 gap-2">
          <select name="category" className={input}>{["TECHNIQUE", "FACTURATION", "COMPTE", "DONNÉES", "FONCTIONNALITÉ", "AUTRE"].map((item) => <option key={item}>{item}</option>)}</select>
          <select name="priority" className={input}><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select>
        </div>
        <textarea required minLength={10} name="description" rows={7} className="rounded-[4px] border border-[#d3d3d0] p-3 text-[13px]" placeholder="Décrivez le problème." />
        {error && <p className="text-[13px] text-red-700">{error}</p>}
        <button className={`${primary} justify-center`}>Créer le ticket</button>
      </form>
    </OperationDrawer>
  );
}

function Detail({ detail, close, reload }: { detail: TicketDetail; close: () => void; reload: () => void }) {
  const ticket = detail.ticket;
  const [error, setError] = useState("");
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await addTicketMessage(ticket.id, String(form.get("message")));
      event.currentTarget.reset();
      reload();
    } catch {
      setError("Message non envoyé.");
    }
  }
  async function upload(event: FormEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      await uploadTicketAttachment(ticket.id, file);
      reload();
    } catch {
      setError("Pièce jointe refusée.");
    } finally {
      event.currentTarget.value = "";
    }
  }
  return (
    <Panel close={close} title={ticket.subject} description={`${ticket.ticket_reference} · ${ticket.status}`}>
      <p className="mt-1 text-[12px] text-[#6b7075]">{ticket.priority} · réponse avant {ticket.first_response_due_at ? new Date(ticket.first_response_due_at).toLocaleString("fr-FR") : "—"}</p>
      {error && <p className="mt-3 rounded-[5px] bg-red-50 p-3 text-[13px] text-red-700">{error}</p>}
      <div className="mt-5 overflow-hidden rounded-[6px] border border-[#d3d3d0] bg-white">
        {detail.messages.map((message) => (
          <div key={message.id} className="border-b border-[#eeeeeb] p-4 last:border-0">
            <div className="flex justify-between text-[11px] text-[#6b7075]"><b>{message.author_name || message.author_type}</b><span>{new Date(message.created_at).toLocaleString("fr-FR")}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-[13px]">{message.message}</p>
          </div>
        ))}
      </div>
      {detail.attachments.map((attachment) => (
        <button key={attachment.id} onClick={async () => window.open(await ticketAttachmentUrl(ticket.id, attachment.id), "_blank", "noopener")} className="mt-2 flex items-center gap-2 text-[12px]">
          <Download size={13} />{attachment.file_name}
        </button>
      ))}
      {!["CLOSED", "RESOLVED"].includes(ticket.status) && (
        <PermissionGuard permission="support.create">
          <form onSubmit={send} className="mt-4 grid gap-2 rounded-[6px] border border-[#d3d3d0] bg-white p-4">
            <textarea required name="message" rows={4} className="rounded-[4px] border border-[#d3d3d0] p-3 text-[13px]" placeholder="Ajouter une réponse..." />
            <div className="flex justify-between">
              <label className={button}><Paperclip size={14} />Joindre<input hidden type="file" onChange={upload} /></label>
              <button className={primary}><MessageSquare size={14} />Envoyer</button>
            </div>
          </form>
        </PermissionGuard>
      )}
      <PermissionGuard permission="support.close">
        <button className={`${button} mt-4`} onClick={async () => { await transitionTicket(ticket.id, ticket.status === "CLOSED" ? "reopen" : "close", ticket.row_version); reload(); }}>{ticket.status === "CLOSED" ? "Rouvrir" : "Fermer le ticket"}</button>
      </PermissionGuard>
    </Panel>
  );
}

function Panel({ close, children, title = "Support Slaivio", description = "Article, ticket et historique de la demande." }: { close: () => void; children: React.ReactNode; title?: string; description?: string }) {
  return (
    <OperationDrawer open close={close} title={title} description={description} width="max-w-2xl">
      {children}
    </OperationDrawer>
  );
}
