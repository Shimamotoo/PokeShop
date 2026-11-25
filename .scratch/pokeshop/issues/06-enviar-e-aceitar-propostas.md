# 06: Enviar e aceitar propostas

**What to build:** Compradores conseguem fazer Propostas acima do Valor inicial, e o vendedor consegue aceitar ou recusar ofertas de um anúncio por propostas sem criar negociações concorrentes.

**Blocked by:** 04: Publicar anúncio por propostas; 05: Reservar e confirmar compra por preço fixo.

**Status:** resolved

- [x] Somente usuários autenticados conseguem enviar uma Proposta.
- [x] O sistema aceita apenas valores estritamente superiores ao Valor inicial.
- [x] O vendedor consegue aceitar ou recusar Propostas individualmente, sem contraproposta.
- [x] Aceitar uma Proposta move o anúncio para `NEGOCIACAO_ABERTA`, bloqueia novas Propostas e recusa automaticamente as demais pendentes.
- [x] Requisições concorrentes de aceite não conseguem iniciar mais de uma negociação para o mesmo Exemplar.
- [x] O sistema cria a negociação para o comprador escolhido; somente as partes veem seu estado.
- [x] Testes HTTP cobrem valores no limite, aceites concorrentes e recusa das demais Propostas.
