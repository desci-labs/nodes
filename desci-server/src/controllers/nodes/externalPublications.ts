import { Response, NextFunction } from 'express';
import { Searcher } from 'fast-fuzzy';
import _ from 'lodash';
import z from 'zod';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { redisClient } from '../../redisClient.js';
import {
  EXTERNAL_PUB_REDIS_KEY,
  getExternalPublications,
  sendExternalPublicationsNotification,
} from '../../services/crossRef/externalPublication.js';
import { getExternalPublicationsFromOpenAlex } from '../../services/openAlex/externalPublication.js';
import { asyncMap, ensureUuidEndsWithDot } from '../../utils.js';

const logger = parentLogger.child({ module: 'ExternalPublications' });
export const externalPublicationsSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string().min(10),
  }),
});

export const addExternalPublicationsSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string().min(10),
  }),
  body: z.object({
    // uuid: z.string(),
    score: z.coerce.number(),
    doi: z.string(),
    publisher: z.string(),
    publishYear: z.string(),
    sourceUrl: z.string(),
  }),
});

export const verifyExternalPublicationSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string().min(10),
  }),
  body: z.object({
    verify: z.boolean(),
    id: z.coerce.number(),
  }),
});

export const externalPublications = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  logger.trace('externalPublications');
  const { uuid } = req.params as z.infer<typeof externalPublicationsSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError(`Node ${uuid} not found`);

  const userIsOwner = node.ownerId === req?.user?.id;
  const externalPublications = await prisma.externalPublications.findMany({
    where: { uuid: ensureUuidEndsWithDot(uuid) },
  });

  const nonVerified = externalPublications.every((pub) => !pub.isVerified);
  if (nonVerified && !userIsOwner)
    return new SuccessResponse(externalPublications.sort((a, b) => b.score - a.score).slice(0, 1)).send(res);

  if (externalPublications.length > 1)
    return new SuccessResponse(externalPublications.filter((pub) => pub.isVerified)).send(res);

  const isChecked = await redisClient.get(`${EXTERNAL_PUB_REDIS_KEY}-${ensureUuidEndsWithDot(uuid)}`);
  if (isChecked === 'true') return new SuccessResponse(externalPublications).send(res);

  const [CrossrefPublications, openAlexPublications] = await Promise.all([
    getExternalPublications(node),
    getExternalPublicationsFromOpenAlex(node),
  ]);

  await redisClient.set(`${EXTERNAL_PUB_REDIS_KEY}-${ensureUuidEndsWithDot(uuid)}`, 'true');

  logger.trace({ CrossrefPublications, openAlexPublications }, 'externalPublication');
  const publications = CrossrefPublications?.length > 0 ? CrossrefPublications : openAlexPublications;

  const entries = await asyncMap(publications, async (pub) => {
    const exists = await prisma.externalPublications.findFirst({
      where: { AND: { uuid: ensureUuidEndsWithDot(uuid), doi: pub.doi } },
    });
    logger.trace({ pub: { publisher: pub.publisher, doi: pub.doi }, exists }, '[pub exists]');
    if (exists) return exists;

    return prisma.externalPublications.create({
      data: {
        doi: pub.doi,
        score: pub.score,
        sourceUrl: pub.sourceUrl,
        publisher: pub.publisher,
        publishYear: pub.publishYear,
        uuid: ensureUuidEndsWithDot(node.uuid),
        isVerified: false,
      },
    });
  });

  sendExternalPublicationsNotification(node);
  return new SuccessResponse(entries).send(res);
  // return new SuccessResponse({ publications, openAlexPublications }).send(res);
};

export const addExternalPublication = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params as z.infer<typeof addExternalPublicationsSchema>['params'];

  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError(`Node ${uuid} not found`);

  const { doi, sourceUrl, publishYear, publisher, score } = req.body as z.infer<
    typeof addExternalPublicationsSchema
  >['body'];

  const exists = await prisma.externalPublications.findFirst({ where: { AND: [{ uuid }, { publisher }] } });
  if (exists) return new SuccessMessageResponse().send(res);

  const entry = await prisma.externalPublications.create({
    data: { doi, score, sourceUrl, publisher, publishYear, uuid: ensureUuidEndsWithDot(uuid), isVerified: true },
  });

  return new SuccessResponse(entry).send(res);
};

export const verifyExternalPublication = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params as z.infer<typeof verifyExternalPublicationSchema>['params'];
  const { verify, id } = req.body as z.infer<typeof verifyExternalPublicationSchema>['body'];

  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError(`Node ${uuid} not found`);

  await prisma.externalPublications.update({
    where: { id: parseInt(id.toString()) },
    data: { isVerified: verify, verifiedAt: new Date() },
  });

  return new SuccessMessageResponse().send(res);
};
