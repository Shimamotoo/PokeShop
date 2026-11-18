# 08: Concluir ou liberar negociação inativa

**What to build:** As partes conseguem concluir a negociação marcando o anúncio como vendido, e o sistema alerta e libera negociações que ficam inativas.

**Blocked by:** 07: Negociar por chat privado.

**Status:** ready-for-agent

- [ ] Após concluir pagamento e entrega externos, o vendedor consegue marcar o anúncio como `VENDIDO`.
- [ ] `VENDIDO` é final e remove o anúncio da loja.
- [ ] Aos 25 dias sem mensagens ou conclusão em `NEGOCIACAO_ABERTA`, ambas as partes recebem o alerta in-app definido no SPEC.
- [ ] Aos 30 dias sem atualizações, se o vendedor não marcou como vendido, a negociação é cancelada e o anúncio retorna a `DISPONIVEL`.
- [ ] Um anúncio já `VENDIDO` não é reaberto por um job de timeout.
- [ ] Jobs são repetíveis sem gerar alertas duplicados ou transições inconsistentes; testes usam relógio controlado.
