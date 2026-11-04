// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckmarkCircle20Regular, Dismiss20Regular, ErrorCircle20Regular, Info20Regular } from "@fluentui/react-icons";

type Tone = "info" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<{
  toast: (message: string, tone?: Tone) => void;
}>({ toast: () => undefined });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, tone: Tone = "info") => {
    const id = ++counter.current;
    setItems((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4800);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((item) => (
          <div className={`toast ${item.tone}`} key={item.id}>
            {item.tone === "success" ? (
              <CheckmarkCircle20Regular />
            ) : item.tone === "error" ? (
              <ErrorCircle20Regular />
            ) : (
              <Info20Regular />
            )}
            <span>{item.message}</span>
            <button
              className="icon-button small toast-close"
              onClick={() =>
                setItems((current) =>
                  current.filter((entry) => entry.id !== item.id)
                )
              }
              aria-label="Dismiss notification"
            >
              <Dismiss20Regular />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
