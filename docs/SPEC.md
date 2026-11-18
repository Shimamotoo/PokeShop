# SPEC — Pokémon TCG Platform

**Status:** Especificação de requisitos revisada e alinhada para implementação do MVP.

Este documento formaliza todos os requisitos funcionais, não funcionais e a máquina de estados aprovada para o desenvolvimento da plataforma.

---

## 1. Objetivo

Conectar colecionadores brasileiros de Pokémon TCG (com idade igual ou superior a 13 anos) para consultar catálogo de cartas em PT-BR sincronizado de fonte externa comunitária, anunciar exemplares físicos por preço fixo ou por propostas, interagir em uma rede social temática e utilizar um sistema de chat direto integrado (com polling) para alinhar frete, pagamento externo e detalhes de envio. O MVP não atua como intermediador financeiro nem organiza a logística diretamente.

---

## 2. Público e Plataformas

- Primeira entrega como aplicação web responsiva (desktop e mobile).
- Cadastro aberto para usuários a partir de **13 anos (+13)** com preenchimento obrigatório de data de nascimento e aceite dos Termos de Uso.
- **Política para Adolescentes (13 a 17 anos):** Os Termos de Uso exigem supervisão de responsáveis legais para negociações financeiras externas. Não haverá fluxo automatizado de KYC ou convite parental no MVP. Menores de 13 anos são proibidos de se cadastrar.

---

## 3. Requisitos Funcionais

### Acesso e Contas
- **FR-001:** Visitantes sem login podem navegar no catálogo, consultar anúncios e visualizar publicações e coleções públicas.
- **FR-002:** Login é obrigatório para publicar anúncios, enviar propostas, iniciar compras ou interagir socialmente (postar, curtir, comentar, seguir).
- **FR-003:** Métodos de autenticação suportados: e-mail/senha e Google.
- **FR-004:** O formulário de cadastro exige autodeclaração de nascimento confirmando idade mínima de 13 anos.

