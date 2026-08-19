"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  CreditCard,
  Database,
  FileText,
  KeyRound,
  Languages,
  MapPin,
  Plug,
  RefreshCcw,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  archiveWorkspace,
  createApiKey,
  getAdmin,
  inviteMember,
  listAgencyWhatsappNumbers,
  requestDataOperation,
  revokeApiKey,
  revokeInvitation,
  saveIntegration,
  saveLocation,
  saveNumbering,
  saveRole,
  saveWorkspace,
  updateMember,
  updateOrganization,
  updateSettings,
  type AdminData,
  type Member,
  type AgencyWhatsappNumber,
} from "@/services/organization-admin";
import { PermissionGuard } from "@/components/permissions/permission-guard";
const input =
  "h-9 w-full rounded-[5px] border border-[#d8d9dc] bg-white px-3 text-[13px] outline-none focus:border-[#16855f]";
const button =
  "h-9 rounded-[5px] border border-[#d8d9dc] bg-white px-3 text-[13px] font-medium";
const primary =
  "h-9 rounded-[5px] bg-[#16855f] px-4 text-[13px] font-semibold text-white hover:bg-[#126f50]";
const tabs = [
  ["general", "Général", Languages],
  ["agency", "Agence", Building2],
  ["workspaces", "Workspaces", Building2],
  ["locations", "Bureaux & établissements", MapPin],
  ["team", "Utilisateurs & équipe", Users],
  ["roles", "Rôles & permissions", KeyRound],
  ["notifications", "Notifications", Bell],
  ["integrations", "Canaux & intégrations", Plug],
  ["documents", "Documents & numérotation", FileText],
  ["billing", "Abonnement Slaivio", CreditCard],
  ["security", "Sécurité", ShieldCheck],
  ["data", "Données & confidentialité", Database],
] as const;
type Section = (typeof tabs)[number][0];
const sectionTitles = Object.fromEntries(
  tabs.map(([id, label]) => [
    id,
    [label, `${label} de l’agence et du workspace actif.`],
  ]),
) as Record<Section, [string, string]>;
function val(f: FormData, k: string) {
  return String(f.get(k) || "").trim() || null;
}
export function OrganizationAdminPage() {
  const router = useRouter(),
    params = useSearchParams();
  const [data, setData] = useState<AdminData | null>(null),
    [tab, setTab] = useState<Section>("general"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const requested = params.get("section");
    const aliases: Record<string, Section> = {
      profile: "general",
      preferences: "general",
      organization: "agency",
      spaces: "workspaces",
    };
    const resolved = requested ? aliases[requested] || requested : "general";
    if (tabs.some(([id]) => id === resolved)) setTab(resolved as Section);
  }, [params]);
  const load = useCallback(async () => {
    try {
      setError("");
      setData(await getAdmin());
    } catch {
      setError("Le centre d’administration est indisponible.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function run(action: () => Promise<unknown>, message: string) {
    try {
      setError("");
      await action();
      setNotice(message);
      await load();
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      setError(
        detail === "organization_requires_an_active_owner"
          ? "Une organisation doit toujours conserver au moins un propriétaire actif."
          : detail || "L’opération n’a pas abouti.",
      );
    }
  }
  function select(section: Section) {
    setTab(section);
    router.replace(`/app/settings?section=${section}`, { scroll: false });
  }
  if (!data)
    return (
      <div className="p-6 text-[13px]">
        {error || "Chargement de l’administration…"}
      </div>
    );
  return (
    <div className="min-h-full bg-white">
      <header className="flex h-[72px] items-center border-b border-[#e0e2e4] px-5 lg:px-7">
        <div>
          <p className="text-[11px] text-[#7b8289]">Administration</p>
          <h1 className="text-[21px] font-semibold">Paramètres</h1>
        </div>
        <button className={`${button} ml-auto`} onClick={load}>
          <RefreshCcw className="mr-2 inline" size={14} />
          Actualiser
        </button>
      </header>
      <div className="grid min-h-[calc(100vh-132px)] lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="border-b border-[#e0e2e4] bg-[#fafafa] p-3 lg:border-b-0 lg:border-r">
          <SettingsGroup label="Administration">
            {tabs.map(([id, label, Icon]) => (
              <SettingsItem
                key={id}
                active={tab === id}
                icon={<Icon size={15} />}
                label={label}
                onClick={() => select(id)}
              />
            ))}
          </SettingsGroup>
          <SettingsGroup label="Plateforme">
            <SettingsLink
              href="/app/platform"
              icon={<ShieldCheck size={15} />}
              label="Console Super Admin"
            />
          </SettingsGroup>
        </aside>
        <main className="min-w-0 p-5 lg:p-7">
          <div className="mx-auto max-w-[1120px]">
            <div className="mb-5 flex items-start gap-3 border-b border-[#e5e6e7] pb-4">
              <div className="min-w-0 flex-1"><h2 className="text-[20px] font-semibold">
                {sectionTitles[tab][0]}
              </h2>
              <p className="mt-1 text-[13px] text-[#69707d]">
                {sectionTitles[tab][1]}
              </p></div>
              <button className={button} onClick={load} title="Actualiser"><RefreshCcw size={14} /></button>
            </div>
            {notice && (
              <div className="mb-3 rounded-[5px] bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
                {notice}
              </div>
            )}
            {error && (
              <div className="mb-3 rounded-[5px] bg-red-50 px-4 py-3 text-[13px] text-red-700">
                {error}
              </div>
            )}
            {tab === "general" && <Preferences data={data} run={run} />}{" "}
            {tab === "agency" && <Organization data={data} run={run} />}{" "}
            {tab === "workspaces" && <Workspaces data={data} run={run} />}{" "}
            {tab === "locations" && <Locations data={data} run={run} />}{" "}
            {tab === "team" && <Team data={data} run={run} />}{" "}
            {tab === "roles" && <Roles data={data} run={run} />}{" "}
            {tab === "notifications" && (
              <NotificationsSettings />
            )}{" "}
            {tab === "integrations" && <Integrations data={data} run={run} />}{" "}
            {tab === "documents" && <DocumentsSettings data={data} run={run} />}{" "}
            {tab === "billing" && <BillingSettings data={data} />}{" "}
            {tab === "security" && <Security data={data} run={run} />}{" "}
            {tab === "data" && <DataSettings data={data} run={run} />}{" "}
          </div>
        </main>
    </SettingsDialog>
  );
}

function SettingsNavigation({ active, select }: { active: Section; select: (section: Section) => void }) {
  return <>
    <SettingsGroup label="Compte et organisation">
      {tabs.map(([id, label, Icon]) => <SettingsItem key={id} active={active === id} icon={<Icon size={15} />} label={label} onClick={() => select(id)} />)}
    </SettingsGroup>
    <SettingsGroup label="Plateforme">
      <PermissionGuard permission="platform.admin.read"><SettingsLink href="/app/platform" icon={<ShieldCheck size={15} />} label="Console Super Admin" /></PermissionGuard>
    </SettingsGroup>
  </>;
}
function SettingsGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase text-[#8a9097]">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}
const settingsItemClass =
  "flex min-h-9 w-full items-center gap-2.5 rounded-[5px] px-2.5 text-left text-[13px]";
function SettingsItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${settingsItemClass} ${active ? "bg-[#e4f4ee] font-medium text-[#145f49]" : "text-[#444b52] hover:bg-[#eeeeed]"}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
function SettingsLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`${settingsItemClass} text-[#444b52] hover:bg-[#eeeeed]`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}
function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-[#e8eaed]">
      <div className="border-b border-[#edf0f3] px-5 py-4">
        <h2 className="text-[15px] font-semibold text-[#293034]">{title}</h2>
        <p className="text-[12px] text-[#697178]">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

const notificationCategories = [
  ["OPERATIONS", "Activité de l’agence", "Dossiers, tâches et opérations importantes"],
  ["SHIPMENT", "Expéditions", "Départs, arrivées, retards et incidents"],
  ["PACKAGE", "Colis", "Réception, blocage, anomalie et disponibilité"],
  ["PAYMENT", "Paiements", "Paiement reçu, échéance et facture impayée"],
  ["COMPLIANCE", "Contrôles", "Documents, restrictions et validations requises"],
  ["SYSTEM", "Compte et sécurité", "Invitations, accès et alertes de sécurité"],
] as const;

function NotificationsSettings() {
  const [items, setItems] = useState<NotificationPreference[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    getNotificationPreferences()
      .then(setItems)
      .catch(() => setMessage("Les préférences ne peuvent pas être chargées."));
  }, []);
  const current = (category: string): NotificationPreference =>
    items.find((item) => item.category === category) || {
      category,
      in_app: true,
      email: false,
      whatsapp: false,
      digest_frequency: "IMMEDIATE",
    };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("");
    try {
      const saved = await Promise.all(
        notificationCategories.map(([category]) =>
          saveNotificationPreference({
            category,
            in_app: form.get(`${category}.app`) === "on",
            email: form.get(`${category}.email`) === "on",
            whatsapp: form.get(`${category}.whatsapp`) === "on",
            digest_frequency: String(form.get(`${category}.frequency`) || "IMMEDIATE"),
          }),
        ),
      );
      setItems(saved.map((result) => result.preference || result));
      setMessage("Préférences enregistrées.");
    } catch {
      setMessage("L’enregistrement n’a pas abouti.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Card
      title="Notifications de l’agence"
      description="Choisissez où et à quel rythme votre équipe reçoit chaque type d’alerte."
    >
      <form onSubmit={submit}>
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[minmax(240px,1fr)_74px_74px_92px_150px] border-b border-[#e6e9ee] bg-[#f7f8fa] px-3 py-2 text-[12px] font-medium text-[#5f6b76]">
              <span>Événement</span><span>Dans Slaivio</span><span>Email</span><span>WhatsApp</span><span>Fréquence</span>
            </div>
            {notificationCategories.map(([category, label, description]) => {
              const preference = current(category);
              return (
                <div key={category} className="grid grid-cols-[minmax(240px,1fr)_74px_74px_92px_150px] items-center border-b border-[#edf0f3] px-3 py-3 last:border-0">
                  <div><b className="text-[13px]">{label}</b><p className="text-[11px] text-[#74808c]">{description}</p></div>
                  <input aria-label={`${label} dans Slaivio`} name={`${category}.app`} type="checkbox" defaultChecked={preference.in_app} className="h-4 w-4 accent-[#12c76f]" />
                  <input aria-label={`${label} par email`} name={`${category}.email`} type="checkbox" defaultChecked={preference.email} className="h-4 w-4 accent-[#12c76f]" />
                  <input aria-label={`${label} par WhatsApp`} name={`${category}.whatsapp`} type="checkbox" defaultChecked={preference.whatsapp} className="h-4 w-4 accent-[#12c76f]" />
                  <select name={`${category}.frequency`} defaultValue={preference.digest_frequency} className={input}>
                    <option value="IMMEDIATE">Immédiatement</option><option value="DAILY">Résumé quotidien</option><option value="WEEKLY">Résumé hebdomadaire</option><option value="OFF">Désactivé</option>
                  </select>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between"><p className="text-[12px] text-[#537064]">{message}</p><button disabled={saving} className={primary}>{saving ? "Enregistrement…" : "Enregistrer"}</button></div>
      </form>
    </Card>
  );
}
function Organization({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  const o = data.organization;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () =>
        updateOrganization({
          expected_version: o.row_version,
          organization_name: val(f, "name"),
          legal_name: val(f, "legal"),
          country: val(f, "country"),
          city: val(f, "city"),
          address: val(f, "address"),
          phone: val(f, "phone"),
          email: val(f, "email"),
          website: val(f, "website"),
          registration_number: val(f, "registration"),
          tax_number: val(f, "tax"),
        }),
      "Profil de l’agence mis à jour.",
    );
  }
  return (
    <Card
      title="Profil de l’agence"
      description="Informations officielles réutilisées dans les factures, documents et communications."
    >
      <PermissionGuard permission="organization.manage" fallback={<ReadOnly />}>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          {[
            ["name", "Nom commercial", "organization_name"],
            ["legal", "Raison sociale", "legal_name"],
            ["registration", "Numéro d’enregistrement", "registration_number"],
            ["tax", "Identifiant fiscal", "tax_number"],
            ["country", "Pays", "country"],
            ["city", "Ville", "city"],
            ["phone", "Téléphone", "phone"],
            ["email", "Email", "email"],
            ["website", "Site web", "website"],
            ["address", "Adresse", "address"],
          ].map(([n, l, k]) => (
            <label key={n} className="text-[12px] text-[#555d68]">
              {l}
              <input
                className={`${input} mt-1`}
                name={n}
                defaultValue={String(o[k] || "")}
              />
            </label>
          ))}
          <div className="md:col-span-2">
            <button className={primary}>Enregistrer le profil</button>
          </div>
        </form>
      </PermissionGuard>
    </Card>
  );
}
function Team({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () => inviteMember(String(f.get("email")), String(f.get("role"))),
      "Invitation envoyée.",
    );
  }
  return (
    <div className="grid gap-4">
      <Card
        title="Inviter un collaborateur"
        description="L’invitation est envoyée par Clerk et expire automatiquement."
      >
        <PermissionGuard permission="team.write">
          <form onSubmit={invite} className="flex flex-wrap gap-2">
            <input
              required
              type="email"
              name="email"
              className={`${input} max-w-sm`}
              placeholder="collaborateur@agence.com"
            />
            <select name="role" className={`${input} max-w-[220px]`}>
              {data.roles.map((r) => (
                <option key={r.id} value={r.role_code}>
                  {r.role_name}
                </option>
              ))}
            </select>
            <button className={primary}>
              <UserPlus className="mr-2 inline" size={14} />
              Inviter
            </button>
          </form>
        </PermissionGuard>
      </Card>
      <Card
        title={`Membres (${data.members.length})`}
        description="Suspendre un accès prend effet côté API sans supprimer l’historique."
      >
        <div className="divide-y">
          {data.members.map((m) => (
            <MemberRow key={m.id} member={m} roles={data.roles} run={run} />
          ))}
        </div>
      </Card>
      {data.invitations.length > 0 && (
        <Card
          title="Invitations"
          description="Invitations en attente, acceptées ou révoquées."
        >
          <div className="divide-y">
            {data.invitations.map((x) => (
              <div
                className="flex items-center justify-between py-3 text-[13px]"
                key={String(x.id)}
              >
                <div>
                  <b>{String(x.email)}</b>
                  <p className="text-[12px] text-[#69707d]">
                    {String(x.role_code)} · {String(x.status)}
                  </p>
                </div>
                {x.status === "PENDING" && (
                  <PermissionGuard permission="team.manage">
                    <button
                      className={button}
                      onClick={() =>
                        run(
                          () => revokeInvitation(String(x.id)),
                          "Invitation révoquée.",
                        )
                      }
                    >
                      Révoquer
                    </button>
                  </PermissionGuard>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
function MemberRow({
  member,
  roles,
  run,
}: {
  member: Member;
  roles: AdminData["roles"];
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  const [role, setRole] = useState(member.role_code),
    [status, setStatus] = useState(member.status);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]">
      <div>
        <b>{member.member_display_name || member.member_email || "Membre"}</b>
        <p className="text-[12px] text-[#69707d]">
          {member.member_email || member.id}
        </p>
      </div>
      <PermissionGuard
        permission="team.manage"
        fallback={
          <span>
            {member.role_name} · {member.status}
          </span>
        }
      >
        <div className="flex gap-2">
          <select
            className={input}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.role_code}>
                {r.role_name}
              </option>
            ))}
          </select>
          <select
            className={input}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ACTIVE">Actif</option>
            <option value="SUSPENDED">Suspendu</option>
          </select>
          <button
            className={button}
            onClick={() =>
              run(
                () =>
                  updateMember(member.id, {
                    role_code: role,
                    status,
                    expected_version: member.row_version,
                  }),
                "Accès du membre mis à jour.",
              )
            }
          >
            Appliquer
          </button>
        </div>
      </PermissionGuard>
    </div>
  );
}
const permissionGroups: Record<string, string> = {
  clients: "Clients",
  dossiers: "Dossiers",
  packages: "Colis",
  shipments: "Expéditions",
  batches: "Batchs et groupages",
  departures: "Calendrier des départs",
  routes: "Routes",
  services: "Services",
  pricing: "Tarification",
  finance: "Finance",
  followups: "Relances",
  broadcasts: "Campagnes",
  knowledge: "Base de connaissances",
  warehouses: "Entrepôts",
  team: "Équipe",
  settings: "Paramètres",
  organization: "Agence",
};
function permissionGroupLabel(group: string) {
  return permissionGroups[group] || "Autres fonctions";
}
function permissionActionLabel(code: string) {
  const action = code.split(".").slice(1).join(".");
  const labels: Record<string, string> = {
    read: "Consulter",
    create: "Créer",
    update: "Modifier",
    manage: "Gérer",
    archive: "Archiver",
    export: "Exporter",
    analytics: "Voir les analyses",
    publish: "Publier",
    approve: "Valider",
    review: "Vérifier",
    scan: "Scanner",
    assign: "Affecter",
  };
  return labels[action] || "Action avancée";
}
function Roles({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  const groups = useMemo(
    () =>
      data.permissions.reduce<Record<string, AdminData["permissions"]>>(
        (all, p) => {
          const key = p.permission_code.split(".")[0] || "other";
          (all[key] ??= []).push(p);
          return all;
        },
        {},
      ),
    [data.permissions],
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const roleName = String(f.get("name") || "").trim();
    const generatedCode = roleName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40);
    run(
      () =>
        saveRole({
          code: generatedCode,
          name: roleName,
          description: f.get("description"),
          permissions: f.getAll("permissions"),
        }),
      "Rôle enregistré.",
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
      <Card
        title="Rôles existants"
        description="Les rôles système forment le socle; les rôles personnalisés répondent à votre organisation."
      >
        {data.roles.map((r) => (
          <div className="border-b py-3 text-[13px]" key={r.id}>
            <b>{r.role_name}</b>
            <p className="text-[12px] text-[#69707d]">
              {r.permission_count} droits · {r.member_count} membres{" "}
              {r.system_role ? "· Système" : ""}
            </p>
          </div>
        ))}
      </Card>
      <Card
        title="Nouveau rôle personnalisé"
        description="Accordez uniquement les capacités nécessaires."
      >
        <PermissionGuard permission="roles.manage" fallback={<ReadOnly />}>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-2">
              <label>Nom du rôle
              <input
                required
                name="name"
                className={`${input} mt-1`}
                placeholder="Ex. Responsable entrepôt Chine"
              />
              </label>
            </div>
            <label>À quoi sert ce rôle ?
              <input name="description" className={`${input} mt-1`} placeholder="Décrivez simplement les responsabilités de cette équipe" />
            </label>
            <div className="max-h-[400px] overflow-y-auto rounded-[5px] border p-3">
              {Object.entries(groups).map(([group, permissions]) => (
                <div key={group} className="mb-4">
                  <b className="text-[12px] font-semibold text-[#334155]">
                    {permissionGroupLabel(group)}
                  </b>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {permissions.map((p) => (
                      <label className="flex gap-2 text-[12px]" key={p.id}>
                        <input
                          type="checkbox"
                          name="permissions"
                          value={p.permission_code}
                        />
                        <span>
                          <b>{p.description || permissionActionLabel(p.permission_code)}</b>
                          <small className="block text-[#69707d]">{permissionActionLabel(p.permission_code)}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className={primary}>Créer le rôle</button>
          </form>
        </PermissionGuard>
      </Card>
    </div>
  );
}
function Preferences({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  const s = data.settings || { row_version: 1 };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () =>
        updateSettings({
          expected_version: s.row_version,
          timezone: val(f, "timezone"),
          currency_code: val(f, "currency"),
          country_code: val(f, "country"),
          language_code: val(f, "language"),
          date_format: val(f, "date"),
          weight_unit: val(f, "weight"),
          volume_unit: val(f, "volume"),
          time_format: val(f, "time"),
          dimension_unit: val(f, "dimensions"),
          distance_unit: val(f, "distance"),
          notification_email: val(f, "email"),
          settings: s.settings || {},
          security: s.security || {},
        }),
      "Préférences enregistrées.",
    );
  }
  return (
    <Card
      title="Préférences de l’espace"
      description="Formats appliqués à tous les collaborateurs de l’agence."
    >
      <PermissionGuard permission="settings.write" fallback={<ReadOnly />}>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <SettingSelect label="Langue de l’interface" name="language" value={String(s.language_code || "fr")} options={[["fr","Français"],["en","English"]]} />
          <SettingSelect label="Fuseau horaire" name="timezone" value={String(s.timezone || "UTC")} options={[["Africa/Kinshasa","Kinshasa"],["Africa/Douala","Douala"],["Africa/Abidjan","Abidjan"],["Asia/Shanghai","Chine"],["Asia/Dubai","Dubaï"],["UTC","Temps universel (UTC)"]]} />
          <SettingSelect label="Devise comptable principale" name="currency" value={String(s.currency_code || "USD")} options={["USD","CDF","EUR","CNY","AED","XAF","GHS","KES"].map(x=>[x,x])} />
          <label>Pays principal<input name="country" className={`${input} mt-1`} defaultValue={String(s.country_code || data.organization.country || "")} placeholder="Pays de l’espace actif" /></label>
          <SettingSelect label="Format de date" name="date" value={String(s.date_format || "DD/MM/YYYY")} options={[["DD/MM/YYYY","31/12/2026"],["MM/DD/YYYY","12/31/2026"],["YYYY-MM-DD","2026-12-31"]]} />
          <SettingSelect label="Format de l’heure" name="time" value={String(s.time_format || "24H")} options={[["24H","24 heures"],["12H","12 heures (AM/PM)"]]} />
          <SettingSelect label="Poids" name="weight" value={String(s.weight_unit || "kg")} options={[["kg","Kilogrammes (kg)"],["lb","Livres (lb)"]]} />
          <SettingSelect label="Volume" name="volume" value={String(s.volume_unit || "cbm")} options={[["cbm","Mètre cube (m³)"],["ft3","Pied cube (ft³)"]]} />
          <SettingSelect label="Dimensions" name="dimensions" value={String(s.dimension_unit || "cm")} options={[["cm","Centimètres"],["in","Pouces"]]} />
          <SettingSelect label="Distance" name="distance" value={String(s.distance_unit || "km")} options={[["km","Kilomètres"],["mi","Miles"]]} />
          <label>Email pour les alertes importantes<input name="email" type="email" className={`${input} mt-1`} defaultValue={String(s.notification_email || "")} placeholder="operations@agence.com" /></label>
          <div className="flex items-end"><button className={primary}>Enregistrer les préférences</button></div>
        </form>
      </PermissionGuard>
    </Card>
  );
}
function SettingSelect({label,name,value,options}:{label:string;name:string;value:string;options:string[][]}) {
  return <label>{label}<select name={name} defaultValue={value} className={`${input} mt-1`}>{options.map(([option,labelText])=><option key={option} value={option}>{labelText}</option>)}</select></label>;
}
function Security({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  const s = data.settings || { row_version: 1 },
    sec = (s.security || {}) as Record<string, unknown>;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () =>
        updateSettings({
          ...s,
          expected_version: s.row_version,
          security: {
            require_mfa: f.get("mfa") === "on",
            session_timeout_minutes: Number(f.get("timeout")),
            inactivity_timeout_minutes: Number(f.get("inactivity")),
            max_failed_attempts: Number(f.get("attempts")),
          },
        }),
      "Politique de sécurité mise à jour.",
    );
  }
  return (
    <Card
      title="Protection des comptes"
      description="Définissez les règles de connexion appliquées aux membres de votre agence."
    >
      <PermissionGuard permission="security.manage" fallback={<ReadOnly />}>
        <form onSubmit={submit} className="grid max-w-2xl gap-5">
          <label className="flex items-start gap-3 rounded-md bg-[#f8faf9] p-4 ring-1 ring-[#e6eae8]">
            <input
              name="mfa"
              type="checkbox"
              defaultChecked={Boolean(sec.require_mfa)}
            />
            <span><b className="block text-[13px]">Exiger la double authentification</b><small className="text-[11px] font-normal text-[#74808c]">Chaque membre devra confirmer sa connexion avec un second facteur.</small></span>
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>Durée maximale d’une session<input name="timeout" type="number" min="15" max="10080" className={`${input} mt-1`} defaultValue={Number(sec.session_timeout_minutes || 480)} /><small className="text-[11px] font-normal text-[#74808c]">En minutes</small></label>
            <label>Déconnexion après inactivité<input name="inactivity" type="number" min="5" max="1440" className={`${input} mt-1`} defaultValue={Number(sec.inactivity_timeout_minutes || 30)} /><small className="text-[11px] font-normal text-[#74808c]">En minutes</small></label>
            <label>Tentatives avant verrouillage<input name="attempts" type="number" min="3" max="20" className={`${input} mt-1`} defaultValue={Number(sec.max_failed_attempts || 5)} /><small className="text-[11px] font-normal text-[#74808c]">Échecs de connexion</small></label>
          </div>
          <div className="rounded-md bg-[#f7f8fa] p-4 text-[12px] text-[#53606d]"><b className="block text-[#25292e]">Sessions et appareils</b>Chaque membre peut consulter ses appareils connectés et fermer ses autres sessions depuis son menu de compte.</div>
          <button className={primary}>Enregistrer la politique</button>
        </form>
      </PermissionGuard>
    </Card>
  );
}
export function Audit({ data }: { data: AdminData }) {
  return (
    <Card
      title="Journal d’audit"
      description="Dernières mutations administratives de l’organisation."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b text-[#69707d]">
              <th className="py-2">Date</th>
              <th>Action</th>
              <th>Objet</th>
              <th>Acteur</th>
            </tr>
          </thead>
          <tbody>
            {data.audit.map((x) => (
              <tr className="border-b" key={String(x.id)}>
                <td className="py-3">
                  {new Date(String(x.created_at)).toLocaleString("fr-FR")}
                </td>
                <td>{String(x.action)}</td>
                <td>
                  {String(x.entity_type)} · {String(x.entity_id)}
                </td>
                <td>{String(x.actor_name || x.actor_id || "Système")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.audit.length && (
          <p className="py-8 text-center text-[#69707d]">
            Aucune mutation administrative enregistrée.
          </p>
        )}
      </div>
    </Card>
  );
}
function Workspaces({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () =>
        saveWorkspace({
          name: val(f, "name"),
          code: val(f, "code"),
          country_code: val(f, "country"),
          currency_code: val(f, "currency") || "USD",
          timezone: val(f, "timezone") || "UTC",
          language_code: val(f, "language") || "fr",
        }),
      "Workspace enregistré.",
    );
  }
  return (
    <div className="grid gap-4">
      <Card
        title="Nouveau workspace"
        description="Un périmètre opérationnel isolé par pays ou activité."
      >
        <form onSubmit={submit} className="grid gap-2 md:grid-cols-3">
          <input
            required
            name="name"
            className={input}
            placeholder="Workspace RDC"
          />
          <input required name="code" className={input} placeholder="RDC" />
          <input name="country" className={input} placeholder="CD" />
          <input name="currency" className={input} placeholder="USD" />
          <input
            name="timezone"
            className={input}
            placeholder="Africa/Kinshasa"
          />
          <select name="language" className={input}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
          <button className={primary}>Enregistrer</button>
        </form>
      </Card>
      <Card
        title="Workspaces"
        description="Les archives restent auditables et ne suppriment aucune donnée."
      >
        {data.workspaces.map((x) => (
          <div
            key={String(x.id)}
            className="flex items-center justify-between border-b py-3 text-[13px]"
          >
            <div>
              <b>{String(x.name)}</b>
              <p className="text-[#69707d]">
                {String(x.code)} · {String(x.country_code || "—")} ·{" "}
                {String(x.currency_code)} · {String(x.status)}
              </p>
            </div>
            {x.status === "ACTIVE" && (
              <button
                className={button}
                onClick={() =>
                  run(
                    () => archiveWorkspace(String(x.id), Number(x.row_version)),
                    "Workspace archivé.",
                  )
                }
              >
                Archiver
              </button>
            )}
          </div>
        ))}
        {!data.workspaces.length && (
          <p className="text-[13px] text-[#69707d]">
            Aucun workspace configuré.
          </p>
        )}
      </Card>
    </div>
  );
}
function Locations({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  const [whatsappNumbers, setWhatsappNumbers] = useState<AgencyWhatsappNumber[]>([]);
  useEffect(() => {
    listAgencyWhatsappNumbers().then(setWhatsappNumbers).catch(() => setWhatsappNumbers([]));
  }, []);
  const countries = Array.from(new Set([
    String(data.organization.country || ""),
    ...data.workspaces.map((item) => String(item.country_code || "")),
    ...data.locations.map((item) => String(item.country || "")),
  ].filter(Boolean)));
  const cities = Array.from(new Set([
    String(data.organization.city || ""),
    ...data.locations.map((item) => String(item.city || "")),
  ].filter(Boolean)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(
      () =>
        saveLocation({
          workspace_id: val(f, "workspace"),
          name: val(f, "name"),
          code: val(f, "code"),
          location_type: val(f, "type"),
          country: val(f, "country"),
          city: val(f, "city"),
          address: val(f, "address"),
          phone: val(f, "phone"),
          whatsapp: val(f, "whatsapp"),
          email: val(f, "email"),
          manager_name: val(f, "manager"),
          timezone: val(f, "timezone") || "UTC",
          opening_hours: { text: val(f, "hours") },
          services: String(f.get("services") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      "Établissement enregistré.",
    );
  }
  return (
    <div className="grid gap-4">
      <Card
        title="Ajouter un établissement"
        description="Bureau, entrepôt, hub ou point de retrait."
      >
        <form onSubmit={submit} className="grid gap-2 md:grid-cols-3">
          <input
            required
            name="name"
            className={input}
            placeholder="Bureau Kinshasa"
          />
          <input required name="code" className={input} placeholder="KIN-01" />
          <select required name="type" className={input}>
            <option value="OFFICE">Bureau</option>
            <option value="WAREHOUSE">Entrepôt</option>
            <option value="HUB">Hub</option>
            <option value="PICKUP_POINT">Point de retrait</option>
          </select>
          <select name="workspace" className={input}>
            <option value="">Organisation entière</option>
            {data.workspaces.map((x) => (
              <option key={String(x.id)} value={String(x.id)}>
                {String(x.name)}
              </option>
            ))}
          </select>
          <label>Pays<select required name="country" className={`${input} mt-1`}><option value="">Choisir un pays configuré</option>{countries.map((value)=><option key={value}>{value}</option>)}</select></label>
          <label>Ville<select required name="city" className={`${input} mt-1`}><option value="">Choisir une ville configurée</option>{cities.map((value)=><option key={value}>{value}</option>)}</select></label>
          <label>Adresse complète<input name="address" className={`${input} mt-1`} placeholder="Rue, numéro et repère utile" /></label>
          <label>Téléphone de l’établissement<input name="phone" className={`${input} mt-1`} placeholder="Numéro d’appel" /></label>
          <label>Numéro WhatsApp Business<select name="whatsapp" className={`${input} mt-1`}><option value="">Aucun numéro affecté</option>{whatsappNumbers.map((number)=><option key={number.id} value={number.display_phone_number || number.id}>{number.display_phone_number || "Numéro Meta"}{number.verified_name ? ` · ${number.verified_name}` : ""}</option>)}</select><small className="mt-1 block text-[11px] text-[#74808c]">Seuls les numéros connectés au portefeuille Business apparaissent ici.</small></label>
          <label>Email professionnel<input name="email" type="email" className={`${input} mt-1`} placeholder="bureau@agence.com" /></label>
          <label>Responsable<input name="manager" className={`${input} mt-1`} placeholder="Nom du responsable" /></label>
          <label>Fuseau horaire<input name="timezone" className={`${input} mt-1`} placeholder="Africa/Kinshasa" /></label>
          <label>Horaires d’ouverture<input name="hours" className={`${input} mt-1`} placeholder="Lun–Sam, 08:00–17:00" /></label>
          <label>Services disponibles<input name="services" className={`${input} mt-1`} placeholder="Séparez les services par une virgule" /></label>
          <button className={primary}>Enregistrer</button>
        </form>
      </Card>
      <Card
        title="Établissements"
        description="Structure physique de l’agence."
      >
        {data.locations.map((x) => (
          <div key={String(x.id)} className="border-b py-3 text-[13px]">
            <b>{String(x.name)}</b>
            <p className="text-[#69707d]">
              {String(x.location_type)} · {String(x.city)}, {String(x.country)}{" "}
              · {String(x.status)}
            </p>
          </div>
        ))}
      </Card>
    </div>
  );
}
function Integrations({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  async function connect(provider: "WHATSAPP" | "GMAIL") {
    run(
      () =>
        saveIntegration({
          provider,
          account_label: provider === "WHATSAPP" ? "WhatsApp Business de l’agence" : "Gmail de l’agence",
          status: "CONNECTING",
          granted_permissions: [],
          configuration: {},
        }),
      "Connexion initialisée. Finalisez le consentement OAuth du fournisseur.",
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {(["WHATSAPP", "GMAIL", "TIKTOK"] as const).map((provider) => {
        const current = data.integrations.find((x) => x.provider === provider);
        const available = provider === "WHATSAPP";
        return (
          <Card
            key={provider}
            title={provider === "WHATSAPP" ? "WhatsApp Business" : provider === "GMAIL" ? "Gmail" : "TikTok Business"}
            description={provider === "WHATSAPP" ? "Messages clients, Inbox, campagnes et réponses de l’agence." : "Ce canal pourra être ajouté à votre espace de communication."}
          >
            <p className="mb-4 text-[13px]">État : <b>{integrationStatusLabel(String(current?.status || "DISCONNECTED"), available)}</b>
              {current?.last_sync_at
                ? ` · Sync ${new Date(String(current.last_sync_at)).toLocaleString("fr-FR")}`
                : ""}
            </p>
            {available ? <button className={primary} onClick={() => connect("WHATSAPP")}>{current ? "Reconnecter WhatsApp" : "Connecter WhatsApp"}</button> : <span className="inline-flex h-9 items-center rounded-md bg-[#f1f3f4] px-3 text-[12px] font-medium text-[#707780]">Disponible prochainement</span>}
          </Card>
        );
      })}
    </div>
  );
}
function integrationStatusLabel(status: string, available: boolean) {
  if (!available) return "Bientôt disponible";
  return ({ CONNECTED: "Connecté", CONNECTING: "Connexion à finaliser", ERROR: "Attention requise", DISCONNECTED: "Non connecté" } as Record<string,string>)[status] || status;
}
function DocumentsSettings({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  return (
    <Card
      title="Documents & numérotation"
      description="Formats versionnés, jamais codés en dur."
    >
      <div className="grid gap-3 md:grid-cols-2">
        {data.numbering.map((x) => (
          <form
            key={String(x.id)}
            className="rounded-md bg-[#f8faf9] p-4 ring-1 ring-[#e6eae8]"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(
                () =>
                  saveNumbering(
                    String(x.document_type),
                    String(f.get("format")),
                    Number(x.row_version),
                  ),
                "Format enregistré.",
              );
            }}
          >
            <div className="mb-3"><b className="text-[13px]">{documentTypeLabel(String(x.document_type))}</b><p className="mt-0.5 text-[11px] text-[#74808c]">Exemple généré automatiquement : {numberingExample(String(x.prefix_format))}</p></div>
            <label>Format du numéro
              <input name="format" className={`${input} mt-1 font-mono`} defaultValue={String(x.prefix_format)} />
            </label>
            <button className={`${button} mt-3`}>Enregistrer ce format</button>
          </form>
        ))}
      </div>
    </Card>
  );
}
function documentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    INVOICE: "Factures clients",
    QUOTE: "Devis",
    RECEIPT: "Reçus de paiement",
    DOSSIER: "Dossiers",
    PACKAGE: "Colis",
    SHIPMENT: "Expéditions",
    PAYMENT: "Paiements",
    MANIFEST: "Manifestes",
    DELIVERY_NOTE: "Bons de livraison",
    SHIPPING_LABEL: "Étiquettes colis",
  };
  return labels[type] || type.toLowerCase().replaceAll("_", " ");
}
function numberingExample(format: string) {
  return format.replaceAll("{YYYY}", "2026").replace(/\{0+\}/g, "000184");
}
function BillingSettings({ data }: { data: AdminData }) {
  const b = data.billing || {};
  const usage = (b.usage || {}) as Record<string, number>,
    limits = (b.limits || {}) as Record<string, number>;
  return (
    <div className="grid gap-4">
      <Card
        title="Plan actuel"
        description="Abonnement Slaivio, distinct des factures clients."
      >
        <h3 className="text-xl font-semibold">
          {String(b.plan_code || "TRIAL")}
        </h3>
        <p className="text-[13px]">
          {String(b.status || "TRIAL")} · {String(b.monthly_amount || 0)}{" "}
          {String(b.billing_currency || "USD")} / mois
        </p>
        <p className="mt-2 text-[12px] text-[#69707d]">
          Prochaine facturation :{" "}
          {b.next_billing_at
            ? new Date(String(b.next_billing_at)).toLocaleDateString("fr-FR")
            : "Non planifiée"}
        </p>
      </Card>
      <Card
        title="Usage"
        description="Mesures utilisées par le futur moteur d’abonnement."
      >
        {Object.keys({ ...limits, ...usage }).map((k) => (
          <div className="mb-3" key={k}>
            <div className="flex justify-between text-[12px]">
              <span>{k}</span>
              <b>
                {usage[k] || 0} / {limits[k] || "∞"}
              </b>
            </div>
            <div className="mt-1 h-1.5 bg-[#e6e8e8]">
              <div
                className="h-full bg-[#16855f]"
                style={{
                  width: `${Math.min(100, ((usage[k] || 0) / (limits[k] || Infinity)) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
function DataSettings({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  async function exportData() {
    run(
      () =>
        requestDataOperation({
          request_type: "EXPORT",
          scope: {
            modules: [
              "clients",
              "dossiers",
              "packages",
              "shipments",
              "finance",
            ],
            format: "JSON",
          },
        }),
      "Export demandé.",
    );
  }
  async function deleteOrg() {
    const name = String(
      data.organization.organization_name || data.organization.name || "",
    );
    const confirmation = prompt(
      `Tapez exactement « ${name} » pour confirmer la demande`,
    );
    if (confirmation !== name) return;
    run(
      () =>
        requestDataOperation({
          request_type: "DELETE_ORGANIZATION",
          scope: {},
          confirmation,
        }),
      "Demande sensible enregistrée pour validation.",
    );
  }
  return (
    <div className="grid gap-4">
      <Card
        title="Export et conservation"
        description="Les exports sont préparés en arrière-plan et restent auditables."
      >
        <button className={primary} onClick={exportData}>
          Demander un export complet
        </button>
        <p className="mt-3 text-[12px] text-[#69707d]">
          Demandes récentes : {data.data_requests.length}
        </p>
      </Card>
      <section className="border border-red-200 bg-red-50 p-5">
        <h3 className="font-semibold text-red-800">Zone sensible</h3>
        <p className="my-3 text-[12px] text-red-700">
          La suppression n’est jamais immédiate : confirmation forte, audit et
          validation sont requis.
        </p>
        <button
          className="h-9 bg-red-700 px-4 text-[13px] font-semibold text-white"
          onClick={deleteOrg}
        >
          Demander la suppression
        </button>
      </section>
    </div>
  );
}
export function DeveloperSettings({
  data,
  run,
}: {
  data: AdminData;
  run: (a: () => Promise<unknown>, m: string) => void;
}) {
  const [secret, setSecret] = useState("");
  async function create() {
    const name = prompt("Nom de la clé API");
    if (!name) return;
    try {
      const result = await createApiKey({ name, scopes: ["api.read"] });
      setSecret(String(result.api_key.secret));
      await run(
        async () => undefined,
        "Clé créée. Copiez-la maintenant : elle ne sera plus affichée.",
      );
    } catch {
      setSecret("Erreur de création.");
    }
  }
  return (
    <Card
      title="Clés API"
      description="Secrets hachés en base, scopes minimaux et révocation immédiate."
    >
      <button className={primary} onClick={create}>
        Créer une clé
      </button>
      {secret && (
        <code className="my-3 block break-all bg-[#f2f3f3] p-3 text-[12px]">
          {secret}
        </code>
      )}
      <div className="divide-y">
        {data.api_keys.map((x) => (
          <div
            key={String(x.id)}
            className="flex items-center justify-between py-3 text-[12px]"
          >
            <span>
              <b>{String(x.name)}</b> · {String(x.key_prefix)}… ·{" "}
              {String(x.status)}
            </span>
            {x.status === "ACTIVE" && (
              <button
                className={button}
                onClick={() =>
                  run(() => revokeApiKey(String(x.id)), "Clé révoquée.")
                }
              >
                Révoquer
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
function SettingsLinkCard({
  href,
  title,
  text,
}: {
  href: string;
  title: string;
  text: string;
}) {
  return (
    <Card title={title} description={text}>
      <Link className={primary} href={href}>
        Ouvrir le module
      </Link>
    </Card>
  );
}
function ReadOnly() {
  return (
    <p className="rounded-[5px] bg-[#f2f2f1] p-3 text-[12px] text-[#69707d]">
      Consultation seule : votre rôle ne permet pas cette modification.
    </p>
  );
}
