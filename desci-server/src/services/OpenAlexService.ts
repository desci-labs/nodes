const pg = await import('pg').then((value) => value.default);
const { Client } = pg;
import { NoveltyScoreDetails, WorksDetails } from '../controllers/doi/check.js';
import { logger as parentLogger } from '../logger.js';

import { OpenAlexWork, transformInvertedAbstractToText } from './AutomatedMetadata.js';
import { getWorkNoveltyScoresById } from './ElasticSearchService.js';

const logger = parentLogger.child({
  module: 'OpenAlexService::',
});

const client = new pg.Pool({
  connectionString: process.env.OPEN_ALEX_DATABASE_URL,
  connectionTimeoutMillis: 1500,
  options: '-c search_path=openalex',
});

function ensureFormattedWorkId(workId: string) {
  workId = workId.split('/').pop();
  workId = workId.toUpperCase();
  return 'https://openalex.org/' + workId;
}

function ensureFormattedDoi(doi: string) {
  if (doi.startsWith('doi.org/')) doi = `https://${doi}`;
  if (!doi.startsWith('https://doi.org/')) doi = `https://${doi}`;

  return doi;
}

function getRawDoi(doi: string) {
  if (doi.startsWith('doi.org/')) doi = doi.replace('doi.org/', '');
  if (doi.startsWith('https://doi.org/')) doi = doi.replace('https://doi.org/', '');

  return doi;
}

export async function getMetadataByWorkId(workId: string): Promise<WorksDetails & NoveltyScoreDetails> {
  logger.info(`Fetching OpenAlex work: ${workId}`);
  workId = ensureFormattedWorkId(workId);

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
  const work = rows?.[0] as WorksDetails;

  const { rows: abstract_result } = await client.query(
    'select works.abstract_inverted_index AS abstract FROM openalex.works works WHERE works.id = $1',
    [workId],
  );

  const abstract_inverted_index = abstract_result[0]?.abstract as OpenAlexWork['abstract_inverted_index'];
  const abstract = abstract_inverted_index ? transformInvertedAbstractToText(abstract_inverted_index) : '';

  const noveltyScores = await getWorkNoveltyScoresById(workId);

  return { ...work, abstract, ...noveltyScores };
}

export async function getMetadataByDoi(doi: string): Promise<WorksDetails & NoveltyScoreDetails> {
  logger.info(`Fetching OpenAlex work by DOI: ${doi}`);
  doi = ensureFormattedDoi(doi);

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
    [doi],
  );

  const work = rows?.[0] as WorksDetails;

  logger.info({ works_found: rows.length > 0, doi: doi }, 'Retrieve DOI Works');
  const { rows: abstract_result } = await client.query(
    'select works.abstract_inverted_index AS abstract FROM openalex.works works WHERE works.id = $1',
    [work?.works_id],
  );

  const abstract_inverted_index = abstract_result[0]?.abstract as OpenAlexWork['abstract_inverted_index'];
  const abstract = abstract_inverted_index ? transformInvertedAbstractToText(abstract_inverted_index) : '';

  const noveltyScores = await getWorkNoveltyScoresById(work?.works_id);
  return { ...work, abstract, doi: getRawDoi(doi), ...noveltyScores };
}

export type OpenAlexTopic = {
  id: string;
  display_name: string;
  subfield_id: string;
  subfield_display_name: string;
};
export async function getTopicsByIds(topicIds: string[]): Promise<OpenAlexTopic[]> {
  logger.info(`Fetching OpenAlex topics for IDs: ${topicIds}`);

  // Format each topic ID to ensure it's in the correct OpenAlex URL format
  const formattedIds = topicIds.map((id) => {
    const idPart = id.split('/').pop()?.toUpperCase();
    return `https://openalex.org/${idPart}`;
  });

  const { rows } = await client.query(
    `SELECT
        id,
        display_name,
        subfield_id,
        subfield_display_name
     FROM openalex.topics 
     WHERE id = ANY($1)`,
    [formattedIds],
  );

  return rows;
}

export const OpenAlexService = {
  getMetadataByWorkId,
  getMetadataByDoi,
  getTopicsByIds,
};
