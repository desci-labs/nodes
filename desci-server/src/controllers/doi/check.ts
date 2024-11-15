import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { ApiError, BadRequestError, ForbiddenError, InternalError } from '../../core/ApiError.js';
import { SuccessResponse } from '../../core/ApiResponse.js';
import { DoiError, ForbiddenMintError } from '../../core/doi/error.js';
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from '../../middleware/authorisation.js';
import { OpenAlexWork, transformInvertedAbstractToText } from '../../services/AutomatedMetadata.js';
import { doiService } from '../../services/index.js';
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
  authors: string[];
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

export const retrieveDoi = async (req: Request, res: Response, _next: NextFunction) => {
  const { doi: doiQuery } = req.query;
  const identifier = doiQuery;

  if (!doiQuery) throw new BadRequestError();

  const doiLink = (doiQuery as string)?.startsWith('doi.org/') ? `https://${doiQuery}` : `https://doi.org/${doiQuery}`;

  const client = new Client({
    connectionString: process.env.OPEN_ALEX_DATABASE_URL,
    connectionTimeoutMillis: 1500,
    options: '-c search_path=openalex',
  });

  await client.connect();
  logger.info({ doiQuery }, 'Retrieve DOI');

  // pull record from openalex database
  const { rows } = await client.query(
    `select 
    COALESCE(wol.pdf_url, '') as pdf_url,
    COALESCE(wol.landing_page_url, '') as landing_page_url,
    works.title as title,
    works.id as works_id,
    works."type" as work_type,
    works.publication_year,
    works.cited_by_count as citation_count,
    COALESCE(woa.oa_status, 'unknown') as oa_status,
    COALESCE(source.publisher, 'unknown') as publisher,
    COALESCE(source.display_name, 'unknown') as source_name,
    ARRAY(
        SELECT author.display_name as author_name 
        FROM openalex.works_authorships wauth
        LEFT JOIN openalex.authors author on author.id = wauth.author_id
        WHERE wauth.work_id = works.id
    ) as authors
from openalex.works works
left join openalex.works_best_oa_locations wol on works.id = wol.work_id
left join openalex.works_authorships wa on works.id = wa.work_id
left join openalex.works_open_access woa on woa.work_id = works.id
left join openalex.sources source on source.id = wol.source_id
where works.doi = $1
group by wol.pdf_url, wol.landing_page_url, works.title, works.id, works."type", works.cited_by_count, works.publication_year, woa.oa_status, source.publisher, source.display_name;`,
    [doiLink],
  );

  const works = rows?.[0] as WorksDetails;

  logger.info({ works_found: rows.length > 0, doi: doiLink }, 'Retrieve DOI Works');
  const { rows: abstract_result } = await client.query(
    'select works.abstract_inverted_index AS abstract FROM openalex.works works WHERE works.id = $1',
    [works?.works_id],
  );

  const abstract_inverted_index = abstract_result[0]?.abstract as OpenAlexWork['abstract_inverted_index'];
  const abstract = abstract_inverted_index ? transformInvertedAbstractToText(abstract_inverted_index) : '';

  await client.end();

  logger.info({ works }, 'OPEN ALEX QUERY');

  new SuccessResponse({ abstract, doi: identifier, ...works }).send(res);
};
