import type { ChatMessageView } from '@pokeshop/shared';

export function mergeChatMessages(
  current: ChatMessageView[],
  incoming: ChatMessageView[]
): ChatMessageView[] {

  const byId = new Map<string, ChatMessageView>();

  for (const message of current) {
    byId.set(message.id, message);
  }

  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const timeDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return a.id.localeCompare(b.id);
  });
}
