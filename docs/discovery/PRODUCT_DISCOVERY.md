# Descoberta do produto — PokeShop

**Status:** Descoberta de produto revisada e alinhada com a equipe.

Este documento consolida as regras de negócio, limites e definições aprovadas pelo responsável pelo produto após o ciclo de perguntas, respostas e revisão de consistência.

## Visão do produto

Plataforma voltada à comunidade brasileira de Pokémon TCG que reúne catálogo de cartas em PT-BR sincronizado de fonte comunitária, marketplace de cartas físicas únicas e recursos de rede social com chat direto integrado para alinhamento de frete, pagamento externo e entrega.

## Escopo fechado do MVP

### Catálogo e anúncios

- **Catálogo PT-BR:** Espelho local de cartas em português sincronizado com a API comunitária aberta [TCGdex](https://tcgdex.net/) (fonte externa não-oficial).
- **Campos mínimos:** Nome da carta, coleção, número e raridade.
- **Anúncios atrelados:** Cada anúncio representa 1 exemplar físico real e deve estar associado a uma carta oficial do catálogo local.
- **Atributos do exemplar:** Fotos reais enviadas pelo usuário, observações, idioma, edição e seleção obrigatória de uma das 4 condições padronizadas:
  1. *Novo / Perfeito estado:* Sem marcas de dobra, sem desgaste nas bordas (*whitening*) e sem riscos; direto do booster (*Mint/Near Mint*).
  2. *Pouco usada / Ótimo estado:* Desgaste levíssimo quase imperceptível (*Lightly Played/Excellent*).
  3. *Marcas de uso / Bom estado:* Desgaste visível de manuseio ou jogo, sem danos estruturais graves (*Played/Good*).
  4. *Danificada:* Dobras, vincos, manchas ou rasgos (*Damaged/Poor*).

### Ciclo de vida da venda e estados

O exemplar físico segue uma máquina de estados estrita:
- `DISPONIVEL`: Aberto na loja para propostas ou compras por preço fixo.
- `AGUARDANDO_CONFIRMACAO`: Comprador clicou em comprar (preço fixo), bloqueando o item por até 30 dias enquanto o vendedor responde.
- `NEGOCIACAO_ABERTA`: Vendedor confirmou preço fixo ou aceitou uma proposta. O item fica reservado e o chat direto é liberado para alinhamento de pagamento externo e frete. Não é chamado de "vendido" até a entrega.
- `VENDIDO`: Estado final definitivo após o vendedor marcar o item como entregue/recebido.
- `CANCELADO`: Estado final do anúncio quando o vendedor o remove ou exclui da plataforma enquanto disponível (descartando propostas pendentes). Recusa pelo vendedor ou timeouts de inatividade retornam o exemplar diretamente para `DISPONIVEL` (cancelando apenas a solicitação de compra ou a negociação em andamento).

### Formatos de venda

- **Sem regateio nos checkouts:** Valores fixos ou aceites diretos de propostas.
- **Modalidade 1 — Preço Fixo:**
  - Comprador clica em comprar $\rightarrow$ exemplar entra em `AGUARDANDO_CONFIRMACAO`.
  - Vendedor aceita $\rightarrow$ transita para `NEGOCIACAO_ABERTA` $\rightarrow$ abre Chat da Negociação.
  - Vendedor recusa $\rightarrow$ exemplar é destravado e volta imediatamente para `DISPONIVEL`.
  - **Timeout de 30 dias:** Se o vendedor não interagir com a solicitação em 30 dias, a solicitação expira e o exemplar volta para `DISPONIVEL` na loja (o anúncio não é apagado).
- **Modalidade 2 — Anúncio por Propostas:**
  - Vendedor define um valor inicial mínimo.
  - **Duração do anúncio:** Fica em `DISPONIVEL` por tempo indeterminado enquanto o anúncio estiver no ar. O anúncio só encerra o recebimento de propostas se o vendedor aceitar uma proposta ou excluir o anúncio (o que descarta as propostas pendentes).
  - Vendedor pode aceitar ou recusar ofertas.
  - Ao aceitar uma proposta, o item vai para `NEGOCIACAO_ABERTA`, as demais propostas são recusadas e abre-se o chat com o proponente vencedor.

### Chat, Notificações e Prazos

- **Chat Direto:** Criado automaticamente quando o item entra em `NEGOCIACAO_ABERTA`.
- **Alinhamento prático:** As partes combinam método de pagamento externo e frete/entrega.
- **Aviso prévio aos 25 dias:** Se a negociação no chat completar 25 dias sem novas mensagens ou conclusão, o sistema emite um alerta in-app avisando que a negociação expirará em 5 dias.
- **Timeout de 30 dias:** Se a negociação completar 30 dias sem conclusão, o sistema cancela a negociação automaticamente e o item retorna para `DISPONIVEL` na loja.
- **Conclusão:** O vendedor clica em "Marcar como Vendido" ao finalizar o envio/recebimento externo, encerrando o anúncio definitivamente como `VENDIDO`.
- **Notificações no MVP:** Indicadores visuais e badges dentro do próprio site (**in-app**) sinalizando novas mensagens no chat e mudanças de status.

### Acesso, Usuários e Moderação

- **Público e Idade:** Acesso permitido para usuários a partir de **13 anos (+13)** com autodeclaração de nascimento e aceite dos Termos de Uso (estipulando supervisão parental para menores de 18 anos). Sem fluxo de KYC no MVP.
- **Consulta pública:** Visitantes sem login podem navegar no catálogo, ver anúncios e visualizar posts públicos.
- **Login obrigatório:** Exigido para interações sociais, publicação de anúncios, propostas e compras (E-mail/senha e Google).
- **Moderação:** Usuários podem denunciar posts, anúncios, mensagens de chat e perfis.
- **Sanção no MVP:** **Banimento definitivo imediato** após análise e confirmação da denúncia pelo moderador.

## Decisões Técnicas Principais

- **Arquitetura:** Monólito Modular com TypeScript Fullstack.
- **Frontend:** Next.js (React).
- **Backend:** Node.js com **Fastify** (definido para alta performance e suporte a schemas).
- **Banco de Dados:** **PostgreSQL** com **Prisma ORM** (garantia de transações ACID atômicas).
- **Estratégia de Chat:** **Polling HTTP básico** (a cada 3 a 5 segundos no frontend).
- **Armazenamento de Imagens e Privacidade:** **AWS S3** privado por padrão. Entrega de imagens controlada pelo backend via **Presigned URLs com TTL curto**, validando permissões de privacidade para posts/perfis privados.
- **Estimativa de Custos S3:** Utilização inicial dos limites do Free Tier da AWS como estimativa de baixo custo inicial, sujeita a monitoramento de tráfego e cotas operacionais.
