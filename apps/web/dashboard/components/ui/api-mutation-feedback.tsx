"use client";

import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { API_MUTATION_FAILED_EVENT, API_MUTATION_SUCCEEDED_EVENT } from "@/services/api";

export function ApiMutationFeedback() {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success"|"error">("error");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function failed(event: Event) {
      const next = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (!next) return;
      setTone("error");
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(""), 9000);
    }
    function succeeded(event: Event) {
      const next = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (!next) return;
      setTone("success");
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(""), 4500);
    }
    window.addEventListener(API_MUTATION_FAILED_EVENT, failed);
    window.addEventListener(API_MUTATION_SUCCEEDED_EVENT, succeeded);
    return () => {
      window.removeEventListener(API_MUTATION_FAILED_EVENT, failed);
      window.removeEventListener(API_MUTATION_SUCCEEDED_EVENT, succeeded);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!message) return null;
  return (
    <div role="status" className={`fixed bottom-5 right-5 z-[100] flex max-w-[430px] items-start gap-3 rounded-lg border bg-white p-4 text-[13px] shadow-xl ${tone==="success"?"border-emerald-200 text-emerald-800":"border-red-200 text-red-800"}`}>
      {tone==="success"?<CheckCircle2 className="mt-0.5 shrink-0" size={18}/>:<AlertTriangle className="mt-0.5 shrink-0" size={18} />}
      <div><b className={`block ${tone==="success"?"text-emerald-900":"text-red-900"}`}>{tone==="success"?"Terminé":"Échec de l’action"}</b><p className="mt-1 leading-5">{message}</p></div>
      <button onClick={() => setMessage("")} aria-label="Fermer" className="ml-auto"><X size={16} /></button>
    </div>
  );
}
