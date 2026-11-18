# 08: Concluir ou liberar negociação inativa

**What to build:** As partes conseguem concluir a negociação marcando o anúncio como vendido, e o sistema alerta e libera negociações que ficam inativas.

**Blocked by:** 07: Negociar por chat privado.

**Status:** ready-for-agent

- [ ] Após concluir pagamento e entrega externos, o vendedor consegue marcar o anúncio como `VENDIDO`.
- [ ] `VENDIDO` é final e remove o anúncio da loja.
- [ ] O vendedor consegue cancelar manualmente a negociação em `NEGOCIACAO_ABERTA`, retornando o anúncio imediatamente a `DISPONIVEL` sem aguardar o timeout de inatividade.
- [ ] Aos 25 dias sem mensagens no chat em `NEGOCIACAO_ABERTA`, ambas as partes recebem o alerta in-app definido no SPEC.
- [ ] Aos 30 dias sem novas mensagens no chat, se o vendedor não marcou como vendido, a negociação é cancelada e o anúncio retorna a `DISPONIVEL`. Qualquer mensagem enviada reinicia o contador.
- [ ] Um anúncio já `VENDIDO` não é reaberto por um job de timeout.
- [ ] Jobs são repetíveis sem gerar alertas duplicados ou transições inconsistentes; testes usam relógio controlado.