### Catálogo de Cartas
- **FR-010:** O catálogo cobre cartas de Pokémon TCG lançadas em português do Brasil (PT-BR).
- **FR-011:** Sincronização externa realizada a partir da API pública comunitária [TCGdex](https://tcgdex.net/) (fonte externa não-oficial), com cache e espelhamento local no PostgreSQL.
- **FR-012:** Campos mínimos armazenados no catálogo: nome da carta, coleção, número e raridade.
- **FR-013:** Todo anúncio deve estar obrigatoriamente associado a uma carta válida existente no catálogo local.

### Anúncios e Atributos do Exemplar
- **FR-020:** Cada anúncio corresponde a exatamente 1 (um) exemplar físico real.
- **FR-021:** O anúncio exige o upload de fotos reais do exemplar, descrição/observações livres, idioma, edição e seleção obrigatória de uma condição física padronizada:
  - *Novo / Perfeito estado:* Sem marcas de dobra, sem desgaste nas bordas (*whitening*) e sem riscos na superfície; estado direto do booster (*Mint/Near Mint*).
  - *Pouco usada / Ótimo estado:* Levíssimo desgaste quase imperceptível nas bordas ou cantos (*Lightly Played/Excellent*).
  - *Marcas de uso / Bom estado:* Desgaste visível de manuseio ou jogo, mas sem danos estruturais graves (*Played/Good*).
  - *Danificada:* Dobras, vincos, manchas, marcas de umidade ou rasgos (*Damaged/Poor*).
- **FR-022:** A plataforma oferece duas modalidades de venda, ambas sem regateio de valores no fluxo de compra: **Preço Fixo** e **Propostas**.
- **FR-023:** Se o vendedor excluir o anúncio enquanto estiver `DISPONIVEL`, o anúncio passa para o estado `CANCELADO` e todas as propostas pendentes são automaticamente descartadas.

### Ciclo de Vida da Negociação e Máquina de Estados

O exemplar transita pelos estados: `DISPONIVEL` $\rightarrow$ `AGUARDANDO_CONFIRMACAO` (Preço Fixo) $\rightarrow$ `NEGOCIACAO_ABERTA` $\rightarrow$ `VENDIDO` (ou retorno para `DISPONIVEL` em caso de recusa/timeout).

#### Fluxo por Preço Fixo
- **FR-030:** O comprador clica em comprar por preço fixo $\rightarrow$ o exemplar transita de `DISPONIVEL` para `AGUARDANDO_CONFIRMACAO`, ficando bloqueado para outros compradores.
- **FR-031:** Se o vendedor recusar a disponibilidade, o exemplar transita de volta para `DISPONIVEL` na loja.
- **FR-032:** Se o vendedor confirmar a disponibilidade, o exemplar transita para `NEGOCIACAO_ABERTA` e o Chat da Negociação é liberado entre as partes.
- **FR-033 (Timeout de Confirmação):** Se o vendedor não responder no prazo de **30 dias (1 mês)**, a solicitação de compra expira automaticamente e o exemplar volta para `DISPONIVEL` na loja (o anúncio não é apagado).

#### Fluxo por Propostas
- **FR-040:** O anúncio permanece em `DISPONIVEL` recebendo propostas enquanto estiver publicado no site, sem prazo fixo de encerramento.
- **FR-041:** O vendedor define um valor inicial mínimo; propostas submetidas devem ser estritamente superiores a esse valor.
- **FR-042:** O vendedor pode aceitar ou recusar propostas individualmente, sem contraproposta.
- **FR-043:** Ao aceitar uma proposta:
  - O exemplar transita para `NEGOCIACAO_ABERTA`;
  - Novas propostas para o anúncio são bloqueadas;
  - As demais propostas pendentes são marcadas como recusadas pelo sistema;
  - O Chat da Negociação é liberado entre o vendedor e o proponente selecionado.

#### Chat da Negociação, Timeouts e Conclusão
- **FR-050:** Ao entrar em `NEGOCIACAO_ABERTA`, o sistema disponibiliza uma sala de chat direto e privado exclusiva entre comprador e vendedor.
- **FR-051:** As partes utilizam o chat para alinhar frete, método de envio e detalhes de pagamento externo.
- **FR-052:** A atualização de mensagens no chat ocorre via **polling HTTP básico** no frontend (a cada 3 a 5 segundos).
- **FR-053:** A plataforma exibe **notificações in-app** (badges visuais de mensagens não lidas e alertas de alteração de estado no cabeçalho).
- **FR-054 (Alerta de Inatividade aos 25 dias):** Se a negociação estiver aberta e completar 25 dias sem novas mensagens ou conclusão, o sistema emite um alerta in-app para ambas as partes: *"Sua negociação expira em 5 dias. Caso já tenha finalizado, marque o item como vendido"*.
- **FR-055 (Timeout de Inatividade da Negociação aos 30 dias):** Se a negociação completar **30 dias sem atualizações** e o vendedor não tiver marcado como vendido, o sistema cancela a negociação automaticamente e o exemplar transita de volta para `DISPONIVEL` na loja.
- **FR-056:** Após concluir o pagamento e a entrega externa, o vendedor clica em **"Marcar como Vendido"**, transicionando o exemplar definitivamente para `VENDIDO`.

### Rede Social
- **FR-060:** Usuários autenticados podem publicar posts, curtir, comentar, seguir outros colecionadores e compartilhar posts via link externo.
- **FR-061:** Publicações podem conter links diretos exclusivamente para anúncios internos da plataforma.
- **FR-062:** Usuários podem gerenciar coleções de cartas que possuem e cartas desejadas (*wishlist*).
- **FR-063:** Feed principal cronológico baseado em perfis seguidos.
- **FR-064:** Visibilidade configurável (pública ou privada) para o perfil, coleções e publicações individuais.

### Denúncias e Moderação
- **FR-070:** Usuários podem denunciar publicações, anúncios, mensagens de chat e perfis.
- **FR-071:** Denúncias são enviadas para fila manual de moderação.
- **FR-072:** A sanção definida no MVP é o **banimento definitivo imediato** da conta após confirmação de infração grave pelo moderador.
- **FR-073:** O responsável pelo produto atua como moderador inicial.

---

## 4. Requisitos Não Funcionais, Segurança e Privacidade

- **Consistência e Transações ACID:** Transições de estado do exemplar (`DISPONIVEL` $\rightarrow$ `AGUARDANDO_CONFIRMACAO` $\rightarrow$ `NEGOCIACAO_ABERTA` $\rightarrow$ `VENDIDO`) devem ser executadas em transações atômicas no PostgreSQL, impedindo reservas duplicadas.
- **Privacidade de Mídia (S3):** O bucket AWS S3 deve ser **privado por padrão**. Nenhuma URL pública direta deve ser exposta. O acesso às fotos de anúncios públicos ou mídias de posts/perfis privados é controlado pelo backend por meio de **URLs pré-assinadas (Presigned URLs) com tempo de expiração curto (TTL)**, validadas contra as permissões do usuário solicitante.
- **Autorização do Chat:** Apenas as duas partes da transação e o moderador (em caso de denúncia) têm autorização para ler ou enviar mensagens na respectiva sala de chat.
- **Jobs Agendados:** Rotinas agendadas (cron diário) para envio do alerta de 25 dias e execução do timeout de 30 dias de inatividade.

---

## 5. Fora de Escopo no MVP

- Processamento de pagamentos interno, custódia (*escrow*) ou cálculo automático de frete.
- Resolução de disputas financeiras ou logísticas externas.
- Leilões em tempo real com cronômetro regressivo segundo a segundo.
- Conexões persistentes via WebSockets ou push notifications mobile.
- Notificações por e-mail no MVP (planejadas para a fase seguinte).
- Verificação automatizada de documentos de identidade (KYC) ou fluxo automatizado de autorização parental.
- Aplicativos nativos iOS e Android.

---

## 6. Cenários de Aceitação Prioritários

- **Cenário 1 — Preço Fixo com Aceite e Venda Concluída:**
  - Anúncio em `DISPONIVEL`. Comprador clica em comprar $\rightarrow$ status muda para `AGUARDANDO_CONFIRMACAO`.
  - Vendedor confirma disponibilidade $\rightarrow$ status muda para `NEGOCIACAO_ABERTA` e o Chat da Negociação é liberado.
  - Vendedor e comprador combinam entrega no chat $\rightarrow$ vendedor clica em "Marcar como Vendido" $\rightarrow$ status muda para `VENDIDO`.
- **Cenário 2 — Preço Fixo com Timeout de 30 dias:**
  - Anúncio entra em `AGUARDANDO_CONFIRMACAO`.
  - Vendedor não responde por 30 dias $\rightarrow$ job de sistema cancela a solicitação e o exemplar retorna para `DISPONIVEL`.
- **Cenário 3 — Anúncio por Propostas e Exclusão:**
  - Anúncio recebe 2 propostas enquanto está `DISPONIVEL`.
  - Vendedor decide excluir o anúncio $\rightarrow$ anúncio passa para `CANCELADO` e as 2 propostas pendentes são marcadas como descartadas.
- **Cenário 4 — Inatividade no Chat (25 dias e 30 dias):**
  - Exemplar em `NEGOCIACAO_ABERTA`. Passam-se 25 dias sem novas mensagens $\rightarrow$ sistema envia notificação in-app de aviso prévio.
  - Chega aos 30 dias sem conclusão $\rightarrow$ sistema cancela a negociação e o exemplar volta para `DISPONIVEL`.
- **Cenário 5 — Privacidade de Imagens no S3:**
  - Usuário posta imagem em uma coleção configurada como `Privada`.
  - Visitante não autorizado tenta acessar o recurso $\rightarrow$ backend recusa a geração da Presigned URL, impedindo o acesso à foto no S3.
