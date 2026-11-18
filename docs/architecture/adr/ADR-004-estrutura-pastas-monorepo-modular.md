# ADR-004: Estrutura de Pastas Monorepo Modular e Feature-Driven

## Status
Aprovado

## Contexto
Com a stack técnica definida no ADR-001 (Next.js, Fastify, Prisma e TypeScript), é necessário estabelecer uma estrutura de diretórios padronizada para o repositório. O projeto adota a prática de Spec-Driven Development (SDD) e necessita de alta coesão por domínio de negócio (catálogo, anúncios, pedidos/negociação, chat, social, moderação e jobs), evitando o acoplamento desordenado e a dispersão de regras de negócio.

## Decisão
Adotar um **Monorepo gerenciado por pnpm workspaces e Turborepo**, estruturado no modelo **Modular por Domínio (Vertical Slices)** na API e **Feature-Driven** no Frontend Web:

### 1. Visão Geral da Raiz
- `apps/api`: Servidor Fastify com rotas, regras de negócio e integrações.
- `apps/web`: Frontend Next.js (App Router) e Tailwind CSS.
- `packages/database`: Schema do Prisma, migrações e instância singleton do cliente PostgreSQL.
- `packages/shared`: Schemas Zod (contratos de validação), constantes (enums, status de máquinas de estado) e tipos TypeScript compartilhados entre front e back.
- `packages/tsconfig`: Configurações de TypeScript base compartilhadas.
- `docs/`: Documentação de produto, glossário, especificações e ADRs.

### 2. Backend (`apps/api/src/`)
Organizado em fatias verticais por domínio dentro de `modules/`:
- `modules/<dominio>/`: Cada módulo encapsula suas próprias rotas (`*.routes.ts`), serviços/regras (`*.service.ts`), validações locais (`*.schemas.ts`) e testes (`*.spec.ts`).
  - Domínios iniciais: `auth`, `catalog`, `listings`, `orders`, `chat`, `social`, `moderation` e `jobs`.
- `plugins/`: Plugins nativos do Fastify (conexão com Prisma, autenticação JWT, integração com S3, CORS).
- `shared/`: Tratamento global de erros (`AppError`), middlewares transversais e utilitários da API.

### 3. Frontend (`apps/web/src/`)
Organizado por funcionalidades (*features*):
- `app/`: Exclusivo para o roteamento do Next.js (páginas, layouts e estados de carregamento), mantendo os arquivos de rota enxutos.
- `features/<dominio>/`: Componentes, formulários e hooks específicos do domínio (ex: `features/chat/hooks/useChatPolling.ts`, `features/listings/components/ListingForm.tsx`).
- `components/ui/`: Componentes visuais atômicos e genéricos (botões, modais, inputs, badges).
- `lib/`: Clientes utilitários (cliente HTTP `api-client.ts`, formatadores de moeda/data).

### 4. Regras de Fronteira e Dependência (Boundary Rules)
Para viabilizar o Spec-Driven Development (SDD) e manter a integridade arquitetural:
1. `packages/shared` é a fonte única da verdade para validações e contratos. Não possui dependências com os apps nem com o banco de dados.
2. `packages/database` é consumido **exclusivamente** pelo backend (`apps/api`). O frontend (`apps/web`) **nunca** acessa o banco diretamente.
3. Comunicação entre módulos do backend deve ser feita preferencialmente via serviços públicos de cada módulo, evitando acoplamento direto a tabelas de outros contextos sem validação.

## Consequências
- **Positivas:** 
  - Alinhamento direto com o SDD: contratos definidos em `packages/shared` via Zod garantem tipagem e validação sincronizadas no Fastify e nos formulários do Next.js.
  - Alto isolamento: alterações em um ticket específico (ex: chat) ficam confinadas à pasta do respectivo domínio.
  - Agilidade no ciclo de desenvolvimento: sem camadas excessivas de indireção para o escopo do MVP, mantendo código limpo e intuitivo.
- **Negativas:** Exige disciplina da equipe para não importar dependências de forma cruzada violando as regras de fronteira.
