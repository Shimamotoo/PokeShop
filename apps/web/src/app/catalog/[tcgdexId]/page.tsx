'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { CatalogCard } from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/features/auth/use-auth';

export default function CatalogCardPage() {
  const { tcgdexId } = useParams<{ tcgdexId: string }>();
  const { user } = useAuth();
  const [card, setCard] = useState<CatalogCard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiClient<CatalogCard>(`/catalog/cards/${encodeURIComponent(tcgdexId)}`, {
      signal: controller.signal,
    })
      .then(setCard)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'Carta não encontrada.');
        }
      });
    return () => controller.abort();
  }, [tcgdexId]);

  return (
    <div className="detail-shell">
      <header className="store-topbar">
        <div className="store-topbar-inner">
          <Link className="wordmark" href="/" aria-label="PokeShop, início">
            <span className="wordmark-mark" aria-hidden="true">P</span>
            <span>PokeShop</span>
          </Link>
          <div className="topbar-actions">
            <Link className="back-link" href="/">
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Voltar para a vitrine</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="catalog-shell">
        {card ? (
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

              <p className="detail-note">
                {user ? (
                  <>
                    Sessão ativa como <strong>{user.name}</strong>. Você está autenticado para
                    publicar anúncios, enviar propostas e comprar exemplares desta carta.
                  </>
                ) : (
                  <>
                    Visitantes podem consultar o catálogo livremente. Para publicar um anúncio,
                    enviar proposta ou comprar um exemplar desta carta,{' '}
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
              </p>
            </div>
          </article>
        ) : (
          <div className="catalog-message" style={{ marginTop: '44px' }} role={error ? 'alert' : 'status'}>
            <h1>{error ? 'Carta não encontrada' : 'Carregando detalhes da carta…'}</h1>
            {error && <p>{error}</p>}
          </div>
        )}
      </main>
    </div>
  );
}
