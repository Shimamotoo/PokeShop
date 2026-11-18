# PokeShop

Uma plataforma web para colecionadores de Pokémon TCG no Brasil, combinando catálogo de cartas, marketplace e recursos sociais.

> **Projeto de portfólio e aprendizado.** O objetivo é praticar concepção, documentação e desenvolvimento de software com foco em domínio, segurança e simplicidade arquitetural. O projeto está atualmente na fase de planejamento; a implementação ainda não começou.

## Escopo planejado do MVP

- Catálogo local de cartas em PT-BR sincronizado com a API comunitária não oficial TCGdex.
- Anúncios de exemplares físicos por preço fixo ou propostas.
- Reservas e negociação entre comprador e vendedor, sem processamento de pagamentos ou logística dentro da plataforma.
- Chat privado para combinar pagamento e entrega externos.
- Recursos sociais: publicações, coleções, seguir, curtidas, comentários e compartilhamento.
- Denúncias e moderação manual.

## Tecnologias planejadas

As decisões aprovadas para o MVP estão registradas nos ADRs:

- TypeScript, Next.js e Fastify.
- PostgreSQL com Prisma.
- AWS S3 privado para imagens, com URLs pré-assinadas.
- Polling HTTP para atualizar o chat no MVP.

## Documentação

- [Especificação do MVP](docs/SPEC.md)
- [Descoberta do produto](docs/discovery/PRODUCT_DISCOVERY.md)
- [Glossário do domínio](docs/discovery/GLOSSARY.md)
- [Opções e visão de arquitetura](docs/architecture/OPTIONS.md)
- [Decisões de arquitetura (ADRs)](docs/architecture/adr/)
- [Tickets locais do MVP](.scratch/pokeshop/issues/)

## Estado atual

O repositório contém especificação, decisões de arquitetura e tickets de planejamento. Ainda não há aplicação, instruções de instalação ou comandos de execução.
