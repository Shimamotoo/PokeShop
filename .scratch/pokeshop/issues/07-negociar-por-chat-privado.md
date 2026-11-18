# 07: Negociar por chat privado

**What to build:** Quando uma compra entra em `NEGOCIACAO_ABERTA`, comprador e vendedor conseguem trocar mensagens numa sala privada, com atualização por polling e indicadores in-app.

**Blocked by:** 05: Reservar e confirmar compra por preço fixo; 06: Enviar e aceitar propostas.

**Status:** ready-for-agent

- [ ] Uma sala de Chat da negociação é disponibilizada após confirmação por preço fixo ou aceite de Proposta.
- [ ] Apenas comprador e vendedor envolvidos conseguem ler e enviar mensagens nessa sala; acesso de moderação é tratado junto ao fluxo de denúncias.
- [ ] Mensagens novas aparecem por polling HTTP a cada 3–5 segundos enquanto a sala está aberta.
- [ ] Badges in-app indicam mensagens não lidas e atualizações de estado; o polling de indicadores pode ocorrer com periodicidade menor que o polling do chat.
- [ ] Testes HTTP verificam envio, leitura, isolamento entre negociações e bloqueio de usuários não participantes.
