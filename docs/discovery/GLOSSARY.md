# Glossário — Pokémon TCG Platform

**Status:** Linguagem de domínio e máquina de estados aprovadas para o MVP.

| Termo | Significado neste projeto | Estado |
| --- | --- | --- |
| Carta de catálogo | Registro padronizado de uma carta de Pokémon TCG sincronizado de fonte externa comunitária (TCGdex). Não representa um exemplar físico específico. | Confirmado |
| Exemplar | Carta física real que pertence ao vendedor e é anunciada na plataforma. | Confirmado: um exemplar por anúncio |
| Anúncio | Oferta pública de um exemplar físico, por preço fixo ou por propostas. | Confirmado |
| Condição do exemplar | Escala padronizada do estado físico da carta: *Novo / Perfeito estado* (sem dobras, riscos ou desgaste de borda), *Pouco usada / Ótimo estado* (leves marcas quase imperceptíveis), *Marcas de uso / Bom estado* (desgaste visível de uso sem danos estruturais) e *Danificada* (vincos, rasgos, manchas ou amassados). | Confirmado |
| Proposta | Oferta de valor monetário submetida por um comprador em um anúncio por propostas. | Confirmado |
| Valor inicial | Preço de partida mínimo definido pelo vendedor no anúncio por propostas. | Confirmado |
| Chat da negociação | Sala privada de mensagens diretas entre comprador e vendedor para combinar frete e pagamento externo. Funciona com polling básico no MVP. | Confirmado |
| Notificação in-app | Alertas visuais e badges de mensagens não lidas e alertas de status diretamente na interface do site. | Confirmado |
| Coleção | Conjunto organizado de cartas do usuário (cartas que possui ou cartas que deseja/wishlist). | Confirmado |
| Feed | Linha do tempo social cronológica de perfis seguidos. | Confirmado |
| Idade mínima (+13) | Requisito de acesso à plataforma por autodeclaração de nascimento e termos de uso. | Confirmado |
| Catálogo PT-BR | Recorte inicial do catálogo focado nas coleções de Pokémon TCG em português. | Confirmado |

---

### Máquina de Estados do Anúncio / Exemplar

| Estado | Descrição | Transições Possíveis |
| :--- | :--- | :--- |
| `DISPONIVEL` | Anúncio ativo na loja, visível e apto a receber cliques de compra ou propostas. | $\rightarrow$ `AGUARDANDO_CONFIRMACAO`<br>$\rightarrow$ `NEGOCIACAO_ABERTA`<br>$\rightarrow$ `CANCELADO` (se vendedor excluir) |
| `AGUARDANDO_CONFIRMACAO` | Comprador iniciou compra por preço fixo. Exemplar fica travado temporariamente aguardando aceite ou recusa do vendedor. | $\rightarrow$ `NEGOCIACAO_ABERTA` (se vendedor aceitar)<br>$\rightarrow$ `DISPONIVEL` (se vendedor recusar ou inatividade de 30 dias) |
| `NEGOCIACAO_ABERTA` | Vendedor aceitou o preço fixo ou aceitou uma proposta. Exemplar fica bloqueado, chat privado é liberado para alinhamento de frete/pagamento externo. | $\rightarrow$ `VENDIDO` (vendedor confirma conclusão)<br>$\rightarrow$ `DISPONIVEL` (se houver inatividade de 30 dias sem conclusão) |
| `VENDIDO` | Negociação externa concluída com sucesso e atestada pelo vendedor. Anúncio é encerrado definitivamente e retirado da loja. | Estado Final |
| `CANCELADO` | Anúncio removido pelo vendedor antes da venda. Todas as propostas pendentes são descartadas. | Estado Final |
