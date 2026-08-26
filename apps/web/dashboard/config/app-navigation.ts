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
  MessageCircle,
  Package,
  Radar,
  ReceiptText,
  Route,
  Settings,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { getProductProfile, PRODUCT_PROFILES, type ProductProfile } from "@/config/product-profile";

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
  collapsible?: boolean;
};

export const pilotV1Navigation: readonly AppNavigationGroup[] = [
  {
    label: "Dossiers",
    icon: Folder,
    collapsible: false,
    routes: [
      { label: "Dossiers", href: "/app/dossiers", icon: Folder, permission: "dossiers.read", keywords: ["dossier", "client", "attention", "archive"] },
    ],
  },
  {
    label: "Communication",
    icon: MessageCircle,
    collapsible: true,
    routes: [
      { label: "Boîte de réception", href: "/app/inbox", icon: MessageCircle, permission: "inbox.read", keywords: ["whatsapp", "message", "conversation", "réponse"] },
      { label: "Relances", href: "/app/followups", icon: BellRing, permission: "followups.read", keywords: ["relance", "rappel", "client", "dossier"] },
    ],
  },
  {
    label: "Base de connaissances",
    icon: BookOpen,
    collapsible: false,
    routes: [
      { label: "Base de connaissances", href: "/app/knowledge", icon: BookOpen, permission: "pilot.knowledge.read", keywords: ["connaissance", "question", "réponse", "information"] },
    ],
  },
  {
    label: "Paramètres",
    icon: Settings,
    collapsible: false,
    routes: [
      { label: "Paramètres", href: "/app/settings", icon: Settings, permission: "pilot.settings.read", keywords: ["entreprise", "responsable", "whatsapp", "accès", "identifiant"] },
    ],
  },
];

// The former operational surface stays available behind CARGO_OS. Nothing is deleted.
export const cargoOsNavigation: readonly AppNavigationGroup[] = [
  {
    label: "Clients",
    icon: Users,
    routes: [
      { label: "Clients", href: "/app/clients", icon: Users, permission: "clients.read", keywords: ["client", "contact", "destinataire"] },
      { label: "Dossiers", href: "/app/dossiers", icon: Folder, permission: "dossiers.read", keywords: ["dossier", "demande", "devis"] },
    ],
  },
  {
    label: "Opérations",
    icon: BriefcaseBusiness,
    routes: [
      { label: "Colis", href: "/app/packages", icon: Package, keywords: ["colis", "package", "tracking"] },
      { label: "Entrepôts", href: "/app/warehouses", icon: Warehouse, permission: "warehouses.read", keywords: ["entrepôt", "warehouse", "stock", "emplacement"] },
      { label: "Batchs & groupages", href: "/app/batches", icon: Boxes, permission: "batches.read", keywords: ["batch", "groupage", "consolidation", "chargement"] },
      { label: "Départs", href: "/app/departures", icon: Truck, permission: "departures.read", keywords: ["départ", "calendrier", "cutoff", "capacité"] },
      { label: "Expéditions", href: "/app/shipments", icon: Truck, permission: "shipments.read", keywords: ["expédition", "shipment", "transport"] },
      { label: "Tracking", href: "/app/tracking", icon: Radar, permission: "tracking.read", keywords: ["tracking", "suivi", "retard"] },
      { label: "Retraits & livraisons", href: "/app/pickups", icon: HandCoins, permission: "pickups.read", keywords: ["retrait", "livraison", "remise", "pickup"] },
      { label: "Documents", href: "/app/documents", icon: Folder, permission: "documents.read", keywords: ["document", "douane", "conformité", "expiration"] },
    ],
  },
  {
    label: "Offre commerciale",
    icon: Route,
    routes: [
      { label: "Routes", href: "/app/routes", icon: Route, permission: "routes.read", keywords: ["route", "réseau", "corridor", "destination"] },
      { label: "Services", href: "/app/services", icon: Boxes, permission: "services.read", keywords: ["service", "air", "mer", "express", "groupage"] },
      { label: "Tarification", href: "/app/pricing", icon: BadgeDollarSign, permission: "pricing.read", keywords: ["tarif", "pricing", "grille", "prix", "marge", "simulateur"] },
      { label: "Facturation", href: "/app/finance", icon: ReceiptText, permission: "finance.read", keywords: ["facture", "devis", "avoir", "paiement", "finance"] },
    ],
  },
  {
    label: "Communication",
    icon: Megaphone,
    routes: [
      { label: "Relances", href: "/app/followups", icon: BellRing, permission: "followups.read", keywords: ["relance", "rappel", "paiement", "recovery"] },
      { label: "Broadcasts", href: "/app/broadcasts", icon: Megaphone, permission: "broadcasts.read", keywords: ["campagne", "broadcast", "audience", "whatsapp", "email"] },
    ],
  },
  {
    label: "Pilotage",
    icon: BarChart3,
    routes: [
      { label: "Base de connaissances", href: "/app/knowledge", icon: BookOpen, permission: "knowledge.read", keywords: ["connaissance", "faq", "procédure", "politique", "knowledge"] },
      { label: "Rapports & analytics", href: "/app/reports", icon: BarChart3, permission: "analytics.read", keywords: ["rapport", "analytics", "kpi", "performance", "export"] },
    ],
  },
];

export function getAppNavigation(profile: ProductProfile = getProductProfile()) {
  return profile === PRODUCT_PROFILES.PILOT_V1 ? pilotV1Navigation : cargoOsNavigation;
}

export const appNavigation = getAppNavigation();
export const searchableAppRoutes = appNavigation.flatMap((group) => group.routes);

export function canAccessRoute(
  route: AppRoute,
  permissions: readonly string[],
  permissionsAvailable: boolean,
) {
  if (!route.permission) return true;
  // The APIs remain authoritative if the permission service is temporarily unavailable.
  return !permissionsAvailable || permissions.includes(route.permission);
}
