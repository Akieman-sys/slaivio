import axios from "axios";

type TokenOptions = { skipCache?: boolean };
type AccessTokenProvider = (options?: TokenOptions) => Promise<string | null>;
type RetriableRequest = {
  _slaivioAuthRetried?: boolean;
  _slaivioNetworkRetries?: number;
};
let accessTokenProvider: AccessTokenProvider | null = null;
export const SESSION_EXPIRED_EVENT = "slaivio:session-expired";
export const API_MUTATION_FAILED_EVENT = "slaivio:api-mutation-failed";
export const API_MUTATION_SUCCEEDED_EVENT = "slaivio:api-mutation-succeeded";

const apiDetailMessages: Record<string, string> = {
  knowledge_antivirus_unavailable: "Le service de sécurité des fichiers est temporairement indisponible. Réessayez dans quelques instants.",
  knowledge_antivirus_not_configured: "L’analyse de sécurité des fichiers n’est pas encore configurée sur cet environnement.",
  knowledge_antivirus_invalid_response: "Le service de sécurité n’a pas pu confirmer le résultat de l’analyse.",
  knowledge_ocr_not_configured: "La lecture des images et PDF n’est pas encore configurée sur cet environnement.",
  knowledge_file_malware_detected: "Ce fichier a été bloqué par l’analyse de sécurité.",
  invalid_knowledge_file: "Le fichier est vide, trop volumineux ou dans un format non accepté.",
};

export function apiErrorDetail(error: unknown): string {
  if (!axios.isAxiosError(error)) return "";
  const detail = error.response?.data?.detail;
  const raw = Array.isArray(detail)
    ? detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(" · ")
    : typeof detail === "string" ? detail : "";
  return apiDetailMessages[raw] || raw;
}

function normalizeApiBaseUrl(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withProtocol.replace(/\/+$/, "");
}

export const API_BASE_URL = normalizeApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL,
);

export function setAccessTokenProvider(provider: AccessTokenProvider | null) {
  accessTokenProvider = provider;
}

