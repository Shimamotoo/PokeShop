'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  INDICATORS_POLLING_INTERVAL_MS,
  type ChatIndicatorsResponse,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';

export function useChatIndicators(enabled: boolean) {
  const [indicators, setIndicators] = useState<ChatIndicatorsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inFlightRef = useRef(false);

  const fetchIndicators = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled || inFlightRef.current) return;
      inFlightRef.current = true;
      setIsLoading(true);
      try {
        const data = await apiClient<ChatIndicatorsResponse>('/chat/indicators', {
          signal,
        });
        if (!signal?.aborted) {
          setIndicators(data);
        }
      } catch {
        // Silencia falhas transitórias do polling de indicadores para não bloquear a navegação
      } finally {
        inFlightRef.current = false;
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) {
      setIndicators(null);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const clearTimer = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (controller.signal.aborted || document.visibilityState === 'hidden') {
        return;
      }
      timeoutId = setTimeout(() => {
        void runCycle();
      }, INDICATORS_POLLING_INTERVAL_MS);
    };

    const runCycle = async () => {
      if (controller.signal.aborted || document.visibilityState === 'hidden') {
        return;
      }
      await fetchIndicators(controller.signal);
      scheduleNext();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer();
      } else {
        void runCycle();
      }
    };

    void runCycle();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimer();
      controller.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, fetchIndicators]);

  const markAlertAsRead = useCallback(async (alertId: string) => {
    const res = await apiClient<{ id: string; readAt: string }>(
      `/chat/indicators/alerts/${encodeURIComponent(alertId)}/read`,
      { method: 'POST' }
    );

    setIndicators((prev) => {
      if (!prev) return prev;
      let wasUnread = false;
      const alerts = prev.alerts.map((alert) => {
        if (alert.id === alertId && alert.readAt === null) {
          wasUnread = true;
          return { ...alert, readAt: res.readAt };
        }
        return alert;
      });
      const unreadStatusAlertsCount = wasUnread
        ? Math.max(0, prev.unreadStatusAlertsCount - 1)
        : prev.unreadStatusAlertsCount;
      return {
        ...prev,
        alerts,
        unreadStatusAlertsCount,
        totalBadgeCount: prev.unreadMessagesCount + unreadStatusAlertsCount,
      };
    });
  }, []);

  const markAllAlertsAsRead = useCallback(async () => {
    await apiClient<{ updatedCount: number }>('/chat/indicators/alerts/read-all', {
      method: 'POST',
    });

    const readAt = new Date().toISOString();
    setIndicators((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        unreadStatusAlertsCount: 0,
        totalBadgeCount: prev.unreadMessagesCount,
        alerts: prev.alerts.map((alert) => ({
          ...alert,
          readAt: alert.readAt ?? readAt,
        })),
      };
    });
  }, []);

  return {
    indicators,
    isLoading,
    refresh: () => fetchIndicators(),
    markAlertAsRead,
    markAllAlertsAsRead,
  };
}
