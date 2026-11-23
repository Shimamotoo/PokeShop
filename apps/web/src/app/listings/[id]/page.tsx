'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  CardConditionLabels,
  OrderStatusLabels,
  type ListingView,
  type OrderView,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import { formatBrlFromCents, formatDatePtBr } from '@/lib/format';
import { useAuth } from '@/features/auth/use-auth';

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [listing, setListing] = useState<ListingView | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isConfirmingReserveStep, setIsConfirmingReserveStep] = useState(false);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const loadListing = useCallback(
    async (signal?: AbortSignal) => {
      const data = await apiClient<ListingView>(`/listings/${encodeURIComponent(id)}`, {
        signal,
      });
      setListing(data);
      setSelectedPhotoIndex(0);
    },
    [id]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadListing(controller.signal).catch((requestError: unknown) => {
      if (!controller.signal.aborted) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Anúncio não encontrado.'
        );
      }
    });

    return () => controller.abort();
  }, [loadListing]);

  async function handleReservePurchase() {
    if (!listing) return;
    setActionError(null);
    setActionFeedback(null);
    setIsSubmittingAction(true);

    try {
      await apiClient<OrderView>('/orders', {
        method: 'POST',
        body: JSON.stringify({ listingId: listing.id }),
      });
      setIsConfirmingReserveStep(false);
      await loadListing();
      setActionFeedback(
        'Reserva confirmada! O exemplar foi bloqueado e aguarda confirmação do vendedor.'
      );
    } catch (reserveErr) {
      setActionError(
        reserveErr instanceof Error
          ? reserveErr.message
          : 'Não foi possível iniciar a reserva deste exemplar.'
      );
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function handleSellerDecision(decision: 'confirm' | 'decline') {
    if (!listing?.activeOrder) return;
    setActionError(null);
    setActionFeedback(null);
    setIsSubmittingAction(true);

    try {
      await apiClient<OrderView>(
        `/orders/${encodeURIComponent(listing.activeOrder.id)}/${decision}`,
        {
          method: 'POST',
        }
      );
      await loadListing();
      setActionFeedback(
        decision === 'confirm'
          ? 'Disponibilidade confirmada! A negociação está aberta.'
          : 'Solicitação recusada. O exemplar retornou para a vitrine como disponível.'
      );
    } catch (decisionErr) {
      setActionError(
        decisionErr instanceof Error
          ? decisionErr.message
          : 'Não foi possível processar a resposta da reserva.'
      );
    } finally {
      setIsSubmittingAction(false);
    }
  }

  async function handleCancel() {
    if (!listing) return;
    setActionError(null);
    setIsSubmittingAction(true);
    try {
      const updated = await apiClient<ListingView>(
        `/listings/${encodeURIComponent(listing.id)}`,
        {
          method: 'DELETE',
        }
      );
      setListing(updated);
      router.push(`/catalog/${encodeURIComponent(updated.card.tcgdexId)}`);
    } catch (cancelErr) {
      setActionError(
        cancelErr instanceof Error
          ? cancelErr.message
          : 'Não foi possível cancelar o anúncio.'
      );
    } finally {
      setIsSubmittingAction(false);
    }
  }

  const activePhoto = listing?.photos[selectedPhotoIndex] ?? listing?.photos[0];
  const isOwner = Boolean(user && listing && user.id === listing.sellerId);
  const isActiveBuyer = Boolean(
    user && listing?.activeOrder && user.id === listing.activeOrder.buyerId
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
            {user && (
              <Link className="topbar-nav-link" href="/negociacoes">
                Negociações
              </Link>
            )}
            {listing ? (
              <Link
                className="back-link"
                href={`/catalog/${encodeURIComponent(listing.card.tcgdexId)}`}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Voltar para {listing.card.name}</span>
              </Link>
            ) : (
              <Link className="back-link" href="/">
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Voltar para a vitrine</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="catalog-shell">
        {listing ? (
          <article className="card-detail">
            <div className="listing-gallery-column">
              <div className="detail-art listing-photo-stage">
                {activePhoto ? (
                  <div className="listing-signed-photo-box">
                    {listing.card.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${listing.card.imageUrl}/high.png`}
                        alt={`Exemplar de ${listing.card.name} anunciado por ${listing.seller.name}`}
                      />
                    ) : null}
                    <div className="signed-url-caption">
                      <ShieldCheck size={14} aria-hidden="true" />
                      <span>
                        Foto real #{selectedPhotoIndex + 1} • URL S3 pré-assinada ativa
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="image-placeholder">Sem foto</span>
                )}
              </div>

              {listing.photos.length > 1 && (
                <div
                  className="listing-thumbnails-row"
                  role="tablist"
                  aria-label="Fotos reais do exemplar"
                >
                  {listing.photos.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      className={`listing-thumb-btn ${
                        index === selectedPhotoIndex ? 'is-active' : ''
                      }`}
                      onClick={() => setSelectedPhotoIndex(index)}
                    >
                      Foto #{index + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-copy">
              <div className="detail-header-meta">
                <p className="detail-kicker">
                  {listing.card.setName} • Nº {listing.card.cardNumber}
                </p>
                <span
                  className={`condition-badge condition-${listing.condition.toLowerCase()}`}
                >
                  {CardConditionLabels[listing.condition]}
                </span>
              </div>

              <h1>{listing.card.name}</h1>

              <div className="listing-detail-price-card">
                <div>
                  <span className="listing-sale-mode">Modalidade Preço Fixo</span>
                  <strong className="listing-detail-price">
                    {formatBrlFromCents(listing.priceInCents)}
                  </strong>
                </div>
                <span
                  className={`listing-status-chip status-chip-${listing.status.toLowerCase()}`}
                >
                  {OrderStatusLabels[listing.status]}
                </span>
              </div>

              {actionFeedback && (
                <div
                  className="listing-feedback-banner order-inline-feedback"
                  role="status"
                >
                  <span>{actionFeedback}</span>
                </div>
              )}

              {actionError && (
                <div className="auth-alert order-inline-feedback" role="alert">
                  {actionError}
                </div>
              )}

              {listing.status === 'DISPONIVEL' && listing.saleType === 'PRECO_FIXO' && (
                <div className="order-action-panel">
                  {!user ? (
                    <p className="order-action-note">
                      <Link className="auth-inline-link" href="/entrar">
                        Entre na sua conta
                      </Link>{' '}
                      ou{' '}
                      <Link className="auth-inline-link" href="/cadastro">
                        cadastre-se
                      </Link>{' '}
                      para reservar este exemplar por preço fixo.
                    </p>
                  ) : isOwner ? (
                    <div className="listing-owner-controls">
                      <button
                        type="button"
                        className="listing-cancel-btn"
                        onClick={handleCancel}
                        disabled={isSubmittingAction}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        <span>
                          {isSubmittingAction
                            ? 'Cancelando anúncio…'
                            : 'Excluir / Cancelar anúncio'}
                        </span>
                      </button>
                    </div>
                  ) : !isConfirmingReserveStep ? (
                    <div className="order-buy-box">
                      <button
                        type="button"
                        className="order-primary-btn"
                        onClick={() => {
                          setActionError(null);
                          setIsConfirmingReserveStep(true);
                        }}
                      >
                        <ShoppingBag size={16} aria-hidden="true" />
                        <span>Comprar por preço fixo</span>
                      </button>
                      <p className="order-action-hint">
                        Reserva o exemplar com exclusividade por até 30 dias aguardando a
                        confirmação do vendedor.
                      </p>
                    </div>
                  ) : (
                    <div className="order-confirm-card">
                      <h3>Confirmar solicitação de compra</h3>
                      <p>
                        Ao confirmar, o exemplar fica bloqueado para outros compradores.
                        <strong>
                          {' '}
                          Você não poderá cancelar a reserva após o envio
                        </strong>{' '}
                        — caso o vendedor não responda em 30 dias, o anúncio volta
                        automaticamente para a loja.
                      </p>
                      <div className="order-confirm-actions">
                        <button
                          type="button"
                          className="order-primary-btn"
                          onClick={handleReservePurchase}
                          disabled={isSubmittingAction}
                        >
                          {isSubmittingAction
                            ? 'Reservando exemplar…'
                            : 'Confirmar reserva'}
                        </button>
                        <button
                          type="button"
                          className="order-secondary-btn"
                          onClick={() => setIsConfirmingReserveStep(false)}
                          disabled={isSubmittingAction}
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {listing.status === 'AGUARDANDO_CONFIRMACAO' && (
                <div className="order-status-panel is-pending">
                  {isOwner && listing.activeOrder ? (
                    <>
                      <div className="order-status-heading">
                        <Clock size={16} aria-hidden="true" />
                        <strong>Solicitação de compra recebida</strong>
                      </div>
                      <p>
                        Comprador: <strong>{listing.activeOrder.buyerName}</strong>.
                        {listing.activeOrder.expiresAt
                          ? ` Responda até ${formatDatePtBr(listing.activeOrder.expiresAt)} para não expirar automaticamente.`
                          : ''}
                      </p>
                      <div className="order-confirm-actions">
                        <button
                          type="button"
                          className="order-accept-btn"
                          onClick={() => handleSellerDecision('confirm')}
                          disabled={isSubmittingAction}
                        >
                          <CheckCircle2 size={15} aria-hidden="true" />
                          <span>
                            {isSubmittingAction
                              ? 'Processando…'
                              : 'Confirmar disponibilidade'}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="listing-cancel-btn"
                          onClick={() => handleSellerDecision('decline')}
                          disabled={isSubmittingAction}
                        >
                          <XCircle size={15} aria-hidden="true" />
                          <span>Recusar solicitação</span>
                        </button>
                      </div>
                    </>
                  ) : isActiveBuyer && listing.activeOrder ? (
                    <>
                      <div className="order-status-heading">
                        <Clock size={16} aria-hidden="true" />
                        <strong>Você reservou este exemplar</strong>
                      </div>
                      <p>
                        Aguardando o vendedor confirmar a disponibilidade
                        {listing.activeOrder.expiresAt
                          ? ` (prazo limite: ${formatDatePtBr(listing.activeOrder.expiresAt)})`
                          : ''}
                        . O comprador não pode cancelar após iniciar a reserva.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="order-status-heading">
                        <Lock size={16} aria-hidden="true" />
                        <strong>Exemplar reservado no momento</strong>
                      </div>
                      <p>
                        Outro colecionador iniciou a compra por preço fixo e aguarda a
                        confirmação do vendedor.
                      </p>
                    </>
                  )}
                </div>
              )}

              {listing.status === 'NEGOCIACAO_ABERTA' && (
                <div
                  className={`order-status-panel ${
                    isOwner || isActiveBuyer ? 'is-open' : ''
                  }`}
                >
                  {isOwner || isActiveBuyer ? (
                    <>
                      <div className="order-status-heading">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        <strong>Disponibilidade confirmada • Negociação aberta</strong>
                      </div>
                      <p>
                        Acompanhe o status desta negociação em{' '}
                        <Link className="auth-inline-link" href="/negociacoes">
                          Minhas negociações
                        </Link>
                        .
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="order-status-heading">
                        <Lock size={16} aria-hidden="true" />
                        <strong>Exemplar em negociação</strong>
                      </div>
                      <p>Este exemplar já está em negociação entre comprador e vendedor.</p>
                    </>
                  )}
                </div>
              )}

              <dl className="detail-facts">
                <div>
                  <dt>Vendedor</dt>
                  <dd>{listing.seller.name}</dd>
                </div>
                <div>
                  <dt>Condição física</dt>
                  <dd>{CardConditionLabels[listing.condition]}</dd>
                </div>
                <div>
                  <dt>Idioma</dt>
                  <dd>{listing.language}</dd>
                </div>
                {listing.edition && (
                  <div>
                    <dt>Edição</dt>
                    <dd>{listing.edition}</dd>
                  </div>
                )}
                <div>
                  <dt>Fotos verificadas (S3)</dt>
                  <dd>{listing.photos.length} de 5</dd>
                </div>
              </dl>

              {listing.description && (
                <div className="detail-note">
                  <strong>Observações do vendedor:</strong>
                  <p style={{ margin: '6px 0 0' }}>{listing.description}</p>
                </div>
              )}
            </div>
          </article>
        ) : (
          <div
            className="catalog-message"
            style={{ marginTop: '44px' }}
            role={error ? 'alert' : 'status'}
          >
            <h1>{error ? 'Anúncio indisponível' : 'Carregando exemplar…'}</h1>
            {error && <p>{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
