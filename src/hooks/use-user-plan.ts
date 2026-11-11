"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * v22 — useUserPlan() (encàrrec Fase 1, punt 6).
 *
 * Obté l'estat de la suscripció DES DEL SERVIDOR (GET /api/subscription) i mai
 * des del client: el pla efectiu el decideix el backend a partir de les
 * subscripcions vigents (equivalent a supabase.auth.getUser() + RLS del
 * encàrrec). El frontend es refresca amb `refresh()` després de qualsevol
 * acció que canvii la suscripció (checkout, cancelar, reactivar...).
 *
 * Camps retornats (exactament els del encàrrec): planType, subscriptionStatus,
 * isFree, isPremium, isProAgents, hasPremiumAccess, hasProAgentsAccess,
 * currentPeriodEnd, cancelAtPeriodEnd, subscriptionCount,
 * monthlyDetailedQueriesUsed, loading.
 */

export interface UserPlanState {
  planType: "free" | "premium" | "pro_agents";
  subscriptionStatus: string;
  isFree: boolean;
  isPremium: boolean;
  isProAgents: boolean;
  hasPremiumAccess: boolean;
  hasProAgentsAccess: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  subscriptionCount: number;
  monthlyDetailedQueriesUsed: number;
  stripeConfigured: boolean;
  demoCheckout: boolean;
}

const DEFAULT_STATE: UserPlanState = {
  planType: "free",
  subscriptionStatus: "free",
  isFree: true,
  isPremium: false,
  isProAgents: false,
  hasPremiumAccess: false,
  hasProAgentsAccess: false,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  subscriptionCount: 0,
  monthlyDetailedQueriesUsed: 0,
  stripeConfigured: false,
  demoCheckout: false,
};

export function useUserPlan() {
  const [state, setState] = useState<UserPlanState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/subscription", { cache: "no-store" });
      if (r.ok) {
        const d = await r.json();
        setState({ ...DEFAULT_STATE, ...d });
      } else if (r.status === 401) {
        // sense sessió: estat per defecte (pla gratuït)
        setState(DEFAULT_STATE);
      }
      // altres errors: es manté l'últim estat conegut
    } catch {
      // xarxa caiguda: es manté l'últim estat conegut
    } finally {
      setLoading(false);
    }
  }, []);

  // lint v2: el refresc inicial es fa en una continuació asíncrona (setState
  // mai és síncron dins de l'efecte; regla react-hooks/set-state-in-effect)
  useEffect(() => {
    void (async () => {
      await Promise.resolve();
      await refresh();
    })();
  }, [refresh]);

  return { ...state, loading, refresh };
}
