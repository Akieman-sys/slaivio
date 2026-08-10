"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronRight, Download, LifeBuoy, MessageSquare, Paperclip, Plus, Search, X } from "lucide-react";

import { PermissionGuard } from "@/components/permissions/permission-guard";
import { OperationDrawer } from "@/components/ui/operation-drawer";
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

const button = "inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-[#d3d3d0] bg-white px-3 text-[13px] text-[#2f3437] hover:bg-[#f5f5f3]";
const primary = "inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[#1a73e8] px-3 text-[13px] font-medium text-white hover:bg-[#1768d1]";
const input = "h-8 w-full rounded-[4px] border border-[#d3d3d0] bg-white px-3 text-[13px] outline-none focus:border-[#1a73e8]";

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
    <div className="min-h-full bg-[#f8f8f7]">
      <header className="border-b border-[#d9d9d6] bg-white">
        <div className="flex min-h-[58px] items-center gap-4 px-6">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-[#202124]">Support et Centre d’aide</h1>
          <div className="ml-auto flex items-center gap-2">
            <button className={button} onClick={load}>Actualiser</button>
            <PermissionGuard permission="support.create">
              <button className={primary} onClick={() => setCreating(true)}>
                <Plus size={15} />
                Nouveau ticket
              </button>
            </PermissionGuard>
          </div>
        </div>
        <div className="flex h-[48px] items-end gap-4 border-t border-[#eeeeeb] px-6">
          <Tab active={tab === "help"} onClick={() => setTab("help")} icon={<BookOpen size={16} />} label="Centre d’aide" />
          <Tab active={tab === "tickets"} onClick={() => setTab("tickets")} icon={<LifeBuoy size={16} />} label={`Tickets (${tickets.length})`} />
          <label className="ml-auto mb-2 flex h-8 w-[360px] max-w-[45vw] items-center gap-2 rounded-[4px] border border-[#d3d3d0] bg-white px-2 focus-within:border-[#1a73e8]">
            <Search size={15} className="text-[#6b7075]" />
            <input value={q} onChange={(event) => setQ(event.target.value)} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" placeholder="Rechercher un article ou un ticket" />
          </label>
          {tab === "tickets" && (
            <select className={`${input} mb-2 max-w-[210px]`} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tous les statuts</option>
              {["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED", "REOPENED"].map((item) => <option key={item}>{item}</option>)}
            </select>
          )}
        </div>
      </header>

      <main className="px-6 py-5">
        {error && <p className="mb-3 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        {tab === "help" ? <ArticleGrid articles={articles} open={setArticle} /> : <TicketTable tickets={tickets} open={open} />}
      </main>

      {creating && <Create close={() => setCreating(false)} done={async (id) => { setCreating(false); setTab("tickets"); await load(); await open(id); }} />}
      {selected && <Detail detail={selected} close={() => setSelected(null)} reload={() => open(selected.ticket.id)} />}
      {article && (
        <Panel close={() => setArticle(null)}>
          <small className="font-semibold text-[#1a73e8]">{article.category}</small>
          <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.02em]">{article.title}</h2>
          <p className="mt-6 whitespace-pre-wrap text-[14px] leading-7 text-[#2f3437]">{article.content}</p>
        </Panel>
      )}
    </div>
  );
}

