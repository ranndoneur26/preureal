"use client";

import { createContext, useContext } from "react";
import type { Locale, Strings } from "@/lib/i18n";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: "USER" | "ADMIN";
  plan: "FREE" | "PREMIUM" | "PRO";
  locale?: string;
  alertsEnabled?: boolean; // v24: resum mensual de preferits (opt-in)
  emailVerified?: boolean;
}

export interface AuthState {
  user: AuthUser | null;
  quota: { used: number; limit: number } | null;
  refresh: () => Promise<void>;
}

export interface AppCtx {
  locale: Locale;
  t: Strings;
  setLocale: (l: Locale) => void;
  navigate: (route: string) => void;
  auth: AuthState;
}

export const AppContext = createContext<AppCtx>(null as unknown as AppCtx);

export function useApp(): AppCtx {
  return useContext(AppContext);
}
