# 05: Reservar e confirmar compra por preço fixo

**What to build:** Um comprador pode iniciar a compra de um anúncio por preço fixo, e o vendedor pode confirmar disponibilidade ou recusar, com bloqueio consistente de um Exemplar único.

**Blocked by:** 03: Publicar anúncio de preço fixo.

**Status:** resolved

- [x] Um comprador autenticado inicia a compra e o anúncio transita de `DISPONIVEL` para `AGUARDANDO_CONFIRMACAO`.
- [x] Enquanto aguarda resposta, o Exemplar fica bloqueado para outros compradores e para novas Propostas incompatíveis.
- [x] O vendedor consegue confirmar disponibilidade, levando o anúncio a `NEGOCIACAO_ABERTA`, ou recusar, retornando-o a `DISPONIVEL`.
- [x] Se o vendedor não responder em 30 dias, a solicitação expira e o anúncio retorna a `DISPONIVEL` sem ser apagado.
- [x] O comprador não consegue cancelar depois de iniciar a reserva.
- [x] Requisições concorrentes não conseguem reservar o mesmo Exemplar; a regra é verificada por testes HTTP concorrentes contra banco de teste.
- [x] Testes com relógio controlado verificam o timeout e a liberação do Exemplar.
