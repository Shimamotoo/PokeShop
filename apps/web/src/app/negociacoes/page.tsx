'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, CheckCircle2, Clock, MessageSquare, XCircle } from 'lucide-react';
import {
  CardConditionLabels,
  ListingSaleTypeLabels,
  OrderStatusLabels,
  type ListOrdersResponse,
  type OrderView,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import { formatBrlFromCents, formatDatePtBr } from '@/lib/format';
import { useAuth } from '@/features/auth/use-auth';
import { NegotiationsNavLink } from '@/features/chat/components/negotiations-nav-link';
import { useChatIndicators } from '@/features/chat/hooks/use-chat-indicators';

type NegotiationsTab = 'seller' | 'buyer';

export default function NegotiationsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const {
    indicators,
    refresh: refreshIndicators,
    markAlertAsRead,
    markAllAlertsAsRead,
  } = useChatIndicators(Boolean(user));
  const [activeTab, setActiveTab] = useState<NegotiationsTab>('seller');
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    setIsLoadingOrders(true);
    setError(null);
    try {
      const response = await apiClient<ListOrdersResponse>('/orders?role=all', {
        signal,
      });
      setOrders(response.items);
    } catch (loadErr) {
      if (!signal?.aborted) {
        setError(
          loadErr instanceof Error
            ? loadErr.message
            : 'Não foi possível carregar suas negociações.'
        );
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoadingOrders(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void loadOrders(controller.signal);
    return () => controller.abort();
  }, [user, loadOrders]);

  async function handleSellerDecision(orderId: string, decision: 'confirm' | 'decline') {
    setBusyOrderId(orderId);
    setError(null);
    setFeedback(null);
    try {
      await apiClient<OrderView>(`/orders/${encodeURIComponent(orderId)}/${decision}`, {
        method: 'POST',
      });
      setFeedback(
        decision === 'confirm'
          ? 'Disponibilidade confirmada! A negociação foi aberta.'
          : 'Solicitação recusada. O exemplar voltou a ficar disponível na loja.'
      );
      await loadOrders();
      await refreshIndicators();
    } catch (decisionErr) {
      setError(
        decisionErr instanceof Error
          ? decisionErr.message
          : 'Não foi possível atualizar a solicitação.'
      );
    } finally {
      setBusyOrderId(null);
    }
  }

  const sellerOrders = user ? orders.filter((order) => order.sellerId === user.id) : [];
  const buyerOrders = user ? orders.filter((order) => order.buyerId === user.id) : [];
  const visibleOrders = activeTab === 'seller' ? sellerOrders : buyerOrders;
  const unreadAlerts = (indicators?.alerts ?? []).filter((alert) => alert.readAt === null);
  const unreadByOrderMap = new Map(
    (indicators?.unreadByOrder ?? []).map((item) => [item.orderId, item.unreadCount])
  );

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
            <Link className="back-link" href="/">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Voltar</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="catalog-shell">
        <section className="negotiations-stage">
          <div className="negotiations-header">
            <div>
              <h1>Minhas negociações</h1>
              <p>
                Acompanhe solicitações recebidas nos seus anúncios e reservas.
              </p>
            </div>
          </div>

          {!isAuthLoading && !user ? (
            <div className="catalog-message">
              <h2>Entre para acompanhar suas negociações</h2>
              <p>
                <Link className="auth-inline-link" href="/entrar">
                  Entre na sua conta
                </Link>{' '}
                ou{' '}
                <Link className="auth-inline-link" href="/cadastro">
                  crie um cadastro
                </Link>{' '}
                para visualizar suas reservas e solicitações de compra.
              </p>
            </div>
          ) : (
            <>
              <div
                className="negotiations-tabs"
                role="tablist"
                aria-label="Filtrar negociações por papel"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'seller'}
                  className={`negotiations-tab-btn ${activeTab === 'seller' ? 'is-active' : ''
                    }`}
                  onClick={() => setActiveTab('seller')}
                >
                  Solicitações recebidas ({sellerOrders.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'buyer'}
                  className={`negotiations-tab-btn ${activeTab === 'buyer' ? 'is-active' : ''
                    }`}
                  onClick={() => setActiveTab('buyer')}
                >
                  Minhas reservas ({buyerOrders.length})
                </button>
              </div>

              {unreadAlerts.length > 0 && (
                <section className="alerts-strip" aria-label="Atualizações recentes">
                  <div className="alerts-strip-header">
                    <div className="alerts-strip-title">
                      <Bell size={15} aria-hidden="true" />
                      <strong>Atualizações de estado ({unreadAlerts.length})</strong>
                    </div>
                    <button
                      type="button"
                      className="alerts-clear-btn"
                      onClick={() => void markAllAlertsAsRead()}
                    >
                      Marcar todos como lidos
                    </button>
                  </div>
                  <ul className="alerts-strip-list">
                    {unreadAlerts.map((alert) => (
                      <li key={alert.id} className="alerts-strip-item">
                        <span>{alert.message}</span>
                        <div className="alerts-strip-actions">
                          {alert.orderId && (
                            <Link
                              className="auth-inline-link"
                              href={`/negociacoes/${encodeURIComponent(alert.orderId)}`}
                            >
                              Ver chat
                            </Link>
                          )}
                          <button
                            type="button"
                            className="alerts-dismiss-btn"
                            onClick={() => void markAlertAsRead(alert.id)}
                          >
                            Marcar como lido
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {feedback && (
                <div className="listing-feedback-banner" role="status">
                  <span>{feedback}</span>
                </div>
              )}

              {error && (
                <div className="auth-alert order-inline-feedback" role="alert">
                  {error}
                </div>
              )}

              {isLoadingOrders && orders.length === 0 ? (
                <div className="catalog-message" role="status">
                  <h3>Carregando negociações…</h3>
                </div>
              ) : visibleOrders.length === 0 ? (
                <div className="catalog-message">
                  <h3>
                    {activeTab === 'seller'
                      ? 'Nenhuma solicitação recebida até o momento'
                      : 'Você ainda não reservou nenhum exemplar'}
                  </h3>
                  <p>
                    {activeTab === 'seller'
                      ? 'Quando um comprador reservar um anúncio, ele aparecerá aqui para confirmação.'
                      : 'Explore o catálogo para encontrar exemplares disponíveis.'}
                  </p>
                </div>
              ) : (
                <div className="listings-list">
                  {visibleOrders.map((order) => {
                    const unreadCount = unreadByOrderMap.get(order.id) ?? 0;
                    return (
                      <article key={order.id} className="listing-row-card">
                        <div className="listing-row-main">
                          <div className="listing-row-badges">
                            <span
                              className={`listing-status-chip status-chip-${order.status.toLowerCase()}`}
                            >
                              {OrderStatusLabels[order.status]}
                            </span>
                            <span className="listing-meta-pill">
                              {order.listing.card.setName} • Nº{' '}
                              {order.listing.card.cardNumber}
                            </span>
                            {unreadCount > 0 && (
                              <span className="chat-unread-pill">
                                {unreadCount}{' '}
                                {unreadCount === 1
                                  ? 'mensagem não lida'
                                  : 'mensagens não lidas'}
                              </span>
                            )}
                          </div>

                          <h2 className="negotiation-card-title">
                            {order.listing.card.name}
                          </h2>

                          <p className="listing-row-seller">
                            {activeTab === 'seller' ? (
                              <>
                                Comprador: <strong>{order.buyer.name}</strong>
                              </>
                            ) : (
                              <>
                                Vendedor: <strong>{order.seller.name}</strong>
                              </>
                            )}
                          </p>

                          {order.status === 'AGUARDANDO_CONFIRMACAO' && (
                            <p className="negotiation-deadline-note">
                              <Clock size={14} aria-hidden="true" />
                              <span>
                                {activeTab === 'seller'
                                  ? `Aguardando sua confirmação${order.expiresAt
                                    ? ` até ${formatDatePtBr(order.expiresAt)}`
                                    : ''
                                  }`
                                  : `Aguardando confirmação do vendedor${order.expiresAt
                                    ? ` até ${formatDatePtBr(order.expiresAt)}`
                                    : ''
                                  } • sem cancelamento pelo comprador`}
                              </span>
                            </p>
                          )}
                        </div>

                        <div className="listing-row-aside">
                          <div className="listing-price-block">
                            <strong className="listing-price-value">
                              {formatBrlFromCents(order.listing.priceInCents)}
                            </strong>
                          </div>

                          <div className="listing-row-actions">
                            <Link
                              className="listing-view-link"
                              href={`/listings/${encodeURIComponent(order.listingId)}`}
                            >
                              Ver anúncio
                            </Link>

                            {(order.status === 'NEGOCIACAO_ABERTA' ||
                              order.status === 'VENDIDO') && (
                                <Link
                                  className="chat-open-link"
                                  href={`/negociacoes/${encodeURIComponent(order.id)}`}
                                >
                                  <MessageSquare size={14} aria-hidden="true" />
                                  <span>
                                    {order.status === 'NEGOCIACAO_ABERTA'
                                      ? 'Abrir chat'
                                      : 'Ver histórico'}
                                  </span>
                                </Link>
                              )}

                            {activeTab === 'seller' &&
                              order.status === 'AGUARDANDO_CONFIRMACAO' && (
                                <>
                                  <button
                                    type="button"
                                    className="order-accept-btn"
                                    onClick={() =>
                                      handleSellerDecision(order.id, 'confirm')
                                    }
                                    disabled={busyOrderId === order.id}
                                  >
                                    <CheckCircle2 size={14} aria-hidden="true" />
                                    <span>Confirmar</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="listing-cancel-btn"
                                    onClick={() =>
                                      handleSellerDecision(order.id, 'decline')
                                    }
                                    disabled={busyOrderId === order.id}
                                  >
                                    <XCircle size={14} aria-hidden="true" />
                                    <span>Recusar</span>
                                  </button>
                                </>
                              )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
