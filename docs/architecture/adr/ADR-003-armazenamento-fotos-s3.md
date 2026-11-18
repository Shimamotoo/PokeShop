# ADR-003: Armazenamento e Privacidade de Fotos no AWS S3 com Presigned URLs

## Status
Aprovado

## Contexto
Cada anúncio exige o upload de fotos reais do exemplar físico, e usuários podem postar imagens em posts sociais ou coleções com visibilidade restrita (público ou privado). O armazenamento local em disco do servidor não é escalável, e a exposição de URLs públicas estáticas no S3 violaria a privacidade de fotos pertencentes a conteúdos privados.

## Decisão
1. **Armazenamento:** Utilizar **AWS S3** com o bucket configurado como **100% privado por padrão** (bloqueio total de acesso público).
2. **Upload:** O frontend solicita ao backend uma **Presigned PUT URL**, permitindo upload direto para o S3 com validação de tipo de arquivo (JPEG/PNG/WebP) e tamanho máximo (até 5MB).
3. **Download e Visualização Segura:** O backend gera **Presigned GET URLs com TTL curto (ex: 15 minutos)** apenas para usuários que possuam autorização para visualizar aquele conteúdo específico (validando se o post/coleção é público ou se pertence ao próprio usuário).
4. **Estimativa de Custos:** Utilizar os limites do Free Tier da AWS (5GB de armazenamento e 20.000 requisições GET/mês) como estimativa inicial de baixo custo para o MVP, estabelecendo monitoramento de cotas e alertas de faturamento na AWS.

## Consequências
- **Positivas:** Privacidade dos arquivos garantida no nível da infraestrutura (bucket totalmente privado); redução drástica do risco de exposição indevida por meio de URLs temporárias com TTL curto; ausência de URLs públicas estáticas; upload direto sem sobrecarregar o servidor Fastify; custos controlados no início.
- **Negativas:** Exige que o backend assine URLs temporárias ao retornar listas de mídias para o frontend.
