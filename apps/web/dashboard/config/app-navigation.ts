import {
  BriefcaseBusiness,
  Folder,
  Package,
  Radar,
  Truck,
  Users,
  Warehouse,
  HandCoins,
  ReceiptText,
  Route,
  BarChart3,
  Sparkles,
  BookOpen,
  Megaphone,
  BellRing,
  BadgeDollarSign,
  type LucideIcon,
} from "lucide-react";

export type AppRoute = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  keywords: readonly string[];
};

export type AppNavigationGroup = {
  label: string;
  icon: LucideIcon;
  routes: readonly AppRoute[];
};

// Cette liste est la source de vérité de la navigation. Une route ne doit être
// publiée ici que lorsqu'une page fonctionnelle existe réellement.
export const appNavigation: readonly AppNavigationGroup[] = [
  {
    label: "Intelligence",
    icon: Sparkles,
    routes: [
      { label: "Assistant Slaivio", href: "/app/assistant", icon: Sparkles, keywords: ["assistant", "ia", "automatisation", "audio", "escalade"] },
      { label: "Base de connaissances", href: "/app/knowledge", icon: BookOpen, permission: "knowledge.read", keywords: ["connaissance", "faq", "procédure", "politique", "rag", "knowledge"] },
    ],
  },
  {
    label: "Opérations",
    icon: BriefcaseBusiness,
    routes: [
      { label: "Clients", href: "/app/clients", icon: Users, permission: "clients.read", keywords: ["client", "contact", "destinataire"] },
      { label: "Dossiers", href: "/app/dossiers", icon: Folder, permission: "dossiers.read", keywords: ["dossier", "case"] },
      { label: "Colis", href: "/app/packages", icon: Package, keywords: ["colis", "package", "tracking"] },
      { label: "Tracking", href: "/app/tracking", icon: Radar, permission: "tracking.read", keywords: ["tracking", "suivi", "control tower", "retard"] },
      { label: "Documents", href: "/app/documents", icon: Folder, permission: "documents.read", keywords: ["document", "conformité", "douane", "licence", "expiration"] },
      { label: "Calendrier des départs", href: "/app/departures", icon: Truck, permission: "departures.read", keywords: ["départ", "calendrier", "cutoff", "capacité"] },
      { label: "Expéditions", href: "/app/shipments", icon: Truck, permission: "shipments.read", keywords: ["expédition", "shipment", "transport"] },
      { label: "Entrepôts", href: "/app/warehouses", icon: Warehouse, permission: "warehouses.read", keywords: ["entrepôt", "warehouse", "stock", "inventaire", "emplacement"] },
      { label: "Retraits", href: "/app/pickups", icon: HandCoins, permission: "pickups.read", keywords: ["retrait", "guichet", "remise", "pickup", "otp"] },
    ],
  },
  {
    label: "Communication",
    icon: Megaphone,
    routes: [
      { label: "Broadcasts", href: "/app/broadcasts", icon: Megaphone, permission: "broadcasts.read", keywords: ["campagne", "broadcast", "audience", "whatsapp", "email"] },
      { label: "Relances", href: "/app/followups", icon: BellRing, permission: "followups.read", keywords: ["relance", "rappel", "paiement", "recovery", "followup"] },
    ],
  },
  {
    label: "Réseau",
    icon: Route,
    routes: [{ label: "Routes", href: "/app/routes", icon: Route, permission: "routes.read", keywords: ["route", "réseau", "corridor", "destination"] },{ label: "Services", href: "/app/services", icon: Route, permission: "routes.read", keywords: ["service", "air", "sea", "express", "groupage"] }],
  },
  {
    label: "Finance",
    icon: ReceiptText,
    routes: [
      { label: "Tarification", href: "/app/pricing", icon: BadgeDollarSign, permission: "pricing.read", keywords: ["tarif", "pricing", "grille", "prix", "marge", "simulateur"] },
      { label: "Facturation", href: "/app/finance", icon: ReceiptText, permission: "finance.read", keywords: ["facture", "devis", "avoir", "paiement", "finance"] },
    ],
  },
  {
    label: "Pilotage",
    icon: BarChart3,
    routes: [
      { label: "Rapports et Analytics", href: "/app/reports", icon: BarChart3, permission: "analytics.read", keywords: ["rapport", "analytics", "kpi", "performance", "export", "statistique"] },
    ],
  },
];

export const searchableAppRoutes = appNavigation.flatMap((group) => group.routes);

export function canAccessRoute(
  route: AppRoute,
  permissions: readonly string[],
  permissionsAvailable: boolean,
) {
  if (!route.permission) return true;
  // Une panne du service de permissions ne doit pas produire un faux refus.
  // Les API restent l'autorité finale et continuent d'appliquer le RBAC.
  return !permissionsAvailable || permissions.includes(route.permission);
}
