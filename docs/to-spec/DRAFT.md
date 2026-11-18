# Pokémon TCG Platform — spec draft for issue tracker

**Status:** Draft synthesized from the current conversation and reviewed project documents. The test seam was confirmed by the product owner. This draft has not been published to an issue tracker.

## Problem Statement

Colecionadores de Pokémon TCG no Brasil precisam de um lugar focado na comunidade para descobrir cartas, anunciar exemplares físicos, conversar sobre uma negociação e compartilhar coleções e publicações. Hoje, catálogo, anúncios e interação social estão separados, enquanto a negociação de um exemplar único precisa evitar duas compras simultâneas.

## Solution

Construir uma aplicação web responsiva que sincroniza um catálogo local de cartas PT-BR a partir da API comunitária não oficial TCGdex e combina anúncios de preço fixo e propostas com uma rede social e chat privado entre comprador e vendedor. A aplicação conecta as partes; pagamento e logística continuam fora da plataforma no MVP.

O sistema modela cada exemplar anunciado como uma unidade única. O PostgreSQL garante transições atômicas entre disponibilidade, espera por confirmação, negociação e venda. O chat atualiza mensagens por polling HTTP. Imagens ficam em bucket privado S3 e são disponibilizadas por URLs pré-assinadas temporárias emitidas pelo backend após verificar autorização.

## User Stories

1. As a visitor, I want to browse the public card catalog without an account, so that I can discover Pokémon TCG cards before registering.
2. As a visitor, I want to search catalog cards by their available metadata, so that I can find the card I collect.
3. As a visitor, I want to view public listings, so that I can compare available physical copies.
4. As a visitor, I want to view public posts and collections, so that I can explore the community before joining.
5. As a prospective member aged 13 or older, I want to register with my birth date and accept the terms, so that I can access member features.
6. As a member aged 13 to 17, I want the terms to explain that a legal guardian should supervise external financial negotiations, so that expectations are clear without an automated parental-consent or KYC flow in the MVP.
7. As a member, I want to sign in with email/password or Google, so that I can use the platform with a familiar authentication method.
8. As a seller, I want to select a catalog card before creating an ad, so that every listing refers to a standardized card record.
9. As a seller, I want to provide one physical copy per ad, its language, edition, standardized condition, notes, and real photos, so that buyers can assess the exact copy offered.
10. As a seller, I want to choose a fixed-price listing, so that the buyer can request that exact price without bargaining in that flow.
11. As a buyer, I want to initiate a fixed-price purchase, so that the copy is held for me while the seller confirms its availability.
12. As a seller, I want to confirm or decline availability for a fixed-price request, so that I can verify the copy before opening a negotiation.
13. As a buyer, I want an unanswered fixed-price request to expire after 30 days, so that the listing can return to the store if the seller is inactive.
14. As a seller, I want to create a proposal listing with a minimum starting value, so that collectors can make offers above that amount.
15. As a buyer, I want to submit a proposal strictly greater than the starting value, so that my offer meets the listing rule.
16. As a seller, I want to accept or reject proposals individually without counteroffers, so that I can decide which offer to pursue.
17. As a seller, I want to keep a proposal listing open indefinitely until I accept an offer or delete the listing, so that I control when proposals stop.
18. As a seller, I want accepting one proposal to block new proposals and reject all other pending proposals, so that only one buyer negotiates for a unique copy.
19. As a buyer or seller, I want a private chat to open when a fixed-price request is confirmed or a proposal is accepted, so that we can coordinate payment and delivery outside the platform.
20. As a buyer or seller, I want chat access restricted to the two transaction participants and, when reviewing a report, the moderator, so that negotiation messages stay private.
21. As a chat participant, I want new messages to appear through HTTP polling while chat is open, so that I can communicate without requiring a persistent socket connection.
22. As a user, I want in-app badges for unread messages and status changes, so that I notice activity relevant to my negotiations.
23. As a buyer or seller, I want an in-app warning after 25 days without chat updates, so that I can mark a completed external sale before the timeout.
24. As a buyer or seller, I want an inactive negotiation to close after 30 days without updates if the seller has not marked it sold, so that a stale copy can return to the store.
25. As a seller, I want to mark a copy sold after external payment and delivery, so that the listing is permanently removed from the store.
26. As a collector, I want to publish posts, like and comment on posts, and follow other collectors, so that I can interact with the community.
27. As a collector, I want to share a post using an external link, so that I can invite people outside the platform to view it.
28. As a poster, I want to link only to listings hosted on the platform, so that offers in posts resolve to platform content.
29. As a collector, I want to maintain collections of cards I own and cards I want, so that I can organize my collection and wishlist.
30. As a member, I want to choose public or private visibility for my profile, collections, and individual posts, so that I control who can see my content.
31. As a user, I want to report posts, listings, chat messages, and profiles, so that the moderator can review harmful or fraudulent content.
32. As the initial moderator, I want reports to enter a manual review queue, so that I can confirm serious violations before applying a permanent ban.
33. As a visitor or member, I want public media to be viewable only through a URL authorized by the backend, so that private media is not exposed by a permanent public S3 URL.

