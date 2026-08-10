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
  Settings,
  Bell,
  BarChart3,
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
    label: "Réseau",
    icon: Route,
    routes: [{ label: "Routes et services", href: "/app/routes", icon: Route, permission: "routes.read", keywords: ["route", "service", "tarif", "pricing", "corridor"] }],
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
    label: "Finance",
    icon: ReceiptText,
    routes: [
      { label: "Facturation", href: "/app/finance", icon: ReceiptText, permission: "finance.read", keywords: ["facture", "devis", "avoir", "paiement", "finance"] },
    ],
  },
  {
    label: "Administration",
    icon: Settings,
    routes: [
      { label: "Notifications", href: "/app/notifications", icon: Bell, permission: "notifications.read", keywords: ["notification", "alerte", "centre", "envoi", "échec"] },
      { label: "Organisation et équipe", href: "/app/settings", icon: Settings, permission: "organization.read", keywords: ["équipe", "organisation", "membre", "rôle", "permission", "paramètres", "sécurité", "audit"] },
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
