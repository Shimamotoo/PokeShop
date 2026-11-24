# 04: Publicar anúncio por propostas

**What to build:** Um vendedor pode publicar um Exemplar para receber Propostas acima de um Valor inicial, sem prazo fixo de encerramento.

**Blocked by:** 03: Publicar anúncio de preço fixo.

**Status:** resolved

- [x] O vendedor consegue criar e consultar um anúncio na modalidade por Propostas associado a um Exemplar e a uma Carta de catálogo.
- [x] O anúncio registra um Valor inicial mínimo.
- [x] Enquanto o anúncio estiver `DISPONIVEL`, ele continua recebendo Propostas sem prazo fixo até o vendedor aceitar uma proposta ou excluir o anúncio.
- [x] Visitantes conseguem consultar o anúncio público sem enviar Propostas.
- [x] O vendedor consegue excluir o anúncio `DISPONIVEL`, levando-o a `CANCELADO` e descartando propostas pendentes.
- [x] Testes pela API verificam criação, consulta e exclusão do anúncio.
