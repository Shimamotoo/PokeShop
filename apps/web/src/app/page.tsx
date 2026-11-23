'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { CatalogSearchResponse } from '@pokeshop/shared';
import { apiClient } from '@/lib/api-client';

const SKELETON_SLOTS = Array.from({ length: 12 }, (_, index) => index);

export default function CatalogPage() {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<CatalogSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: '24' });
    if (submittedQuery) params.set('q', submittedQuery);

    setIsLoading(true);
    setError(null);
    apiClient<CatalogSearchResponse>(`/catalog/cards?${params}`, {
      signal: controller.signal,
    })
      .then(setResults)
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar o catálogo.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page, submittedQuery]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  function clearSearch() {
    setQuery('');
    if (submittedQuery) {
      setSubmittedQuery('');
      setPage(1);
    }
  }

  return (
    <>
      <header className="store-topbar">
        <div className="store-topbar-inner">
          <Link className="wordmark" href="/" aria-label="PokeShop, início">
            <span className="wordmark-mark" aria-hidden="true">P</span>
            <span>PokeShop</span>
          </Link>

          <form className="catalog-search" onSubmit={handleSearch} role="search">
            <Search aria-hidden="true" size={18} />
            <label className="visually-hidden" htmlFor="catalog-search-input">
              Buscar por carta, coleção ou número
            </label>
            <input
              id="catalog-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar carta, coleção ou número…"
              autoComplete="off"
            />
            {(query || submittedQuery) && (
              <button className="clear-search" type="button" onClick={clearSearch}>
                Limpar
              </button>
            )}
            <button className="search-submit" type="submit">
              Buscar
            </button>
          </form>

          <div className="topbar-actions">
            <a className="source-link" href="https://tcgdex.net" target="_blank" rel="noreferrer">
              Fonte TCGdex
            </a>
          </div>
        </div>
      </header>

      <main className="catalog-shell">
        <section className="hero-section" aria-labelledby="catalog-title">
          <div className="hero-copy">
            <p className="hero-eyebrow">POKÉMON TCG • CATÁLOGO</p>
            <h1 id="catalog-title">
              Explore o universo <span className="hero-accent">Pokémon TCG.</span>
            </h1>
            <p className="hero-lead">
              Descubra cartas, explore coleções e conheça os detalhes de cada edição. Tudo o que
              você precisa para encontrar suas próximas cartas favoritas.
            </p>
            <div className="hero-actions">
              <a className="hero-cta" href="#catalog-grid">
                Explorar cartas <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </section>

        <section id="catalog-grid" className="catalog-content" aria-label="Cartas do catálogo">
          <div className="results-toolbar">
            <div className="results-summary">
              <h2>
                {submittedQuery ? `Resultados para "${submittedQuery}"` : 'Todas as cartas'}
              </h2>
              <span className="results-count" aria-live="polite">
                {isLoading
                  ? 'Carregando…'
                  : `${results?.total ?? 0} ${results?.total === 1 ? 'item' : 'itens'}`}
              </span>
            </div>
            <div className="sort-label">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span>Ordenadas por coleção e número</span>
            </div>
          </div>

          {error ? (
            <div className="catalog-message catalog-error" role="alert">
              <h3>Não foi possível carregar o catálogo</h3>
              <p>{error} Verifique se a API está ativa e tente novamente.</p>
            </div>
          ) : isLoading && !results ? (
            <div className="card-grid" aria-busy="true" aria-label="Carregando cartas do catálogo">
              {SKELETON_SLOTS.map((slot) => (
                <div className="catalog-card skeleton-card" key={slot} aria-hidden="true">
                  <span className="card-art" />
                  <span className="skeleton-line skeleton-line-title" />
                  <span className="skeleton-line skeleton-line-sub" />
                </div>
              ))}
            </div>
          ) : results?.items.length ? (
            <>
              <div className="card-grid" aria-busy={isLoading}>
                {results.items.map((card) => (
                  <Link
                    className="catalog-card"
                    href={`/catalog/${encodeURIComponent(card.tcgdexId)}`}
                    key={card.id}
                  >
                    <span className="card-art">
                      {card.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`${card.imageUrl}/high.png`} alt="" loading="lazy" />
                      ) : (
                        <span className="image-placeholder">Sem imagem</span>
                      )}
                    </span>
                    <span className="card-body">
                      <span className="card-name">{card.name}</span>
                      <span className="card-set">{card.setName}</span>
                      <span className="card-meta">
                        <span>Nº {card.cardNumber}</span>
                        <span className="rarity-mark">
                          <i aria-hidden="true" />
                          {card.rarity}
                        </span>
                      </span>
                    </span>
                  </Link>
                ))}
              </div>

              <div className="pagination" aria-label="Paginação do catálogo">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  Anterior
                </button>
                <span>
                  Página {page} de {results.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={page >= results.totalPages || isLoading}
                >
                  Próxima
                </button>
              </div>
            </>
          ) : (
            <div className="catalog-message">
              <h3>
                {submittedQuery ? 'Nenhuma carta encontrada' : 'Catálogo ainda não sincronizado'}
              </h3>
              <p>
                {submittedQuery
                  ? 'Tente buscar por outro nome, coleção ou número de carta.'
                  : 'Execute o seed do catálogo para importar as cartas em português da TCGdex.'}
              </p>
            </div>
          )}
        </section>

        <footer className="site-footer">
          <span>Made with ❤️ by Shiimamoto</span>
        </footer>
      </main>
    </>
  );
}
