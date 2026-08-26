import { api } from "@/services/api";

export type MetaEmbeddedSignupConfig = {
  enabled: boolean;
  app_id: string | null;
  config_id: string | null;
  api_version: string;
};

type SignupResult = {
  code: string;
  business_id?: string;
  waba_id: string;
  phone_number_id: string;
};

type FacebookLoginResponse = { authResponse?: { code?: string }; status?: string };
type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: FacebookLoginResponse) => void, options: Record<string, unknown>) => void;
};

declare global {
  interface Window { FB?: FacebookSdk; fbAsyncInit?: () => void; }
}

export async function getMetaEmbeddedSignupConfig() {
  return (await api.get<MetaEmbeddedSignupConfig>("/meta/embedded-signup/config")).data;
}

export async function onboardMetaWhatsApp(result: SignupResult) {
  return (await api.post("/meta/oauth/onboard", result)).data;
}

function loadFacebookSdk(appId: string, apiVersion: string): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("meta_sdk_timeout")), 15000);
    window.fbAsyncInit = () => {
      if (!window.FB) return reject(new Error("meta_sdk_unavailable"));
      window.clearTimeout(timeout);
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version: apiVersion });
      resolve(window.FB);
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/fr_FR/sdk.js";
    script.onerror = () => { window.clearTimeout(timeout); reject(new Error("meta_sdk_load_failed")); };
    document.head.appendChild(script);
  });
}

export async function launchMetaEmbeddedSignup(config: MetaEmbeddedSignupConfig): Promise<SignupResult> {
  if (!config.enabled || !config.app_id || !config.config_id) throw new Error("meta_not_configured");
  const facebook = await loadFacebookSdk(config.app_id, config.api_version);
  return new Promise((resolve, reject) => {
    let code = "";
    let session: Omit<SignupResult, "code"> | null = null;
    const timeout = window.setTimeout(() => finish(new Error("meta_signup_timeout")), 120000);
    const onMessage = (event: MessageEvent) => {
      if (!/^https:\/\/([a-z0-9-]+\.)*facebook\.com$/i.test(event.origin)) return;
      let payload: unknown = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      const message = payload as { type?: string; event?: string; data?: Record<string, string> };
      if (message.type !== "WA_EMBEDDED_SIGNUP") return;
      if (message.event === "CANCEL") return finish(new Error("meta_signup_cancelled"));
      if (message.event !== "FINISH" || !message.data?.waba_id || !message.data?.phone_number_id) return;
      session = { business_id: message.data.business_id, waba_id: message.data.waba_id, phone_number_id: message.data.phone_number_id };
      complete();
    };
    const cleanup = () => { window.clearTimeout(timeout); window.removeEventListener("message", onMessage); };
    const finish = (error: Error) => { cleanup(); reject(error); };
    const complete = () => { if (code && session) { cleanup(); resolve({ code, ...session }); } };
    window.addEventListener("message", onMessage);
    facebook.login((response) => {
      code = response.authResponse?.code || "";
      if (!code) return finish(new Error(response.status === "not_authorized" ? "meta_signup_not_authorized" : "meta_signup_cancelled"));
      complete();
    }, {
      config_id: config.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" },
    });
  });
}