function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex h-[48px] items-center gap-2 border-b-2 px-1 text-[14px] ${active ? "border-[#1a73e8] font-medium text-[#202124]" : "border-transparent text-[#5f6368] hover:text-[#202124]"}`}>
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
    <div className="overflow-hidden rounded-[6px] border border-[#d3d3d0] bg-white shadow-sm">
      <div className="grid grid-cols-[220px_1fr_80px] border-b border-[#d9d9d6] bg-[#f7f7f5] px-4 py-2 text-[12px] font-medium text-[#5f6368]">
        <span>Catégorie</span><span>Article</span><span />
      </div>
      {articles.map((article) => (
        <button key={article.id} onClick={() => open(article)} className="grid w-full grid-cols-[220px_1fr_80px] items-center border-b border-[#eeeeeb] px-4 py-3 text-left text-[13px] last:border-0 hover:bg-[#f8f8f7]">
          <span className="font-medium text-[#1a73e8]">{article.category}</span>
          <span>
            <span className="block font-medium text-[#202124]">{article.title}</span>
            <span className="mt-1 line-clamp-1 text-[#6b7075]">{article.summary}</span>
          </span>
          <ChevronRight size={16} className="justify-self-end text-[#6b7075]" />
        </button>
      ))}
    </div>
  );
}

function TicketTable({ tickets, open }: { tickets: Ticket[]; open: (id: string) => void }) {
  if (!tickets.length) {
    return <div className="rounded-[6px] border border-[#d3d3d0] bg-white p-16 text-center text-[13px] text-[#9aa0a6]">Aucun ticket dans cette vue.</div>;
  }
  return (
    <div className="overflow-auto rounded-[6px] border border-[#d3d3d0] bg-white shadow-sm">
      <table className="w-full whitespace-nowrap text-left text-[12px]">
        <thead className="border-b border-[#d9d9d6] bg-[#f7f7f5] text-[#5f6368]">
          <tr>{["Référence", "Sujet", "Priorité", "Statut", "SLA", "Messages", "Mise à jour"].map((item) => <th className="px-4 py-2 font-medium" key={item}>{item}</th>)}</tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="cursor-pointer border-b border-[#eeeeeb] last:border-0 hover:bg-[#f8f8f7]" onClick={() => open(ticket.id)}>
              <td className="px-4 py-3 font-semibold">{ticket.ticket_reference}</td>
              <td className="px-4 py-3">{ticket.subject}</td>
              <td className="px-4 py-3">{ticket.priority}</td>
              <td className="px-4 py-3">{ticket.status}</td>
              <td className={`px-4 py-3 ${ticket.first_response_overdue || ticket.resolution_overdue ? "text-red-700" : "text-emerald-700"}`}>{ticket.first_response_overdue || ticket.resolution_overdue ? "Dépassé" : "Dans le délai"}</td>
              <td className="px-4 py-3">{ticket.message_count}</td>
              <td className="px-4 py-3">{new Date(ticket.updated_at).toLocaleDateString("fr-FR")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <Dialog title="New ticket" close={close}>
      <form onSubmit={submit} className="grid gap-3">
        <input required minLength={5} name="subject" className={input} placeholder="Objet de la demande" />
        <div className="grid grid-cols-2 gap-2">
          <select name="category" className={input}>{["TECHNIQUE", "FACTURATION", "COMPTE", "DONNÉES", "FONCTIONNALITÉ", "AUTRE"].map((item) => <option key={item}>{item}</option>)}</select>
          <select name="priority" className={input}><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select>
        </div>
        <textarea required minLength={10} name="description" rows={7} className="rounded-[4px] border border-[#d3d3d0] p-3 text-[13px]" placeholder="Décrivez le problème." />
        {error && <p className="text-[13px] text-red-700">{error}</p>}
        <button className={primary}>Create ticket</button>
      </form>
    </Dialog>
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
    <Panel close={close}>
      <small className="text-[#6b7075]">{ticket.ticket_reference} · {ticket.status}</small>
      <h2 className="mt-1 text-[22px] font-semibold">{ticket.subject}</h2>
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

function Panel({ close, children }: { close: () => void; children: React.ReactNode }) {
  return (
    <OperationDrawer open close={close} title="Support Slaivio" description="Article, ticket et historique de la demande." width="max-w-2xl">
      {children}
    </OperationDrawer>
  );
}

function Dialog({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
      <section className="w-full max-w-xl rounded-[6px] border border-[#d3d3d0] bg-white p-5 shadow-2xl">
        <div className="mb-4 flex justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={close} className="rounded-[4px] p-1 hover:bg-[#f0f0ef]"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}
