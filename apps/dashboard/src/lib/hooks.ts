"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, createWSConnection, type WSMessage, type OverviewData, type Vault, type ThreatEvent, type ActivityEvent, type AlertRule, type Integration } from "./api";

// ─── Generic data fetcher hook ──────────────────────────────────────
function useApiData<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch, setData };
}

// ─── WebSocket hook ─────────────────────────────────────────────────
export function useWebSocket(onMessage?: (msg: WSMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null);
  const callbackRef = useRef(onMessage);
  callbackRef.current = onMessage;

  useEffect(() => {
    wsRef.current = createWSConnection((msg) => {
      callbackRef.current?.(msg);
    });

    return () => {
      wsRef.current?.close();
    };
  }, []);

  return wsRef;
}

// ─── Domain hooks ───────────────────────────────────────────────────

export function useOverview() {
  return useApiData(async () => {
    const { overview } = await api.getOverview();
    return overview;
  });
}

export function useVaults() {
  return useApiData(async () => {
    const { vaults } = await api.getVaults();
    return vaults;
  });
}

export function useThreats(params?: { severity?: string; status?: string }) {
  return useApiData(async () => {
    const { threats } = await api.getThreats(params);
    return threats;
  }, [params?.severity, params?.status]);
}

export function useEvents(params?: { vaultId?: string; type?: string; limit?: number }) {
  return useApiData(async () => {
    const { events } = await api.getEvents(params);
    return events;
  }, [params?.vaultId, params?.type, params?.limit]);
}

export function useSettings() {
  return useApiData(async () => {
    const { settings } = await api.getSettings();
    return settings;
  });
}

export function useAlertRules() {
  return useApiData(async () => {
    const { rules } = await api.getRules();
    return rules;
  });
}

export function useIntegrations() {
  return useApiData(async () => {
    const { integrations } = await api.getIntegrations();
    return integrations;
  });
}
