import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ChatMessageView } from '@pokeshop/shared';
import { mergeChatMessages } from './chat-messages.utils.js';

function makeMessage(
  overrides: Partial<ChatMessageView> & { id: string; createdAt: string }
): ChatMessageView {
  return {
    chatRoomId: '00000000-0000-4000-8000-000000000010',
    senderId: '00000000-0000-4000-8000-000000000020',
    senderName: 'Ash',
    content: `Mensagem ${overrides.id}`,
    ...overrides,
  };
}

describe('mergeChatMessages', () => {
  it('mescla mensagens disjuntas em ordem cronológica crescente', () => {
    const current = [
      makeMessage({ id: 'b', createdAt: '2026-11-27T10:05:00.000Z' }),
      makeMessage({ id: 'a', createdAt: '2026-11-27T10:00:00.000Z' }),
    ];
    const incoming = [
      makeMessage({ id: 'c', createdAt: '2026-11-27T10:10:00.000Z' }),
    ];

    const merged = mergeChatMessages(current, incoming);
    assert.deepEqual(
      merged.map((m) => m.id),
      ['a', 'b', 'c']
    );
  });

  it('remove duplicatas pelo id mantendo a versão de incoming', () => {
    const current = [
      makeMessage({
        id: 'm1',
        createdAt: '2026-11-27T10:00:00.000Z',
        content: 'Versão antiga',
      }),
    ];
    const incoming = [
      makeMessage({
        id: 'm1',
        createdAt: '2026-11-27T10:00:00.000Z',
        content: 'Versão atualizada',
      }),
      makeMessage({
        id: 'm2',
        createdAt: '2026-11-27T10:01:00.000Z',
      }),
    ];

    const merged = mergeChatMessages(current, incoming);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].content, 'Versão atualizada');
    assert.equal(merged[1].id, 'm2');
  });

  it('desempata mensagens no mesmo createdAt de forma determinística por id', () => {
    const sameInstant = '2026-11-27T10:00:00.000Z';
    const current = [makeMessage({ id: 'msg-b', createdAt: sameInstant })];
    const incoming = [makeMessage({ id: 'msg-a', createdAt: sameInstant })];

    const merged = mergeChatMessages(current, incoming);
    assert.deepEqual(
      merged.map((m) => m.id),
      ['msg-a', 'msg-b']
    );
  });

  it('não muta os arrays de entrada e lida com listas vazias', () => {
    const current = [makeMessage({ id: 'm2', createdAt: '2026-11-27T10:02:00.000Z' })];
    const incoming = [makeMessage({ id: 'm1', createdAt: '2026-11-27T10:01:00.000Z' })];
    const currentSnapshot = [...current];
    const incomingSnapshot = [...incoming];

    const merged = mergeChatMessages(current, incoming);
    assert.deepEqual(current, currentSnapshot);
    assert.deepEqual(incoming, incomingSnapshot);
    assert.deepEqual(
      merged.map((m) => m.id),
      ['m1', 'm2']
    );
    assert.deepEqual(mergeChatMessages([], []), []);
  });
});
