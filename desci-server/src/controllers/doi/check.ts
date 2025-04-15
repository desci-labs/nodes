import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { ApiError, BadRequestError, ForbiddenError, InternalError } from '../../core/ApiError.js';
import { InternalErrorResponse, SuccessResponse } from '../../core/ApiResponse.js';
import { DoiError, ForbiddenMintError } from '../../core/doi/error.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { OpenAlexWork, transformInvertedAbstractToText } from '../../services/AutomatedMetadata.js';
import { doiService } from '../../services/index.js';
import { OpenAlexService } from '../../services/OpenAlexService.js';
const pg = await import('pg').then((value) => value.default);
const { Client } = pg;

const logger = parentLogger.child({ module: '/controllers/doi/check/' });

export const checkMintability = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();

  const logger = parentLogger.child({
    module: 'DOI::checkMintability',
  });

  try {
    await doiService.checkMintability(uuid);
    new SuccessResponse(true).send(res);
  } catch (err) {
    new SuccessResponse(false).send(res);
    const error = err as DoiError;
    logger.trace({ error, uuid }, 'checkMintabilityError');
  }
};

export interface WorksDetails {
  doi: string;
  authors: { name: string; orcid?: string | null }[];
  citation_count: number;
  pdf_url: string;
  publication_year: string;
  works_id: string;
  work_type: string;
  title: string;
  landing_page_url: string;
  publisher: string;
  source_name: string;
  oa_status: 'diamond' | 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed';
  abstract?: string;
}

export interface RawWorksDetails {
  doi: string;
  authors: string[];
  authors_orcid: string[];
  citation_count: number;
  pdf_url: string;
  publication_year: string;
  works_id: string;
  work_type: string;
  title: string;
  landing_page_url: string;
  publisher: string;
  source_name: string;
  oa_status: 'diamond' | 'gold' | 'green' | 'hybrid' | 'bronze' | 'closed';
  // abstract?: string;
}

export interface NoveltyScoreDetails {
  content_novelty_percentile?: number;
  context_novelty_percentile?: number;
}

export const retrieveDoi = async (req: Request, res: Response, _next: NextFunction) => {
  const { doi: doiQuery } = req.query;
  const identifier = doiQuery;

  if (!doiQuery) throw new BadRequestError();

  try {
    const workMetadata = await OpenAlexService.getMetadataByDoi(doiQuery as string);
    logger.info({ workMetadata, doiQuery }, 'OPEN ALEX QUERY success via DOI');
    new SuccessResponse(workMetadata).send(res);
  } catch (e) {
    logger.warn({ doiQuery, error: e }, 'Error fetching DOI metadata from openAlex');
    new InternalErrorResponse('Error fetching DOI metadata from openAlex').send(res);
  }
};
