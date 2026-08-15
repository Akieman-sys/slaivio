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
  (response) => response,
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
        const message = !error.response
          ? "Le serveur est injoignable. Vérifiez le déploiement du backend."
          : error.response.status === 403
            ? "Vous n’avez pas la permission d’effectuer cette action."
            : error.response.status === 409
              ? `Cette opération entre en conflit avec l’état actuel.${raw ? ` ${raw}` : ""}`
              : error.response.status === 422
                ? `Certaines données sont invalides ou incompatibles.${raw ? ` ${raw}` : ""}`
                : raw || `L’opération a échoué (erreur ${error.response.status}).`;
        window.dispatchEvent(new CustomEvent(API_MUTATION_FAILED_EVENT, { detail: { message, status: error.response?.status } }));
      }
    }
    return Promise.reject(error);
  },
);
