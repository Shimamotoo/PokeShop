'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Lock, MessageSquare, Send } from 'lucide-react';
import {
  CardConditionLabels,
  ListingSaleTypeLabels,
  MAX_CHAT_MESSAGE_LENGTH,
  OrderStatusLabels,
} from '@pokeshop/shared';
import { formatBrlFromCents, formatDatePtBr } from '@/lib/format';
import { useAuth } from '@/features/auth/use-auth';
import { NegotiationsNavLink } from '@/features/chat/components/negotiations-nav-link';
import { useChatPolling } from '@/features/chat/hooks/use-chat-polling';

export default function NegotiationChatPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [draft, setDraft] = useState('');
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const { room, messages, isLoading, isSending, error, sendError, sendMessage } =
    useChatPolling(orderId, Boolean(user));

  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : null;

  useEffect(() => {
    if (!lastMessageId) return;
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastMessageId]);

  async function submitDraft() {
    if (!draft.trim() || isSending) return;
    const sent = await sendMessage(draft);
    if (sent) {
      setDraft('');
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitDraft();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submitDraft();
    }
  }

  const isBuyer = Boolean(user && room && user.id === room.buyerId);
  const counterpartyName = room
    ? isBuyer
      ? room.seller.name
      : room.buyer.name
    : '';
  const isChatOpen = room?.status === 'NEGOCIACAO_ABERTA';

  return (
    <div className="detail-shell">
      <header className="store-topbar">
        <div className="store-topbar-inner">
          <Link className="wordmark" href="/" aria-label="PokeShop, início">
            <span className="wordmark-mark" aria-hidden="true">
              P
            </span>
            <span>PokeShop</span>
          </Link>
          <div className="topbar-actions">
            <NegotiationsNavLink />
            <Link className="back-link" href="/negociacoes">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Voltar para negociações</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="catalog-shell">
        {!isAuthLoading && !user ? (
          <div className="catalog-message" style={{ marginTop: '36px' }}>
            <h1>Entre para acessar o chat da negociação</h1>
            <p>
              <Link className="auth-inline-link" href="/entrar">
                Entre na sua conta
              </Link>{' '}
              ou{' '}
              <Link className="auth-inline-link" href="/cadastro">
                crie um cadastro
              </Link>{' '}
              para conversar com segurança com a outra parte.
            </p>
          </div>
        ) : isLoading && !room ? (
          <div className="catalog-message" style={{ marginTop: '36px' }} role="status">
            <h1>Carregando sala de chat…</h1>
          </div>
        ) : error && !room ? (
          <div
            className="catalog-message catalog-error"
            style={{ marginTop: '36px' }}
            role="alert"
          >
            <h1>Sala indisponível</h1>
            <p>{error}</p>
          </div>
        ) : room ? (
          <section className="chat-workspace" aria-label="Chat privado da negociação">
            <aside className="chat-context-pane">
              <div className="chat-context-header">
                <span
                  className={`listing-status-chip status-chip-${room.status.toLowerCase()}`}
                >
                  {OrderStatusLabels[room.status]}
                </span>
                <h1>{room.listing.card.name}</h1>
                <p className="chat-context-subtitle">
                  {room.listing.card.setName}, Nº {room.listing.card.cardNumber}
                </p>
              </div>

              <dl className="chat-context-facts">
                <div>
                  <dt>Valor</dt>
                  <dd>{formatBrlFromCents(room.listing.priceInCents)}</dd>
                </div>
                <div>
                  <dt>Modalidade</dt>
                  <dd>{ListingSaleTypeLabels[room.listing.saleType]}</dd>
                </div>
                <div>
                  <dt>Condição</dt>
                  <dd>{CardConditionLabels[room.listing.condition]}</dd>
                </div>
                <div>
                  <dt>Seu papel</dt>
                  <dd>{isBuyer ? 'Comprador' : 'Vendedor'}</dd>
                </div>
                <div>
                  <dt>{isBuyer ? 'Vendedor' : 'Comprador'}</dt>
                  <dd>{counterpartyName}</dd>
                </div>
              </dl>

              <p className="chat-context-note">
                Combine frete, embalagem e pagamento externo diretamente neste chat.
              </p>

              <Link
                className="listing-view-link chat-context-link"
                href={`/listings/${encodeURIComponent(room.listing.id)}`}
              >
                Ver anúncio
              </Link>
            </aside>

            <div className="chat-thread-pane">
              <header className="chat-thread-header">
                <div>
                  <h2>Conversa com {counterpartyName}</h2>
                  <p className="chat-polling-caption">
                    Atualização automática a cada 4 segundos
                  </p>
                </div>
              </header>

              <div
                className="chat-messages-list"
                aria-live="polite"
                aria-label="Mensagens da negociação"
              >
                {messages.length === 0 ? (
                  <div className="chat-empty-state">
                    <MessageSquare size={22} aria-hidden="true" />
                    <p>
                      Nenhuma mensagem enviada ainda. Comece combinando os detalhes de
                      envio e pagamento externo.
                    </p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isMine = message.senderId === user?.id;
                    return (
                      <article
                        key={message.id}
                        className={`chat-bubble ${isMine ? 'is-mine' : 'is-theirs'}`}
                      >
                        <header className="chat-bubble-meta">
                          <strong>{isMine ? 'Você' : message.senderName}</strong>
                          <time dateTime={message.createdAt}>
                            {formatDatePtBr(message.createdAt)}
                          </time>
                        </header>
                        <p className="chat-bubble-body">{message.content}</p>
                      </article>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {isChatOpen ? (
                <form className="chat-composer" onSubmit={handleFormSubmit}>
                  {sendError && (
                    <div className="auth-alert chat-send-error" role="alert">
                      {sendError}
                    </div>
                  )}
                  <label className="visually-hidden" htmlFor="chat-message-input">
                    Escreva sua mensagem
                  </label>
                  <textarea
                    id="chat-message-input"
                    rows={3}
                    maxLength={MAX_CHAT_MESSAGE_LENGTH}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    placeholder="Escreva sua mensagem para combinar frete e envio..."
                    disabled={isSending}
                  />
                  <div className="chat-composer-footer">
                    <span className="chat-char-count">
                      {draft.length}/{MAX_CHAT_MESSAGE_LENGTH}
                    </span>
                    <button
                      type="submit"
                      className="order-primary-btn"
                      disabled={isSending || !draft.trim()}
                    >
                      <Send size={15} aria-hidden="true" />
                      <span>{isSending ? 'Enviando…' : 'Enviar mensagem'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="chat-closed-notice" role="status">
                  <Lock size={16} aria-hidden="true" />
                  <span>
                    Esta negociação foi encerrada. O histórico permanece disponível para
                    consulta.
                  </span>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
