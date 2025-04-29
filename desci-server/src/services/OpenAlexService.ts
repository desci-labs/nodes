const pg = await import('pg').then((value) => value.default);
// const { Client } = pg;
import _ from 'lodash';

import { NoveltyScoreDetails, RawWorksDetails, WorksDetails } from '../controllers/doi/check.js';
import { logger as parentLogger } from '../logger.js';

import { OpenAlexWork, transformInvertedAbstractToText } from './AutomatedMetadata.js';
import { getWorkNoveltyScoresById } from './ElasticSearchService.js';

const logger = parentLogger.child({
  module: 'OpenAlexService::',
});

const client = new pg.Pool({
  connectionString: process.env.OPEN_ALEX_DATABASE_URL,
  connectionTimeoutMillis: 10500,
  options: '-c search_path=openalex',
  ssl: true,
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
  workId = ensureFormattedWorkId(workId);
  logger.info({ workId }, `Fetching OpenAlex work: ${workId}`);

  try {
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
          ) as authors,
          ARRAY(
              SELECT author.orcid as author_orcid
              FROM openalex.works_authorships wauth
              LEFT JOIN openalex.authors author on author.id = wauth.author_id
              WHERE wauth.work_id = works.id
          ) as authors_orcid,
          ARRAY(
              SELECT author.id as id
              FROM openalex.works_authorships wauth
              LEFT JOIN openalex.authors author on author.id = wauth.author_id
              WHERE wauth.work_id = works.id
          ) as authors_ids
              from openalex.works works
              left join openalex.works_best_oa_locations wol on works.id = wol.work_id
              left join openalex.works_authorships wa on works.id = wa.work_id
              left join openalex.works_open_access woa on woa.work_id = works.id
              left join openalex.sources source on source.id = wol.source_id
              where works.id = $1
              group by wol.pdf_url, wol.landing_page_url, works.title, works.id, works.doi, works."type", works.cited_by_count, works.publication_year, woa.oa_status, source.publisher, source.display_name;`,
      [workId],
    );

    const work = rows?.[0] as RawWorksDetails;

    const { rows: abstract_result } = await client.query(
      'select works.abstract_inverted_index AS abstract FROM openalex.works works WHERE works.id = $1',
      [workId],
    );

    const abstract_inverted_index = abstract_result[0]?.abstract as OpenAlexWork['abstract_inverted_index'];
    const abstract = abstract_inverted_index ? transformInvertedAbstractToText(abstract_inverted_index) : '';
    const noveltyScores = await getWorkNoveltyScoresById(workId);

    const authors = work.authors.map((name, idx) => ({
      name,
      orcid: work.authors_orcid[idx],
      id: work.authors_ids[idx],
    }));

    // clean up transformed raw fields
    delete work.authors;
    delete work.authors_orcid;
    delete work.authors_ids;

    return { ...work, authors, abstract, ...noveltyScores };
  } catch (err) {
    logger.trace({ err }, 'Error');
    return null;
  }
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
    ) as authors,
    ARRAY(
        SELECT author.orcid as author_orcid
        FROM openalex.works_authorships wauth
        LEFT JOIN openalex.authors author on author.id = wauth.author_id
        WHERE wauth.work_id = works.id
    ) as authors_orcid,
    ARRAY(
        SELECT author.id as id
        FROM openalex.works_authorships wauth
        LEFT JOIN openalex.authors author on author.id = wauth.author_id
        WHERE wauth.work_id = works.id
    ) as authors_ids
from openalex.works works
left join openalex.works_best_oa_locations wol on works.id = wol.work_id
left join openalex.works_authorships wa on works.id = wa.work_id
left join openalex.works_open_access woa on woa.work_id = works.id
left join openalex.sources source on source.id = wol.source_id
where works.doi = $1
group by wol.pdf_url, wol.landing_page_url, works.title, works.id, works."type", works.cited_by_count, works.publication_year, woa.oa_status, source.publisher, source.display_name;`,
    [doi],
  );

  const work = rows?.[0] as RawWorksDetails;

  logger.info({ works_found: rows.length > 0, doi: doi }, 'Retrieve DOI Works');
  const { rows: abstract_result } = await client.query(
    'select works.abstract_inverted_index AS abstract FROM openalex.works works WHERE works.id = $1',
    [work?.works_id],
  );

  const abstract_inverted_index = abstract_result[0]?.abstract as OpenAlexWork['abstract_inverted_index'];
  const abstract = abstract_inverted_index ? transformInvertedAbstractToText(abstract_inverted_index) : '';
  logger.trace({ orcids: work.authors_orcid }, 'authors_orcid');
  const authors = work.authors.map((name, idx) => ({
    name,
    orcid: work.authors_orcid[idx],
    id: work.authors_ids[idx],
  }));

  // clean up transformed raw fields
  delete work.authors;
  delete work.authors_orcid;
  delete work.authors_ids;

  const noveltyScores = await getWorkNoveltyScoresById(work?.works_id);
  return { ...work, authors, abstract, doi: getRawDoi(doi), ...noveltyScores };
}

export interface CoAuthor {
  id: string;
  name: string;
  orcid: string;
}
export async function getUniqueCoauthors(
  authorIds: string[],
  pubYear: number,
  search = ' ',
  offset = 0,
  limit = 50,
): Promise<CoAuthor[]> {
  if (!authorIds || authorIds.length === 0) {
    return [];
  }

  const minYear = pubYear - 10;
  const query = `WITH RecentWorks AS (
    SELECT
        wa.work_id
    FROM
        openalex.works_authorships wa
        JOIN openalex.works w ON wa.work_id = w.id
    WHERE
        wa.author_id = ANY($1)
        AND w.publication_year BETWEEN $2 AND $3
)
SELECT
    DISTINCT wa2.author_id AS id,
    (
        SELECT
            author.display_name AS author_name
        FROM
            openalex.authors author
        WHERE
            author.id = wa2.author_id
    ) AS "name",
    (
        SELECT
            author.orcid AS orcids
        FROM
            openalex.authors author
        WHERE
            author.id = wa2.author_id
    ) AS orcid
FROM
    openalex.works_authorships wa2
    JOIN openalex.authors author ON author.id = wa2.author_id and author.display_name ILIKE '%$7%'
    JOIN RecentWorks rw ON wa2.work_id = rw.work_id
WHERE
    wa2.author_id <> ALL($4)
OFFSET $5
LIMIT $6
;
`;

  // try {
  const result = await client.query(query, [authorIds, minYear, pubYear, authorIds, offset, limit, search]);
  logger.trace({ query: result.command, rows: result.rowCount }, 'getUniqueCoauthors');
  let coauthors = result.rows
    // ?.map((row, rowIdx) => ({ id: row.co_author_id, name: row.author_name, orcid: row.orcid }))
    .filter(Boolean);
  coauthors = _.uniqBy(coauthors, (entry) => entry.id);
  logger.trace({ uniqueAuthors: coauthors.length }, 'getUniqueCoauthors#result');
  return coauthors;
  // } catch (error) {
  // console.error('Error getting unique coauthors:', error);
  // logger.error({ error: error.toString() }, 'Error getting unique coauthors:');
  // return [];
  // }
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
