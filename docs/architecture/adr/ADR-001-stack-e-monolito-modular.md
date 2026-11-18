# ADR-001: Escolha da Stack TypeScript Fullstack (Next.js + Fastify + Prisma)

## Status
Aprovado

## Contexto
O MVP da plataforma Pokémon TCG abrange catálogo de cartas, marketplace com máquina de estados rigorosa, rede social e chat de negociação. É fundamental garantir velocidade de desenvolvimento, alta performance e consistência transacional atômica para o estoque dos exemplares físicos.

## Decisão
1. **Linguagem:** TypeScript para Frontend e Backend.
2. **Frontend:** Next.js (React) com Tailwind CSS para layout responsivo.
3. **Backend API:** Node.js com **Fastify**, escolhido por sua altíssima performance, baixa sobrecarga (*overhead*) e suporte nativo a schemas e TypeScript.
4. **Banco de Dados e ORM:** **PostgreSQL** com **Prisma ORM**, garantindo migrações declarativas robustas, forte segurança de tipos (*type-safety*) e suporte a transações ACID na máquina de estados de compra.

## Consequências
- **Positivas:** Reuso de contratos de validação (Zod) e interfaces TypeScript entre front e back; facilidade de onboarding; integridade relacional forte com Prisma; alta taxa de transferência com Fastify.
- **Negativas:** Exige disciplina da equipe para manter o desacoplamento entre os módulos no monólito.
