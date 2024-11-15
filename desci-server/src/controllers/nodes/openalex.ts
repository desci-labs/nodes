import { Request, Response } from 'express';
import { z } from 'zod';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { OpenAlexWork, transformInvertedAbstractToText } from '../../services/AutomatedMetadata.js';
import { WorksDetails } from '../doi/check.js';
const pg = await import('pg').then((value) => value.default);
const { Client } = pg;

export const GetWorkParamSchema = z.object({
  workId: z.string(),
});

export interface ErrorResponse {
  error: string;
  details?: z.ZodIssue[] | string;
}

/*
 ** Takes an openAlex workId as a route param and returns its metadata
 */
export const getOpenAlexWork = async (
  req: Request & { params: z.infer<typeof GetWorkParamSchema> },
  res: Response<WorksDetails | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'OpenAlexWork::GetWork',
    params: req.params,
  });

  logger.info(`Fetching OpenAlex work: ${req.params.workId}`);

  try {
    let { workId } = GetWorkParamSchema.parse(req.params);

    workId = workId.toUpperCase();
    if (!workId.startsWith('https://openalex.org/')) workId = 'https://openalex.org/' + workId;

    const client = new Client({
      connectionString: process.env.OPEN_ALEX_DATABASE_URL,
      connectionTimeoutMillis: 1500,
      options: '-c search_path=openalex',
    });
    await client.connect();

    // pull record from openalex database
    const { rows } = await client.query(
      `select 
        COALESCE(wol.pdf_url, '') as pdf_url,
        COALESCE(wol.landing_page_url, '') as landing_page_url,
        works.title as title,
        works.id as works_id,
        works.doi as doi,
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
            where works.id = $1
            group by wol.pdf_url, wol.landing_page_url, works.title, works.id, works.doi, works."type", works.cited_by_count, works.publication_year, woa.oa_status, source.publisher, source.display_name;`,
      [workId],
    );
    // debugger;

    const works = rows?.[0] as WorksDetails;

    logger.info({ works_found: rows.length > 0 }, 'Retrieve OA Work success');
    const { rows: abstract_result } = await client.query(
      'select works.abstract_inverted_index AS abstract FROM openalex.works works WHERE works.id = $1',
      [works?.works_id],
    );

    const abstract_inverted_index = abstract_result[0]?.abstract as OpenAlexWork['abstract_inverted_index'];
    const abstract = abstract_inverted_index ? transformInvertedAbstractToText(abstract_inverted_index) : '';

    await client.end();

    logger.info({ works }, 'OPEN ALEX QUERY');

    return new SuccessResponse({ abstract, ...works }).send(res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    logger.error({ error }, 'Error fetching OpenAlex work');
    return res.status(500).json({ error: 'Internal server error' });
  }
};
