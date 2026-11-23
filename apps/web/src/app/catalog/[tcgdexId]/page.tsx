'use client';

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Camera, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import {
  ALLOWED_PHOTO_MIME_TYPES,
  CardCondition,
  CardConditionLabels,
  MAX_LISTING_PHOTOS,
  MAX_PHOTO_SIZE_BYTES,
  type AllowedPhotoMimeType,
  type CardConditionType,
  type CatalogCard,
  type ListingView,
  type ListListingsResponse,
  type PresignUploadResponse,
} from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import { formatBrlFromCents } from '@/lib/format';
import { useAuth } from '@/features/auth/use-auth';

type StagedPhoto = {
  s3Key: string;
  fileName: string;
  sizeBytes: number;
};

const CONDITION_DESCRIPTIONS: Record<CardConditionType, string> = {
  PERFEITO_ESTADO:
    'Sem dobras, riscos ou desgaste nas bordas (whitening); estado direto do booster.',
  POUCO_USADA: 'Levíssimas marcas quase imperceptíveis nas bordas ou cantos.',
  MARCAS_DE_USO: 'Desgaste visível de manuseio ou jogo, sem danos estruturais.',
  DANIFICADA: 'Vincos, dobras, manchas, marcas de umidade ou rasgos.',
};

export default function CatalogCardPage() {
  const { tcgdexId } = useParams<{ tcgdexId: string }>();
  const { user } = useAuth();
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [listings, setListings] = useState<ListingView[]>([]);
  const [isLoadingListings, setIsLoadingListings] = useState(false);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [priceInput, setPriceInput] = useState('');
  const [condition, setCondition] = useState<CardConditionType>(
    CardCondition.PERFEITO_ESTADO
  );
  const [language, setLanguage] = useState('PT-BR');
  const [edition, setEdition] = useState('');
  const [description, setDescription] = useState('');
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadListings = useCallback(async (targetCardId: string) => {
    setIsLoadingListings(true);
    try {
      const response = await apiClient<ListListingsResponse>(
        `/listings?cardId=${encodeURIComponent(targetCardId)}`
      );
      setListings(response.items);
    } catch {
      setListings([]);
    } finally {
      setIsLoadingListings(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    apiClient<CatalogCard>(`/catalog/cards/${encodeURIComponent(tcgdexId)}`, {
      signal: controller.signal,
    })
      .then((loadedCard) => {
        setCard(loadedCard);
        void loadListings(loadedCard.id);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error ? requestError.message : 'Carta não encontrada.'
          );
        }
      });
    return () => controller.abort();
  }, [tcgdexId, loadListings]);

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setFormError(null);

    if (stagedPhotos.length + files.length > MAX_LISTING_PHOTOS) {
      setFormError(`Envie no máximo ${MAX_LISTING_PHOTOS} fotos por exemplar.`);
      event.target.value = '';
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const uploadedBatch: StagedPhoto[] = [];

      for (const file of Array.from(files)) {
        if (
          !ALLOWED_PHOTO_MIME_TYPES.includes(file.type as AllowedPhotoMimeType)
        ) {
          throw new Error(
            `O arquivo "${file.name}" não é suportado. Use apenas JPEG, PNG ou WebP.`
          );
        }

        if (file.size > MAX_PHOTO_SIZE_BYTES) {
          throw new Error(
            `O arquivo "${file.name}" excede o limite máximo de 5 MB por foto.`
          );
        }

        const presigned = await apiClient<PresignUploadResponse>(
          '/listings/media/presign-upload',
          {
            method: 'POST',
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
              fileSize: file.size,
            }),
          }
        );

        uploadedBatch.push({
          s3Key: presigned.s3Key,
          fileName: file.name,
          sizeBytes: file.size,
        });
      }

      setStagedPhotos((prev) => [...prev, ...uploadedBatch]);
    } catch (uploadErr) {
      setFormError(
        uploadErr instanceof Error
          ? uploadErr.message
          : 'Não foi possível preparar a foto para upload.'
      );
    } finally {
      setIsUploadingPhoto(false);
      event.target.value = '';
    }
  }

  function removeStagedPhoto(s3Key: string) {
    setStagedPhotos((prev) => prev.filter((item) => item.s3Key !== s3Key));
  }

  async function handlePublishListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card) return;

    setFormError(null);
    setActionMessage(null);

    const normalizedPrice = Number(priceInput.replace(/\./g, '').replace(',', '.'));
    const priceInCents = Math.round(normalizedPrice * 100);

    if (!Number.isFinite(priceInCents) || priceInCents <= 0) {
      setFormError('Informe um preço válido maior que zero (ex: 149,90).');
      return;
    }

    if (stagedPhotos.length < 1) {
      setFormError('Adicione pelo menos 1 foto real do exemplar físico.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient<ListingView>('/listings', {
        method: 'POST',
        body: JSON.stringify({
          cardId: card.id,
          saleType: 'PRECO_FIXO',
          priceInCents,
          condition,
          language: language.trim() || 'PT-BR',
          edition: edition.trim() || null,
          description: description.trim() || null,
          photoKeys: stagedPhotos.map((photo) => photo.s3Key),
        }),
      });

      setPriceInput('');
      setEdition('');
      setDescription('');
      setStagedPhotos([]);
      setIsFormOpen(false);
      setActionMessage('Anúncio publicado com sucesso!');
      await loadListings(card.id);
    } catch (submitErr) {
      setFormError(
        submitErr instanceof Error
          ? submitErr.message
          : 'Não foi possível publicar o anúncio.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancelListing(listingId: string) {
    if (!card) return;
    setActionMessage(null);
    try {
      await apiClient<ListingView>(`/listings/${encodeURIComponent(listingId)}`, {
        method: 'DELETE',
      });
      setActionMessage('Anúncio cancelado e retirado da vitrine.');
      await loadListings(card.id);
    } catch (cancelErr) {
      setFormError(
        cancelErr instanceof Error
          ? cancelErr.message
          : 'Não foi possível cancelar o anúncio.'
      );
    }
  }

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
            <Link className="back-link" href="/">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Voltar para a vitrine</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="catalog-shell">
        {card ? (
          <>
            <article className="card-detail">
              <div className="detail-art">
                {card.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${card.imageUrl}/high.png`} alt={`Carta ${card.name}`} />
                ) : (
                  <span className="image-placeholder">Imagem indisponível</span>
                )}
              </div>

              <div className="detail-copy">
                <div className="detail-header-meta">
                  <p className="detail-kicker">{card.setName}</p>
                  <span className="detail-rarity-badge">{card.rarity}</span>
                </div>

                <h1>{card.name}</h1>

                <dl className="detail-facts">
                  <div>
                    <dt>Coleção</dt>
                    <dd>{card.setName}</dd>
                  </div>
                  <div>
                    <dt>Número na coleção</dt>
                    <dd>Nº {card.cardNumber}</dd>
                  </div>
                  <div>
                    <dt>Raridade</dt>
                    <dd>{card.rarity}</dd>
                  </div>
                  <div>
                    <dt>Código TCGdex</dt>
                    <dd>{card.tcgdexId}</dd>
                  </div>
                </dl>

                <div className="detail-note">
                  {user ? (
                    <div className="detail-seller-cta-row">
                      <span>
                        Sessão ativa como <strong>{user.name}</strong>. Possui um exemplar
                        físico desta carta para venda?
                      </span>
                      <button
                        type="button"
                        className="listing-open-btn"
                        onClick={() => setIsFormOpen((open) => !open)}
                      >
                        <Plus size={16} aria-hidden="true" />
                        <span>
                          {isFormOpen ? 'Fechar formulário' : 'Anunciar meu exemplar'}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <>
                      Visitantes podem consultar o catálogo e os anúncios públicos
                      livremente. Para anunciar um exemplar desta carta,{' '}
                      <Link className="auth-inline-link" href="/entrar">
                        entre na sua conta
                      </Link>{' '}
                      ou{' '}
                      <Link className="auth-inline-link" href="/cadastro">
                        crie um cadastro
                      </Link>
                      .
                    </>
                  )}
                </div>
              </div>
            </article>

            {actionMessage && (
              <div className="listing-feedback-banner" role="status">
                <span>{actionMessage}</span>
              </div>
            )}

            {user && isFormOpen && (
              <section
                className="listing-drawer-card"
                aria-labelledby="publish-listing-heading"
              >
                <div className="listing-drawer-header">
                  <div>
                    <h2 id="publish-listing-heading">
                      Anunciar exemplar a preço fixo — {card.name}
                    </h2>
                    <p>
                      Cada anúncio corresponde a 1 exemplar físico real associado a esta
                      carta do catálogo.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="listing-drawer-close"
                    onClick={() => setIsFormOpen(false)}
                    aria-label="Fechar formulário de anúncio"
                  >
                    <X size={18} />
                  </button>
                </div>

                {formError && (
                  <div className="auth-alert" role="alert">
                    {formError}
                  </div>
                )}

                <form className="listing-form" onSubmit={handlePublishListing}>
                  <div className="listing-form-grid">
                    <div className="auth-field">
                      <label htmlFor="listing-price">Preço fixo (R$)</label>
                      <input
                        id="listing-price"
                        className="auth-input"
                        type="text"
                        inputMode="decimal"
                        placeholder="Ex: 149,90"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        required
                      />
                      <p className="auth-field-hint">
                        Valor à vista sem regateio na modalidade Preço Fixo.
                      </p>
                    </div>

                    <div className="auth-field">
                      <label htmlFor="listing-language">Idioma do exemplar</label>
                      <input
                        id="listing-language"
                        className="auth-input"
                        type="text"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        required
                      />
                    </div>

                    <div className="auth-field">
                      <label htmlFor="listing-edition">Edição / Acabamento (opcional)</label>
                      <input
                        id="listing-edition"
                        className="auth-input"
                        type="text"
                        placeholder="Ex: Foil, Reverse Foil, Promo"
                        value={edition}
                        onChange={(e) => setEdition(e.target.value)}
                      />
                    </div>
                  </div>

                  <fieldset className="condition-fieldset">
                    <legend>Condição física padronizada do exemplar</legend>
                    <div className="condition-options-grid">
                      {(Object.keys(CardConditionLabels) as CardConditionType[]).map(
                        (condKey) => (
                          <label
                            key={condKey}
                            className={`condition-option-card ${
                              condition === condKey ? 'is-selected' : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name="condition"
                              value={condKey}
                              checked={condition === condKey}
                              onChange={() => setCondition(condKey)}
                            />
                            <span className="condition-option-title">
                              {CardConditionLabels[condKey]}
                            </span>
                            <span className="condition-option-desc">
                              {CONDITION_DESCRIPTIONS[condKey]}
                            </span>
                          </label>
                        )
                      )}
                    </div>
                  </fieldset>

                  <div className="auth-field">
                    <label htmlFor="listing-description">
                      Observações sobre o exemplar (opcional)
                    </label>
                    <textarea
                      id="listing-description"
                      className="auth-input listing-textarea"
                      rows={3}
                      maxLength={2000}
                      placeholder="Descreva centralização, estado das bordas, superfície ou detalhes relevantes…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="auth-field">
                    <label htmlFor="listing-photos-input">
                      Fotos reais do exemplar (1 a 5 fotos • JPEG, PNG ou WebP até 5 MB)
                    </label>
                    <div className="photo-upload-zone">
                      <label className="photo-upload-trigger" htmlFor="listing-photos-input">
                        <Camera size={18} aria-hidden="true" />
                        <span>
                          {isUploadingPhoto
                            ? 'Validando e assinando upload no S3…'
                            : 'Selecionar fotos do exemplar'}
                        </span>
                      </label>
                      <input
                        id="listing-photos-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        className="visually-hidden"
                        onChange={handleFileSelect}
                        disabled={
                          isUploadingPhoto || stagedPhotos.length >= MAX_LISTING_PHOTOS
                        }
                      />
                      <span className="photo-upload-counter">
                        {stagedPhotos.length} de {MAX_LISTING_PHOTOS} fotos anexadas
                      </span>
                    </div>

                    {stagedPhotos.length > 0 && (
                      <ul className="staged-photos-list">
                        {stagedPhotos.map((photo, index) => (
                          <li key={photo.s3Key} className="staged-photo-pill">
                            <ShieldCheck size={14} aria-hidden="true" />
                            <span className="staged-photo-name">
                              #{index + 1} {photo.fileName}
                            </span>
                            <span className="staged-photo-size">
                              ({Math.ceil(photo.sizeBytes / 1024)} KB • S3 privado)
                            </span>
                            <button
                              type="button"
                              onClick={() => removeStagedPhoto(photo.s3Key)}
                              aria-label={`Remover foto ${photo.fileName}`}
                            >
                              Remover
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="listing-form-actions">
                    <button
                      type="submit"
                      className="auth-submit-btn"
                      disabled={isSubmitting || isUploadingPhoto}
                    >
                      {isSubmitting ? 'Publicando anúncio…' : 'Publicar anúncio a preço fixo'}
                    </button>
                  </div>
                </form>
              </section>
            )}

            <section
              className="listings-showcase-section"
              aria-labelledby="available-listings-heading"
            >
              <div className="results-toolbar">
                <div className="results-summary">
                  <h2 id="available-listings-heading">Exemplares anunciados</h2>
                  <span className="results-count" aria-live="polite">
                    {isLoadingListings
                      ? 'Carregando…'
                      : `${listings.length} ${
                          listings.length === 1
                            ? 'exemplar disponível'
                            : 'exemplares disponíveis'
                        }`}
                  </span>
                </div>
              </div>

              {listings.length === 0 ? (
                <div className="catalog-message">
                  <h3>Nenhum exemplar anunciado no momento</h3>
                  <p>
                    Seja o primeiro colecionador a anunciar um exemplar físico de{' '}
                    <strong>{card.name}</strong> a preço fixo.
                  </p>
                </div>
              ) : (
                <div className="listings-list">
                  {listings.map((item) => {
                    const isSellerOwner = user?.id === item.sellerId;
                    return (
                      <article key={item.id} className="listing-row-card">
                        <div className="listing-row-main">
                          <div className="listing-row-badges">
                            <span
                              className={`condition-badge condition-${item.condition.toLowerCase()}`}
                            >
                              {CardConditionLabels[item.condition]}
                            </span>
                            <span className="listing-meta-pill">{item.language}</span>
                            {item.edition && (
                              <span className="listing-meta-pill">{item.edition}</span>
                            )}
                            <span className="listing-meta-pill">
                              {item.photos.length}{' '}
                              {item.photos.length === 1 ? 'foto real' : 'fotos reais'}
                            </span>
                          </div>

                          <p className="listing-row-seller">
                            Anunciado por <strong>{item.seller.name}</strong>
                          </p>

                          {item.description && (
                            <p className="listing-row-description">{item.description}</p>
                          )}
                        </div>

                        <div className="listing-row-aside">
                          <div className="listing-price-block">
                            <span className="listing-sale-mode">Preço fixo</span>
                            <strong className="listing-price-value">
                              {formatBrlFromCents(item.priceInCents)}
                            </strong>
                          </div>

                          <div className="listing-row-actions">
                            <Link
                              className="listing-view-link"
                              href={`/listings/${encodeURIComponent(item.id)}`}
                            >
                              Ver anúncio e fotos
                            </Link>

                            {isSellerOwner && item.status === 'DISPONIVEL' && (
                              <button
                                type="button"
                                className="listing-cancel-btn"
                                onClick={() => handleCancelListing(item.id)}
                              >
                                <Trash2 size={14} aria-hidden="true" />
                                <span>Cancelar anúncio</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        ) : (
          <div
            className="catalog-message"
            style={{ marginTop: '44px' }}
            role={error ? 'alert' : 'status'}
          >
            <h1>{error ? 'Carta não encontrada' : 'Carregando detalhes da carta…'}</h1>
            {error && <p>{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
