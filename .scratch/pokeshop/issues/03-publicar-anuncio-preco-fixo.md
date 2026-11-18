# 03: Publicar anúncio de preço fixo

**What to build:** Um vendedor autenticado pode anunciar um Exemplar de uma Carta de catálogo pelo preço fixo, e visitantes podem consultar o anúncio público e suas fotos.

**Blocked by:** 01: Navegar o catálogo PT-BR; 02: Criar conta e entrar.

**Status:** ready-for-agent

- [ ] O vendedor publica exatamente um Exemplar associado a uma Carta de catálogo.
- [ ] O anúncio registra preço, idioma, edição, uma Condição do exemplar padronizada, observações e fotos reais.
- [ ] O anúncio publicado fica visível para visitantes sem login.
- [ ] Fotos são armazenadas em bucket privado S3; o backend só emite URL pré-assinada após validar acesso e visibilidade.
- [ ] Os formatos JPEG, PNG e WebP e o limite de 5 MB por foto são respeitados.
- [ ] O vendedor consegue excluir o anúncio enquanto ele está `DISPONIVEL`; ele passa a `CANCELADO`.
- [ ] Testes de API usam banco de teste e substituto do assinador/armazenamento S3, incluindo acesso público permitido e acesso privado negado.
