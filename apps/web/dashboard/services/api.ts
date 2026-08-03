import axios from "axios";

type TokenOptions = { skipCache?: boolean };
type AccessTokenProvider = (options?: TokenOptions) => Promise<string | null>;
type RetriableRequest = { _slaivioAuthRetried?: boolean };
let accessTokenProvider: AccessTokenProvider | null = null;
export const SESSION_EXPIRED_EVENT = "slaivio:session-expired";

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
    return Promise.reject(error);
  },
);
