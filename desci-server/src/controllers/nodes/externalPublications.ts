import { Response, NextFunction } from 'express';
import { Searcher } from 'fast-fuzzy';
import _ from 'lodash';
import z from 'zod';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessMessageResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { crossRefClient } from '../../services/index.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

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

export const externalPublications = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params as z.infer<typeof externalPublicationsSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError(`Node ${uuid} not found`);

  const userIsNodeOwner = req.user?.id === node?.ownerId;

  logger.trace({ uuid, userIsNodeOwner });

  const externalPublication = await prisma.externalPublications.findMany({
    where: { uuid: ensureUuidEndsWithDot(uuid) },
  });

  if (externalPublication.length > 0) return new SuccessResponse(externalPublication).send(res);

  // return empty list if user is not node owner
  if (!userIsNodeOwner) return new SuccessResponse([]).send(res);

  const manifest = await repoService.getDraftManifest({ uuid: uuid as NodeUuid, documentId: node.manifestDocumentId });
  const data = await crossRefClient.searchWorks({ queryTitle: manifest?.title });

  if (data.length > 0) {
    const titleSearcher = new Searcher(data, { keySelector: (entry) => entry.title });
    const titleResult = titleSearcher.search(manifest.title, { returnMatchData: true });
    logger.trace(
      {
        data: titleResult.map((data) => ({
          title: data.item.title,
          publisher: data.item.publisher,
          source_url: data.item?.resource?.primary?.URL || data.item.URL || '',
          doi: data.item.DOI,
          key: data.key,
          match: data.match,
          score: data.score,
        })),
      },
      'Title search result',
    );

    const descSearcher = new Searcher(data, { keySelector: (entry) => entry?.abstract ?? '' });
    const descResult = descSearcher.search(manifest.description ?? '', { returnMatchData: true });
    logger.trace(
      {
        data: descResult.map((data) => ({
          title: data.item.title,
          key: data.key,
          match: data.match,
          score: data.score,
        })),
      },
      'Abstract search result',
    );

    const authorsSearchScores = data.map((work) => {
      const authorSearcher = new Searcher(work.author, { keySelector: (entry) => `${entry.given} ${entry.family}` });

      const nodeAuthorsMatch = manifest.authors.map((author) =>
        authorSearcher.search(author.name, { returnMatchData: true }),
      );
      return {
        publisher: work.publisher,
        score: nodeAuthorsMatch.flat().reduce((total, match) => (total += match.score), 0) / manifest.authors.length,
        match: nodeAuthorsMatch.flat().map((data) => ({
          key: data.key,
          match: data.match,
          score: data.score,
          author: data.item,
          publisher: work.publisher,
          doi: work.DOI,
        })),
      };
    });

    logger.trace(
      {
        data: descResult.map((data) => ({
          title: data.item.title,
          key: data.key,
          match: data.match,
          score: data.score,
        })),
      },
      'Authors search result',
    );

    const publications = data
      .map((data) => ({
        publisher: data.publisher,
        sourceUrl: data?.resource?.primary?.URL || data.URL || '',
        doi: data.DOI,
        'is-referenced-by-count': data['is-referenced-by-count'] ?? 0,
        publishYear:
          data.published['date-parts']?.[0]?.[0].toString() ??
          data.license
            .map((licence) => licence.start['date-parts']?.[0]?.[0])
            .filter(Boolean)?.[0]
            .toString(),
        title: titleResult
          .filter((res) => res.item.publisher === data.publisher)
          .map((data) => ({
            title: data.item.title,
            key: data.key,
            match: data.match,
            score: data.score,
          }))?.[0],
        abstract: descResult
          .filter((res) => res.item.publisher === data.publisher)
          .map((data) => ({
            key: data.key,
            match: data.match,
            score: data.score,
            abstract: data.item?.abstract ?? '',
          }))?.[0],
        authors: authorsSearchScores
          .filter((res) => res.publisher === data.publisher)
          .map((data) => ({
            score: data.score,
            authors: data.match,
          }))?.[0],
      }))
      .map((publication) => ({
        ...publication,
        score:
          ((publication.title?.score ?? 0) + (publication.abstract?.score ?? 0) + (publication.authors?.score ?? 0)) /
          3,
      }))
      .filter((entry) => entry.score >= 0.8);

    logger.trace({ publications, uuid }, 'externalPublications');

    if (publications.length > 0) return new SuccessResponse(publications).send(res);
  }

  return new SuccessResponse([]).send(res);
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
    data: { doi, score, sourceUrl, publisher, publishYear, uuid: ensureUuidEndsWithDot(uuid) },
  });

  return new SuccessResponse(entry).send(res);
};
