# 06: Enviar e aceitar propostas

**What to build:** Compradores conseguem fazer Propostas acima do Valor inicial, e o vendedor consegue aceitar ou recusar ofertas de um anúncio por propostas sem criar negociações concorrentes.

**Blocked by:** 04: Publicar anúncio por propostas; 05: Reservar e confirmar compra por preço fixo.

**Status:** ready-for-agent

- [ ] Somente usuários autenticados conseguem enviar uma Proposta.
- [ ] O sistema aceita apenas valores estritamente superiores ao Valor inicial.
- [ ] O vendedor consegue aceitar ou recusar Propostas individualmente, sem contraproposta.
- [ ] Aceitar uma Proposta move o anúncio para `NEGOCIACAO_ABERTA`, bloqueia novas Propostas e recusa automaticamente as demais pendentes.
- [ ] Requisições concorrentes de aceite não conseguem iniciar mais de uma negociação para o mesmo Exemplar.
- [ ] O sistema cria a negociação para o comprador escolhido; somente as partes veem seu estado.
- [ ] Testes HTTP cobrem valores no limite, aceites concorrentes e recusa das demais Propostas.
