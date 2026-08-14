"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { API_MUTATION_FAILED_EVENT } from "@/services/api";

export function ApiMutationFeedback() {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function failed(event: Event) {
      const next = (event as CustomEvent<{ message?: string }>).detail?.message;
      if (!next) return;
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(""), 9000);
    }
    window.addEventListener(API_MUTATION_FAILED_EVENT, failed);
    return () => {
      window.removeEventListener(API_MUTATION_FAILED_EVENT, failed);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!message) return null;
  return (
    <div role="alert" className="fixed bottom-5 right-5 z-[100] flex max-w-[430px] items-start gap-3 rounded-lg border border-red-200 bg-white p-4 text-[13px] text-red-800 shadow-xl">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <div><b className="block text-red-900">Action non enregistrée</b><p className="mt-1 leading-5">{message}</p></div>
      <button onClick={() => setMessage("")} aria-label="Fermer" className="ml-auto text-red-700"><X size={16} /></button>
    </div>
  );
}
