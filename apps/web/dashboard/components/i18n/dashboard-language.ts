"use client";

import { useEffect, useState } from "react";

export type DashboardLocale = "fr" | "en";

const EVENT = "slaivio:language-changed";

export function readDashboardLocale(): DashboardLocale {
  if (typeof window === "undefined") return "fr";
  return window.localStorage.getItem("slaivio-locale") === "en" ? "en" : "fr";
}

export function setDashboardLocale(locale: DashboardLocale) {
  window.localStorage.setItem("slaivio-locale", locale);
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: locale }));
}

export function useDashboardLocale() {
  const [locale, setLocale] = useState<DashboardLocale>("fr");

  useEffect(() => {
    const sync = () => setLocale(readDashboardLocale());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return locale;
}

const EN_BY_HREF: Record<string, string> = {
  "/app": "Home",
  "/app/clients": "Clients",
  "/app/dossiers": "Cases",
  "/app/inbox": "Inbox",
  "/app/followups": "Follow-ups",
  "/app/knowledge": "Knowledge",
  "/app/settings": "Settings",
  "/app/packages": "Packages",
  "/app/warehouses": "Warehouses",
  "/app/batches": "Batches & consolidation",
  "/app/departures": "Departures",
  "/app/shipments": "Shipments",
  "/app/tracking": "Tracking",
  "/app/pickups": "Pickups & deliveries",
  "/app/documents": "Documents",
  "/app/routes": "Routes",
  "/app/services": "Services",
  "/app/pricing": "Pricing",
  "/app/finance": "Billing",
  "/app/broadcasts": "Broadcasts",
  "/app/reports": "Reports & analytics",
  "/app/assistant": "Slaivio Assistant",
  "/app/notifications": "Notifications",
  "/app/support": "Help center",
};

const EN_LABELS: Record<string, string> = {
  "Accueil": "Home",
  "Clients": "Clients",
  "Opérations": "Operations",
  "Offre commerciale": "Commercial offer",
  "Communication": "Communication",
  "Pilotage": "Management",
  "Dossiers": "Cases",
  "Connaissances": "Knowledge",
  "Paramètres": "Settings",
  "Alertes": "Alerts",
  "Compte": "Account",
  "Langue": "Language",
  "Notifications": "Notifications",
  "Assistant": "Assistant",
  "Aide": "Help",
  "Entreprise": "Company",
  "Responsable": "Owner",
  "Identifiants": "Identifiers",
  "Canaux": "Channels",
  "IA": "AI",
  "Confidentialité & données": "Privacy & data",
  "Préférences": "Preferences",
  "Actualiser": "Refresh",
  "Support": "Support",
  "Se déconnecter": "Sign out",
  "Langue du tableau de bord": "Dashboard language",
  "Non lues": "Unread",
  "Lues": "Read",
  "Rechercher": "Search",
  "Boîte de réception": "Inbox",
  "Relances": "Follow-ups",
  "Nouvelle relance": "New follow-up",
  "Ajouter une information": "Add information",
  "Préparez un message, vérifiez les destinataires puis confirmez l’envoi sur WhatsApp.": "Prepare a message, review recipients, then confirm delivery on WhatsApp.",
  "Conservez les réponses officielles de votre entreprise et contrôlez exactement ce que l’IA peut communiquer aux clients.": "Keep your company’s official answers and control exactly what AI may communicate to clients.",
  "Conversations WhatsApp, clients et dossiers réunis dans un espace de travail simple.": "WhatsApp conversations, clients and cases in one simple workspace.",
  "Identité et coordonnées": "Identity and contact details",
  "Responsable principal": "Primary owner",
  "Identifiant client": "Client identifier",
  "Identifiant dossier": "Case identifier",
  "Canaux de communication": "Communication channels",
  "Intelligence artificielle": "Artificial intelligence",
  "Mode de réponse": "Response mode",
  "Instructions et style": "Instructions and style",
  "Tester l’IA": "Test AI",
  "Contrôle des données": "Data controls",
  "Valeurs proposées par défaut": "Suggested defaults",
  "Nom de l’entreprise": "Company name",
  "Raison sociale": "Legal name",
  "Téléphone": "Phone",
  "Email": "Email",
  "Site web": "Website",
  "Pays": "Country",
  "Ville": "City",
  "Adresse": "Address",
  "Votre format": "Your format",
  "Prompt système": "System prompt",
  "Prompt utilisateur": "User prompt",
  "Style de communication": "Communication style",
  "Langue habituelle": "Default language",
  "Prochaine vérification proposée": "Suggested next review",
  "Configurez uniquement ce qui est nécessaire au fonctionnement quotidien de votre entreprise.": "Configure only what your company needs for daily operations.",
  "Ces coordonnées identifient votre entreprise dans SLAIVIO et dans les communications autorisées.": "These details identify your company in SLAIVIO and authorized communications.",
  "Le Pilot est exploité par une personne responsable. Les rôles avancés restent masqués tant qu’ils ne sont pas nécessaires.": "The Pilot is managed by one owner. Advanced roles stay hidden until they are needed.",
  "Créez librement le format utilisé par votre entreprise. Il sera appliqué réellement à chaque nouveau client et à chaque nouveau dossier, quelle que soit leur origine.": "Define the format used by your company. It will be applied to every new client and case, regardless of origin.",
  "Connectez les canaux utilisés par l’entreprise pour recevoir et envoyer ses messages.": "Connect the channels your company uses to receive and send messages.",
  "Définissez le comportement rédactionnel, puis vérifiez-le dans un espace de test avant utilisation.": "Define the writing behavior, then verify it in a test space before use.",
  "Gérez les données personnelles, leur conservation et les demandes d’export ou de suppression.": "Manage personal data, retention, export and deletion requests.",
  "Choisissez les événements importants et les canaux utilisés pour prévenir l’équipe.": "Choose important events and the channels used to notify the team.",
  "Définissez les valeurs proposées lors de la création d’une information. La publication reste toujours une action volontaire.": "Set the suggested values used when creating knowledge. Publishing always remains an explicit action.",
};

export function dashboardLabel(locale: DashboardLocale, french: string, href?: string) {
  if (locale === "fr") return french;
  return (href && EN_BY_HREF[href]) || EN_LABELS[french] || french;
}
