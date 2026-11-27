const TCGDEX_API_URL = 'https://api.tcgdex.net/v2/pt';

type FetchLike = typeof fetch;

export type TcgdexClient = {
  listCards(setId?: string): Promise<unknown[]>;
  getCard(id: string): Promise<unknown>;
};

export function createTcgdexClient(fetchImpl: FetchLike = fetch): TcgdexClient {
  async function request(path: string): Promise<unknown> {
    const response = await fetchImpl(`${TCGDEX_API_URL}${path}`);

    if (!response.ok) {
      throw new Error(`TCGdex respondeu com status ${response.status}.`);
    }

    return response.json();
  }

  return {
    async listCards(setId?: string) {
      if (setId) {
        const set = await request(`/sets/${encodeURIComponent(setId)}`);
        if (typeof set !== 'object' || set === null || !Array.isArray((set as { cards?: unknown }).cards)) {
          throw new Error(`TCGdex retornou uma expansão inválida para "${setId}".`);
        }
        return (set as { cards: unknown[] }).cards;
      }

      const cards = await request('/cards');
      if (!Array.isArray(cards)) {
        throw new Error('TCGdex retornou uma lista de cartas inválida.');
      }
      return cards;
    },
    getCard(id) {
      return request(`/cards/${encodeURIComponent(id)}`);
    },
  };
}
