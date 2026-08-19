import {
  BadgeDollarSign,
  BarChart3,
  BellRing,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  Folder,
  HandCoins,
  Megaphone,
  Package,
  Radar,
  ReceiptText,
  Route,
  Sparkles,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type AppRoute = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  keywords: readonly string[];
  pilot?: "core" | "preview";
};

export type AppNavigationGroup = {
  label: string;
  icon: LucideIcon;
  routes: readonly AppRoute[];
};

// Navigation orientée métier : chaque rubrique correspond à une tâche claire
// pour l'agence, et non à l'architecture technique de la plateforme.
export const appNavigation: readonly AppNavigationGroup[] = [
  {
    label: "Clients",
    icon: Users,
    routes: [
      { label: "Clients", href: "/app/clients", icon: Users, permission: "clients.read", keywords: ["client", "contact", "destinataire"], pilot: "core" },
      { label: "Dossiers", href: "/app/dossiers", icon: Folder, permission: "dossiers.read", keywords: ["dossier", "demande", "devis"], pilot: "core" },
    ],
  },
  {
    label: "Opérations",
    icon: BriefcaseBusiness,
    routes: [
      { label: "Colis", href: "/app/packages", icon: Package, keywords: ["colis", "package", "tracking"], pilot: "core" },
      { label: "Entrepôts", href: "/app/warehouses", icon: Warehouse, permission: "warehouses.read", keywords: ["entrepôt", "warehouse", "stock", "emplacement"], pilot: "core" },
      { label: "Batchs & groupages", href: "/app/batches", icon: Boxes, permission: "batches.read", keywords: ["batch", "groupage", "consolidation", "chargement"], pilot: "core" },
      { label: "Départs", href: "/app/departures", icon: Truck, permission: "departures.read", keywords: ["départ", "calendrier", "cutoff", "capacité"], pilot: "core" },
      { label: "Expéditions", href: "/app/shipments", icon: Truck, permission: "shipments.read", keywords: ["expédition", "shipment", "transport"], pilot: "core" },
      { label: "Tracking", href: "/app/tracking", icon: Radar, permission: "tracking.read", keywords: ["tracking", "suivi", "retard"], pilot: "core" },
      { label: "Retraits & livraisons", href: "/app/pickups", icon: HandCoins, permission: "pickups.read", keywords: ["retrait", "livraison", "remise", "pickup"], pilot: "core" },
      { label: "Documents", href: "/app/documents", icon: Folder, permission: "documents.read", keywords: ["document", "douane", "conformité", "expiration"], pilot: "core" },
    ],
  },
  {
    label: "Offre commerciale",
    icon: Route,
    routes: [
      { label: "Routes", href: "/app/routes", icon: Route, permission: "routes.read", keywords: ["route", "réseau", "corridor", "destination"], pilot: "core" },
      { label: "Services", href: "/app/services", icon: Boxes, permission: "services.read", keywords: ["service", "air", "mer", "express", "groupage"], pilot: "core" },
      { label: "Tarification", href: "/app/pricing", icon: BadgeDollarSign, permission: "pricing.read", keywords: ["tarif", "pricing", "grille", "prix", "marge", "simulateur"], pilot: "core" },
      { label: "Facturation", href: "/app/finance", icon: ReceiptText, permission: "finance.read", keywords: ["facture", "devis", "avoir", "paiement", "finance"], pilot: "core" },
    ],
  },
  {
    label: "Communication",
    icon: Megaphone,
    routes: [
      { label: "Relances", href: "/app/followups", icon: BellRing, permission: "followups.read", keywords: ["relance", "rappel", "paiement", "recovery"], pilot: "core" },
      { label: "Broadcasts", href: "/app/broadcasts", icon: Megaphone, permission: "broadcasts.read", keywords: ["campagne", "broadcast", "audience", "whatsapp", "email"], pilot: "preview" },
    ],
  },
  {
    label: "Pilotage",
    icon: BarChart3,
    routes: [
      { label: "Assistant Slaivio", href: "/app/assistant", icon: Sparkles, keywords: ["assistant", "ia", "automatisation", "escalade"], pilot: "core" },
      { label: "Base de connaissances", href: "/app/knowledge", icon: BookOpen, permission: "knowledge.read", keywords: ["connaissance", "faq", "procédure", "politique", "knowledge"], pilot: "core" },
      { label: "Rapports & analytics", href: "/app/reports", icon: BarChart3, permission: "analytics.read", keywords: ["rapport", "analytics", "kpi", "performance", "export"], pilot: "core" },
    ],
  },
];

export const searchableAppRoutes = appNavigation.flatMap((group) => group.routes);

export function canAccessRoute(
  route: AppRoute,
  permissions: readonly string[],
  permissionsAvailable: boolean,
) {
  if (route.pilot === "preview" && process.env.NEXT_PUBLIC_PILOT_MODE === "1") return false;
  if (!route.permission) return true;
  // En cas de panne du service de permissions, les API conservent l'autorité RBAC.
  return !permissionsAvailable || permissions.includes(route.permission);
}
