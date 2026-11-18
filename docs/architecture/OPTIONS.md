# Arquitetura e Decisões Técnicas — PokeShop

**Status:** Decisões de arquitetura e stack técnica formalizadas e aprovadas para o MVP.

---

## 1. Stack Técnica Aprovada

- **Linguagem Principal:** TypeScript (Fullstack).
- **Frontend Web:** Next.js (React) com Tailwind CSS para layout responsivo (desktop e mobile).
- **Backend API:** Node.js com **Fastify**, estruturado como monólito modular de alta performance.
- **Banco de Dados:** **PostgreSQL** gerenciado via **Prisma ORM**, garantindo transações ACID atômicas para a máquina de estados do marketplace e concorrência de reservas.
- **Armazenamento e Privacidade de Mídia:** **AWS S3** configurado como **privado por padrão**. A entrega de imagens (fotos de anúncios, posts e avatares) é realizada por meio de **URLs pré-assinadas (Presigned GET URLs com TTL curto)** geradas pelo backend após validação de autorização/visibilidade.
- **Comunicação do Chat:** Polling HTTP básico no frontend (requisições periódicas a cada 3–5 segundos com a tela de chat aberta).
- **Catálogo Externo:** Integração com a API pública comunitária [TCGdex](https://tcgdex.net/) (fonte não-oficial), com espelhamento local no PostgreSQL.

---

## 2. Decisões Arquiteturais Fundamentadas

### Monólito Modular
O sistema é organizado internamente por módulos de domínio bem demarcados dentro do mesmo repositório:

```text
PokeShop/
├── apps/
│   ├── web/                     # Frontend Next.js (páginas públicas, catálogo, social e chat)
│   └── api/                     # Backend Fastify (endpoints REST, validações e regras)
│
├── packages/
│   ├── database/                # Schema Prisma, migrations e client PostgreSQL
│   └── shared/                  # Schemas Zod, tipos TypeScript e constantes compartilhadas
│
├── docs/                        # Documentação do projeto e ADRs
└── package.json                 # Gerenciamento de workspace (pnpm / Turborepo)
```

### Domínios do Backend (`apps/api/src/modules/`):
- `auth`: Cadastro (+13 anos por autodeclaração), login (e-mail/senha e Google), emissão e validação de tokens JWT.
- `catalog`: Sincronização em segundo plano com TCGdex e busca de cartas no banco local.
- `listings`: Gestão de anúncios e fotos (Presigned URLs para S3).
- `orders`: Máquina de estados das negociações (`DISPONIVEL` $\rightarrow$ `AGUARDANDO_CONFIRMACAO` $\rightarrow$ `NEGOCIACAO_ABERTA` $\rightarrow$ `VENDIDO`).
- `chat`: Salas privadas de negociação e histórico de mensagens com controle de autorização.
- `social`: Posts, coleções (possuídas e wishlist), feed cronológico e regras de privacidade (público vs. privado).
- `moderation`: Fila de denúncias e banimento definitivo imediato.
- `jobs`: Agendador de tarefas periódicas (verificação diária do aviso de 25 dias e do cancelamento aos 30 dias de inatividade).

---

## 3. Registros de Decisão Arquitetural (ADRs)

- [ADR-001: Escolha da Stack TypeScript Fullstack (Next.js + Fastify + Prisma)](adr/ADR-001-stack-e-monolito-modular.md)
- [ADR-002: Estratégia de Chat via Polling Básico](adr/ADR-002-estrategia-chat-polling.md)
- [ADR-003: Armazenamento e Privacidade de Fotos no AWS S3 com Presigned URLs](adr/ADR-003-armazenamento-fotos-s3.md)
