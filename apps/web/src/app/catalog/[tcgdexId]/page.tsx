'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { CatalogCard } from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';

export default function CatalogCardPage() {
  const { tcgdexId } = useParams<{ tcgdexId: string }>();
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
                Esta página exibe a ficha oficial da Carta de catálogo. Nos próximos módulos, os
                anúncios de exemplares físicos publicados por vendedores aparecerão vinculados a esta
                referência.
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