function mutationSuccessMessage(method: string, rawUrl?: string, data?: unknown): string | null {
  const url = String(rawUrl || "").split("?")[0];
  const payload = data as { whatsapp_group?: { status?: string } } | undefined;

  if (method === "POST" && url === "/clients") return "Client créé avec succès.";
  if (method === "PATCH" && /^\/clients\/[^/]+$/.test(url)) return "Client modifié avec succès.";
  if (method === "DELETE" && /^\/clients\/[^/]+$/.test(url)) return "Client archivé avec succès.";
  if (method === "POST" && /^\/clients\/[^/]+\/restore$/.test(url)) return "Client restauré avec succès.";
  if (method === "POST" && url === "/clients/import") return "Import des clients terminé.";

  if (method === "POST" && url === "/dossiers") return "Dossier créé avec succès.";
  if (method === "PATCH" && /^\/dossiers\/[^/]+$/.test(url)) return "Dossier modifié avec succès.";
  if (method === "DELETE" && /^\/dossiers\/[^/]+$/.test(url)) return "Dossier archivé avec succès.";
  if (method === "POST" && /^\/dossiers\/[^/]+\/restore$/.test(url)) return "Dossier restauré avec succès.";
  if (method === "POST" && /^\/dossiers\/[^/]+\/clients\/new$/.test(url)) return "Client créé et ajouté au dossier avec succès.";
  if (method === "POST" && /^\/dossiers\/[^/]+\/clients$/.test(url)) return "Client rattaché au dossier avec succès.";
  if (method === "DELETE" && /^\/dossiers\/[^/]+\/clients\/[^/]+$/.test(url)) return "Client retiré du dossier.";
  if (method === "POST" && /^\/dossiers\/[^/]+\/whatsapp-group\/sync$/.test(url)) {
    return payload?.whatsapp_group?.status === "waiting_for_participant" ? null : "Groupe WhatsApp synchronisé avec succès.";
  }

  if (method === "POST" && url === "/followups") return "Relance créée avec succès.";
  if (method === "PATCH" && /^\/followups\/[^/]+$/.test(url)) return "Relance modifiée avec succès.";
  if (method === "POST" && /^\/followups\/[^/]+\/execute$/.test(url)) return "Relance envoyée avec succès.";
  if (method === "POST" && url === "/knowledge/pilot") return "Connaissance créée avec succès.";
  if (method === "PATCH" && /^\/knowledge\/pilot\/[^/]+$/.test(url)) return "Connaissance modifiée avec succès.";
  if (method === "POST" && /^\/knowledge\/pilot\/[^/]+\/publish$/.test(url)) return "Connaissance publiée avec succès.";
  if (["PATCH", "PUT"].includes(method) && url.startsWith("/organization/admin")) return "Paramètres de l’agence enregistrés.";

  // Les lectures marquées, recherches, brouillons IA, tests et changements
  // d'état déjà visibles à l'écran ne doivent pas déclencher de toast global.
  return null;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

api.interceptors.request.use(async (config) => {
  // Let Axios/browser generate the multipart boundary for FormData. Forcing the
  // global JSON content type makes FastAPI treat uploads as missing (`422`).
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }
  if (typeof window !== "undefined") {
    const retried = (config as typeof config & RetriableRequest)._slaivioAuthRetried;
    let token = accessTokenProvider ? await accessTokenProvider({ skipCache: Boolean(retried) }) : null;
    const clerk = (window as Window & { Clerk?: { session?: { getToken?: () => Promise<string | null> } } }).Clerk;

    if (!token && clerk?.session?.getToken) {
      token = await clerk.session.getToken();
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    if (typeof window !== "undefined") {
      const method = String(response.config.method || "get").toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const message = mutationSuccessMessage(method, response.config.url, response.data);
        if (message) window.dispatchEvent(new CustomEvent(API_MUTATION_SUCCEEDED_EVENT, { detail: { message } }));
      }
    }
    return response;
  },
  async (error: unknown) => {
    if (axios.isAxiosError(error) && !error.response && error.config) {
      const config = error.config as typeof error.config & RetriableRequest;
      const method = String(config.method || "get").toUpperCase();
      const retries = config._slaivioNetworkRetries || 0;
      if (["GET", "HEAD", "OPTIONS"].includes(method) && retries < 2) {
        config._slaivioNetworkRetries = retries + 1;
        await new Promise((resolve) =>
          setTimeout(resolve, retries === 0 ? 500 : 1200),
        );
        return api.request(config);
      }
    }
    if (
      typeof window !== "undefined" &&
      axios.isAxiosError(error) &&
      error.response?.status === 401
    ) {
      const config = error.config as (typeof error.config & RetriableRequest) | undefined;
      const hadAuthorization = Boolean(config?.headers?.Authorization);
      if (config && hadAuthorization && !config._slaivioAuthRetried && accessTokenProvider) {
        config._slaivioAuthRetried = true;
        const refreshedToken = await accessTokenProvider({ skipCache: true });
        if (refreshedToken) {
          config.headers.Authorization = `Bearer ${refreshedToken}`;
          return api.request(config);
        }
      }
      if (hadAuthorization) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    if (typeof window !== "undefined" && axios.isAxiosError(error)) {
      const method = String(error.config?.method || "get").toUpperCase();
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const detail = error.response?.data?.detail;
        const raw = Array.isArray(detail)
          ? detail.map((item: { msg?: string }) => item.msg).filter(Boolean).join(" · ")
          : typeof detail === "string" ? detail : "";
        const detailMessage = apiDetailMessages[raw] || raw;
        const conflictMessage = raw === "workflow_execution_in_progress"
          ? "La création est déjà en cours. Patientez quelques instants avant de réessayer."
          : raw === "workflow_already_decided"
            ? "Cette action a déjà été traitée. Rechargez la page pour voir son état actuel."
            : `Cette opération entre en conflit avec l’état actuel.${detailMessage ? ` ${detailMessage}` : ""}`;
        const message = !error.response
          ? "Le serveur est injoignable. Vérifiez le déploiement du backend."
          : error.response.status === 403
            ? "Vous n’avez pas la permission d’effectuer cette action."
            : error.response.status === 409
              ? conflictMessage
              : error.response.status === 422
                ? `Certaines données sont invalides ou incompatibles.${detailMessage ? ` ${detailMessage}` : ""}`
                : detailMessage || `L’opération a échoué (erreur ${error.response.status}).`;
        window.dispatchEvent(new CustomEvent(API_MUTATION_FAILED_EVENT, { detail: { message, status: error.response?.status } }));
      }
    }
    return Promise.reject(error);
  },
);
