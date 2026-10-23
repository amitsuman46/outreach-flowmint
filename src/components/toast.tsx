"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconInfo, IconX } from "./icons";
import { cx } from "./ui";

type Tone = "success" | "error" | "info" | "warn";
type Toast = { id: number; tone: Tone; title: string; detail?: string };
type Push = (tone: Tone, title: string, detail?: string) => void;

const ToastContext = createContext<Push>(() => undefined);

export function useToast(): Push {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<Push>(
    (tone, title, detail) => {
      const id = Date.now() + Math.random();
      setToasts((list) => [...list.slice(-3), { id, tone, title, detail }]);
      setTimeout(() => dismiss(id), tone === "error" || tone === "warn" ? 9000 : 4500);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? IconCheck : toast.tone === "info" ? IconInfo : IconAlert;
          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex items-start gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-2xl shadow-black/20 ring-1 ring-white/10 animate-toast-in"
            >
              <span
                className={cx(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                  toast.tone === "success" && "bg-mint-500 text-ink",
                  toast.tone === "error" && "bg-red-500 text-white",
                  toast.tone === "warn" && "bg-amber-400 text-ink",
                  toast.tone === "info" && "bg-sky-400 text-ink",
                )}
              >
                <Icon size={12} strokeWidth={2.6} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{toast.title}</p>
                {toast.detail ? <p className="mt-0.5 text-[13px] leading-5 break-words text-slate-300">{toast.detail}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="text-slate-400 hover:text-white"
                aria-label="Dismiss"
              >
                <IconX size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
