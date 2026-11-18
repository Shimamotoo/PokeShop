# 13: Denunciar conteúdo e moderar contas

**What to build:** Usuários podem denunciar perfis, posts, anúncios e mensagens, e o moderador consegue revisar relatos e banir permanentemente contas após confirmar uma infração grave.

**Blocked by:** 03: Publicar anúncio de preço fixo; 07: Negociar por chat privado; 09: Publicar posts com visibilidade e links de anúncios.

**Status:** ready-for-agent

- [ ] Usuários autenticados conseguem denunciar perfis, posts, anúncios e mensagens de chat.
- [ ] Denúncias entram numa fila manual acessível ao moderador inicial.
- [ ] O moderador consegue consultar o conteúdo denunciado, incluindo a mensagem reportada, sem conceder acesso geral a conversas privadas.
- [ ] Após confirmar uma infração grave, o moderador consegue aplicar banimento definitivo e revogar o acesso da conta.
- [ ] Uma denúncia não causa banimento automático sem revisão.
- [ ] Testes HTTP verificam criação de denúncias, autorização do moderador e revogação de acesso.
