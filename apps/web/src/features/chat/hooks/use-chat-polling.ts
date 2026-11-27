'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CHAT_POLLING_INTERVAL_MS,
  type ChatMessageView,
  type ChatRoomContextView,
  type ListChatMessagesResponse,
  type MarkChatReadResponse,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import { mergeChatMessages } from '../chat-messages.utils';

export { mergeChatMessages };

export function useChatPolling(orderId: string, enabled: boolean) {
  const [room, setRoom] = useState<ChatRoomContextView | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const cursorRef = useRef<{ after: string; afterId: string } | null>(null);
  const inFlightRef = useRef(false);

  const markAsReadSilently = useCallback(async () => {
    try {
      await apiClient<MarkChatReadResponse>(
        `/orders/${encodeURIComponent(orderId)}/chat/read`,
        { method: 'POST' }
      );
    } catch {
      // Falhas transitórias ao marcar leitura não interrompem a conversa
    }
  }, [orderId]);

  const fetchMessages = useCallback(
    async (incremental: boolean, signal?: AbortSignal) => {
      if (!enabled || !orderId || inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const params = new URLSearchParams();
        if (incremental && cursorRef.current) {
          params.set('after', cursorRef.current.after);
          params.set('afterId', cursorRef.current.afterId);
        }
        const query = params.toString();
        const endpoint = `/orders/${encodeURIComponent(orderId)}/chat/messages${
          query ? `?${query}` : ''
        }`;

        const data = await apiClient<ListChatMessagesResponse>(endpoint, { signal });
        if (signal?.aborted) return;

        setRoom(data.room);
        setError(null);

        if (data.messages.length > 0) {
          const lastMsg = data.messages[data.messages.length - 1];
          cursorRef.current = {
            after: lastMsg.createdAt,
            afterId: lastMsg.id,
          };
          setMessages((prev) => mergeChatMessages(prev, data.messages));
          void markAsReadSilently();
        } else if (!incremental) {
          void markAsReadSilently();
        }
      } catch (loadErr) {
        if (!signal?.aborted && !incremental) {
          setError(
            loadErr instanceof Error
              ? loadErr.message
              : 'Não foi possível carregar a sala de chat.'
          );
        }
      } finally {
        inFlightRef.current = false;
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [enabled, orderId, markAsReadSilently]
  );

  useEffect(() => {
    cursorRef.current = null;
    setMessages([]);
    setRoom(null);
    setError(null);
    setSendError(null);

    if (!enabled || !orderId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isFirstRun = true;
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
      }, CHAT_POLLING_INTERVAL_MS);
    };

    const runCycle = async () => {
      if (controller.signal.aborted || document.visibilityState === 'hidden') {
        return;
      }
      const incremental = !isFirstRun && cursorRef.current !== null;
      isFirstRun = false;
      await fetchMessages(incremental, controller.signal);
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
  }, [enabled, orderId, fetchMessages]);

  const sendMessage = useCallback(
    async (rawContent: string): Promise<boolean> => {
      const content = rawContent.trim();
      if (!content) {
        setSendError('Escreva uma mensagem antes de enviar.');
        return false;
      }

      setSendError(null);
      setIsSending(true);
      try {
        const created = await apiClient<ChatMessageView>(
          `/orders/${encodeURIComponent(orderId)}/chat/messages`,
          {
            method: 'POST',
            body: JSON.stringify({ content }),
          }
        );

        cursorRef.current = {
          after: created.createdAt,
          afterId: created.id,
        };
        setMessages((prev) => mergeChatMessages(prev, [created]));
        return true;
      } catch (err) {
        setSendError(
          err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.'
        );
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [orderId]
  );

  return {
    room,
    messages,
    isLoading,
    isSending,
    error,
    sendError,
    sendMessage,
    reload: () => fetchMessages(false),
  };
}
