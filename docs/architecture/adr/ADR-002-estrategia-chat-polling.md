# ADR-002: Estratégia de Chat via Polling Básico

## Status
Aprovado

## Contexto
O MVP necessita de um chat direto e privado entre comprador e vendedor após a confirmação da compra para combinar frete e entrega. A implementação de WebSockets bidirecionais exigiria gerenciamento de conexões persistentes, sticky sessions ou brokers como Redis.

## Decisão
Adotar **Polling HTTP básico** no frontend:
- Quando o usuário estiver com a tela de chat aberta, o cliente consulta o backend a cada intervalo regular (ex: 3 a 5 segundos) buscando novas mensagens.
- Notificações in-app (badges no cabeçalho) consultam o endpoint de mensagens não lidas com periodicidade mais espaçada (ex: a cada 30 segundos).

## Consequências
- **Positivas:** Zero infraestrutura extra (sem WebSockets, sem Redis); implementação rápida e simples sobre rotas REST comuns; fácil manutenção e depuração.
- **Negativas:** Pequena latência na percepção da mensagem (alguns segundos) e requisições HTTP adicionais enquanto o chat estiver aberto, o que é perfeitamente tolerável para o volume do MVP.
