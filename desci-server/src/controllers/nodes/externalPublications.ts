import { Response, NextFunction } from 'express';
import { Searcher } from 'fast-fuzzy';
import _ from 'lodash';
import z from 'zod';

import { prisma } from '../../client.js';
import { NotFoundError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { crossRefClient } from '../../services/index.js';
import { NodeUuid } from '../../services/manifestRepo.js';
import repoService from '../../services/repoService.js';
import { ensureUuidEndsWithDot } from '../../utils.js';

export const externalPublicationsSchema = z.object({
  params: z.object({
    // quickly disqualify false uuid strings
    uuid: z.string().min(10),
  }),
});

export const externalPublications = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params as z.infer<typeof externalPublicationsSchema>['params'];
  const node = await prisma.node.findFirst({ where: { uuid: ensureUuidEndsWithDot(uuid) } });
  if (!node) throw new NotFoundError(`Node ${uuid} not found`);

  const manifest = await repoService.getDraftManifest({ uuid: uuid as NodeUuid, documentId: node.manifestDocumentId });
  const data = await crossRefClient.searchWorks({ queryTitle: manifest?.title });

  logger.trace({ data }, 'CrossRef search result');

  if (data.length > 0) {
    const titleSearcher = new Searcher(data, { keySelector: (entry) => entry.title });
    const titleResult = titleSearcher.search(manifest.title, { returnMatchData: true });
    logger.trace({ titleResult }, 'Title search result');

    const descSearcher = new Searcher(data, { keySelector: (entry) => entry.abstract ?? '' });
    const descResult = descSearcher.search(manifest.description ?? '', { returnMatchData: true });
    logger.trace({ descResult }, 'Desc search result');

    const authorsSearchScores = data.map((work) => {
      const authorSearcher = new Searcher(work.author, { keySelector: (entry) => entry.name });

      const nodeAuthorsMatch = manifest.authors.map((author) =>
        authorSearcher.search(author.name, { returnMatchData: true }),
      );
      return manifest.authors.length / nodeAuthorsMatch.flat().reduce((total, match) => (total += match.score), 0);
    });
    logger.trace({ authorsSearchScores }, 'AuthorsSearchScores');

    return new SuccessResponse({ titleResult, descResult, authorsSearchScores });
  }

  return new SuccessResponse(data).send(res);
};
