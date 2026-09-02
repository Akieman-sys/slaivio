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
};

export function dashboardLabel(locale: DashboardLocale, french: string, href?: string) {
  if (locale === "fr") return french;
  return (href && EN_BY_HREF[href]) || EN_LABELS[french] || french;
}
