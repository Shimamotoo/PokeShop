'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Trash2 } from 'lucide-react';
import {
  CardConditionLabels,
  type ListingView,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/features/auth/use-auth';
import { formatBrlFromCents } from '@/app/catalog/[tcgdexId]/page';

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [listing, setListing] = useState<ListingView | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    apiClient<ListingView>(`/listings/${encodeURIComponent(id)}`, {
      signal: controller.signal,
    })
      .then((data) => {
        setListing(data);
        setSelectedPhotoIndex(0);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Anúncio não encontrado.'
          );
        }
      });

    return () => controller.abort();
  }, [id]);

  async function handleCancel() {
    if (!listing) return;
    setIsCancelling(true);
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
      setError(
        cancelErr instanceof Error
          ? cancelErr.message
          : 'Não foi possível cancelar o anúncio.'
      );
    } finally {
      setIsCancelling(false);
    }
  }

  const activePhoto = listing?.photos[selectedPhotoIndex] ?? listing?.photos[0];
  const isOwner = user && listing && user.id === listing.sellerId;

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
                <span className="listing-status-chip">{listing.status}</span>
              </div>

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

              {isOwner && listing.status === 'DISPONIVEL' && (
                <div className="listing-owner-controls">
                  <button
                    type="button"
                    className="listing-cancel-btn"
                    onClick={handleCancel}
                    disabled={isCancelling}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    <span>
                      {isCancelling
                        ? 'Cancelando anúncio…'
                        : 'Excluir / Cancelar anúncio'}
                    </span>
                  </button>
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
