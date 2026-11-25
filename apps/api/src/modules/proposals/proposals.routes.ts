import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { createProposalSchema, listProposalsResponseSchema, orderResponseSchema, proposalResponseSchema } from '@pokeshop/shared';
import { z } from 'zod';
import { createPrismaProposalsRepository, type Clock, type ProposalsRepository } from './proposals.repository.js';
import { acceptProposal, declineProposal, listSellerProposals, ProposalError, submitProposal } from './proposals.service.js';

export type ProposalsRoutesOptions = { proposalsRepository?: ProposalsRepository; clock?: Clock };
const errorResponseSchema = z.object({ message: z.string() });
const listingIdParamsSchema = z.object({ listingId: z.string().uuid('ID do anúncio inválido.') });
const proposalIdParamsSchema = z.object({ proposalId: z.string().uuid('ID da proposta inválido.') });

export const proposalsRoutes: FastifyPluginAsyncZod<ProposalsRoutesOptions> = async (fastify, options) => {
  const repository = options.proposalsRepository ?? createPrismaProposalsRepository(fastify.prisma);
  const clock = options.clock ?? (() => new Date());

  fastify.post('/listings/:listingId/proposals', { preHandler: [fastify.authenticate], schema: { params: listingIdParamsSchema, body: createProposalSchema, response: { 201: proposalResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema } } }, async (request, reply) => {
    try {
      return reply.code(201).send(await submitProposal(request.params.listingId, request.user.sub, request.body, repository, clock));
    } catch (error) {
      if (error instanceof ProposalError) return reply.code(error.statusCode).send({ message: error.message });
      throw error;
    }
  });

  fastify.get('/listings/:listingId/proposals', { preHandler: [fastify.authenticate], schema: { params: listingIdParamsSchema, response: { 200: listProposalsResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema } } }, async (request, reply) => {
    try {
      return reply.send({ items: await listSellerProposals(request.params.listingId, request.user.sub, repository) });
    } catch (error) {
      if (error instanceof ProposalError) return reply.code(error.statusCode).send({ message: error.message });
      throw error;
    }
  });

  fastify.post('/proposals/:proposalId/accept', { preHandler: [fastify.authenticate], schema: { params: proposalIdParamsSchema, response: { 200: orderResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema } } }, async (request, reply) => {
    try {
      return reply.send(await acceptProposal(request.params.proposalId, request.user.sub, repository, clock));
    } catch (error) {
      if (error instanceof ProposalError) return reply.code(error.statusCode).send({ message: error.message });
      throw error;
    }
  });

  fastify.post('/proposals/:proposalId/decline', { preHandler: [fastify.authenticate], schema: { params: proposalIdParamsSchema, response: { 200: proposalResponseSchema, 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 409: errorResponseSchema } } }, async (request, reply) => {
    try {
      return reply.send(await declineProposal(request.params.proposalId, request.user.sub, repository, clock));
    } catch (error) {
      if (error instanceof ProposalError) return reply.code(error.statusCode).send({ message: error.message });
      throw error;
    }
  });
};