## Implementation Decisions

- Deliver a responsive web application for desktop and mobile browsers; native iOS/Android apps are out of scope.
- Use TypeScript, Next.js, Fastify, PostgreSQL, and Prisma in a modular monolith. The domain modules include authentication, catalog, listings, marketplace state transitions, chat, social, moderation, media authorization, notifications, and scheduled jobs.
- Use the glossary's state names:
  - `DISPONIVEL` to `AGUARDANDO_CONFIRMACAO` when a buyer initiates fixed-price purchase.
  - `AGUARDANDO_CONFIRMACAO` to `NEGOCIACAO_ABERTA` when the seller confirms, or back to `DISPONIVEL` on seller refusal or 30-day timeout.
  - An accepted proposal moves the listing from `DISPONIVEL` to `NEGOCIACAO_ABERTA`; new proposals are blocked and other pending proposals are rejected.
  - `NEGOCIACAO_ABERTA` moves to `VENDIDO` when the seller marks completion, or back to `DISPONIVEL` after 30 days without updates if it remains unmarked.
  - The seller may delete an available listing, moving it to `CANCELADO` and discarding its pending proposals.
- Keep proposal listings active without a fixed expiry until the seller accepts a proposal or deletes the listing.
- Execute listing and reservation state changes atomically in PostgreSQL to prevent concurrent buyers from reserving the same physical copy.
- After entering `NEGOCIACAO_ABERTA`, create a private chat for the buyer and seller. Use HTTP polling every 3–5 seconds for chat messages; in-app unread/status indicators poll less frequently. Notify both participants after 25 days without chat activity and close an unmarked negotiation after 30 days.
- Mirror catalog metadata locally from TCGdex, described as a public community-maintained, non-official source. Minimum fields are card name, collection, card number, and rarity. Listings must reference a catalog record.
- Store photos in a private AWS S3 bucket. The browser uploads through a short-lived presigned PUT URL; the backend issues short-lived presigned GET URLs only after checking the requester against the content's visibility and ownership rules. Allowed formats are JPEG, PNG, and WebP, with a stated maximum of 5 MB per photo.
- Treat AWS Free Tier capacity as a cost estimate, not a zero-cost guarantee; enable usage monitoring and billing alerts.
- Require age 13 or older with birth-date self-declaration and acceptance of terms. Terms state that legal guardians should supervise external financial negotiations for users aged 13–17. Automated identity or parental-consent checks are out of scope.
- Allow public browsing of public content; require authentication for buying, selling, posting, and social interaction.
- The initial moderator is the product owner. Reports are manually reviewed; permanent ban is applied after a serious violation is confirmed.

## Testing Decisions

- **Confirmed seam:** exercise behavior through the application's HTTP API with a test PostgreSQL database. Replace the TCGdex client and S3 signer/storage with test doubles at their external boundaries. There is no application code or existing test suite yet, so these are proposed seams rather than existing ones.
- A good test observes externally visible responses and resulting state, not private methods or implementation layout. Use controlled time for 25/30-day jobs and repeatable requests for reservation races.
- Cover authentication and public/private authorization, catalog-backed listing creation, fixed-price confirmation and timeout, proposal validation/acceptance/rejection, concurrent reservation attempts, chat access and polling, unread/status notifications, timeout alerts and release, sold/cancelled listings, moderation reports, and S3 URL authorization.
- Exercise scheduled jobs through their public application/job entry point against the test database; verify idempotence and correct state transitions after retries.
- Existing test prior art: none found; the repository currently contains documentation only.

## Out of Scope

- In-platform payments, escrow, payment disputes, shipping-label/freight calculation, or logistics orchestration.
- Real-time auctions and automatic highest-bid closure.
- WebSockets, mobile push notifications, and native mobile applications.
- Email notifications in the MVP.
- Automated KYC, identity-document verification, or parental-consent workflow.
- Guaranteeing that external payment/delivery occurred; the seller reports the completed sale.

## Further Notes

- This draft synthesizes the current SPEC, product discovery, glossary, and approved ADRs. The earlier proposal-window presets and 48-hour negotiation reservation were superseded by the current documented behavior: proposal listings stay open indefinitely, while inactivity jobs use 25-day warning and 30-day cancellation windows.
- TCGdex is a non-official community source; confirm its terms, attribution, and permitted synchronization before implementation.
- The 13+ policy and terms-only guardian supervision need appropriate legal/privacy review before public launch; the spec records the product decision, not legal approval.
- A 30-day inactivity timeout can reopen a listing even if an external deal completed but the seller did not mark it sold. The 25-day alert mitigates this but does not prove delivery. Define support handling for mistaken cancellation.
- The skill's required issue tracker and `ready-for-agent` triage label are not configured in this session. This draft has not been published.
