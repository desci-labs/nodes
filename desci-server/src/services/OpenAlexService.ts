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
  ssl: {
    rejectUnauthorized: false,
  },
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

/**
 * Queries work indices and features for given author IDs and publication year
 * @param authorIds List of author IDs to query
 * @param pubYear Publication year threshold
 * @returns Array of work indices and features
 */
export async function queryIndicesFeats(authorIds: string[], pubYear: number): Promise<any[]> {
  if (!authorIds || authorIds.length === 0) {
    return [];
  }

  const query = `
    SELECT 
      wa.author_id as "authorId", 
      wa.work_id as "workId", 
      w.publication_date as "publicationDate",
      w.publication_year as "publicationYear", 
      w.cited_by_count as "citedByCount"
    FROM 
      openalex.works_authorships wa
    JOIN 
      openalex.works w ON wa.work_id = w.id
    WHERE 
      wa.author_id = ANY($1)
      AND w.publication_year <= $2;
  `;

  try {
    const { rows } = await client.query(query, [authorIds, pubYear]);
    return rows as { authorId: string; publcationDate: string; publicationYear: number; citedByCount: string }[];
  } catch (error) {
    logger.error({ error, authorIds, pubYear }, 'Error querying indices features');
    return [];
  }
}

/**
 * Computes author indices including m-index and contemporary h-index
 * @param dfFiltered Array of work data for authors
 * @param authorId Author ID to compute indices for
 * @param year Reference year for calculations
 * @param delta Parameter for weighted citations calculation
 * @param gamma Parameter for weighted citations calculation
 * @returns Object containing m_index and contemporary_h_index
 */
export interface AuthorIndices {
  m_index: number;
  contemporary_h_index: number;
}

// export interface AuthorBibliography extends AuthorIndices {
//   citationCount: number;
//   fistPubYear: number;
// }

export function computeAuthorIndices(
  dfFiltered: Array<{
    authorId: string;
    publicationYear: number;
    citedByCount: string | number;
    publicationDate?: string;
  }>,
  authorId: string,
  year: number,
  delta: number,
  gamma: number,
) {
  // Filter the data similar to the Python function
  const authorIndices = dfFiltered
    .filter(
      (row) =>
        row.authorId === authorId &&
        row.publicationYear !== null &&
        row.publicationYear !== undefined &&
        row.citedByCount !== null &&
        row.citedByCount !== undefined &&
        row.publicationYear <= year,
    )
    .map((row) => ({
      ...row,
      citedByCount: typeof row.citedByCount === 'string' ? parseInt(row.citedByCount, 10) : row.citedByCount,
    }));

  const firstPubYear = Math.min(...authorIndices.map((row) => row.publicationYear));
  const citation_count = authorIndices.reduce((sum, index) => (sum += index.citedByCount), 0);

  if (authorIndices.length === 0) {
    return {
      m_index: 0.0,
      contemporary_h_index: 0,
      citation_count,
      firstPubYear,
    };
  }

  // Calculate age of publication and weighted citations
  const weightedIndices = authorIndices.map((row) => {
    const ageOfPublication = year - row.publicationYear;
    const weightedCitations =
      ageOfPublication >= 0 ? (gamma * row.citedByCount) / Math.pow(ageOfPublication + 1, delta) : 0;

    return {
      ...row,
      ageOfPublication,
      weightedCitations,
      calculationYear: year,
    };
  });

  // Sort by cited_by_count descending and add rank
  weightedIndices.sort((a, b) => b.citedByCount - a.citedByCount);
  const rankedWeightedIndices = weightedIndices.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  // Calculate h-index
  const hConditions = rankedWeightedIndices.map((row) => row.rank <= row.citedByCount);
  const hIndex = hConditions.filter(Boolean).length;

  // Calculate m-index
  // const firstPubYear = Math.min(...rankedWeightedIndices.map((row) => row.publicationYear));
  const careerLength = isNaN(firstPubYear) || year === firstPubYear ? 1 : Math.max(year - firstPubYear, 1);
  const mIndex = hIndex / careerLength;

  // Calculate contemporary h-index
  rankedWeightedIndices.sort((a, b) => b.weightedCitations - a.weightedCitations);
  const rankedWeightedIndices2 = rankedWeightedIndices.map((row, index) => ({
    ...row,
    weightedRank: index + 1,
  }));

  const contemporaryConditions = rankedWeightedIndices2.map((row) => row.weightedRank <= row.weightedCitations);
  const contemporaryHIndex = contemporaryConditions.filter(Boolean).length;

  return {
    firstPubYear,
    citation_count,
    m_index: Number(mIndex.toFixed(5)),
    contemporary_h_index: contemporaryHIndex,
  };
}

export interface CoAuthor {
  id: string;
  name: string;
  orcid: string;
  workId: string;
}
export async function getUniqueCoauthors(
  authorIds: string[],
  pubYear: number,
  search = '',
  offset = 0,
  limit = 50,
): Promise<CoAuthor[]> {
  if (!authorIds || authorIds.length === 0) {
    return [];
  }

  const minYear = pubYear - 10;
  const query = `
WITH RecentWorks AS (
    SELECT
        wa.author_id AS main_author,
        wa.work_id
    FROM
        openalex.works_authorships wa
        JOIN openalex.works w ON wa.work_id = w.id
    WHERE
        wa.author_id = ANY($1)
        AND w.publication_year BETWEEN $2 AND $3
)
SELECT
    DISTINCT wa_all.author_id AS id,
    author.display_name AS "name",
    author.orcid AS orcid,
    rw.work_id as "workId"
FROM
    RecentWorks rw
    JOIN openalex.works_authorships wa_all ON rw.work_id = wa_all.work_id
    JOIN openalex.authors author ON author.id = wa_all.author_id and author.display_name ILIKE '%${search || ''}%'
WHERE
    wa_all.author_id <> rw.main_author
OFFSET $4
LIMIT $5;
`;

  const result = await client.query(query, [authorIds, minYear, pubYear, offset, limit]);
  let coauthors = result.rows.filter(Boolean);
  coauthors = _.uniqBy(coauthors, (entry) => entry.id);
  logger.trace({ uniqueAuthors: coauthors.length }, 'getUniqueCoauthors#result');
  return coauthors;
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

export async function getPublishersBySourceIds(sourceIds: string[]): Promise<Record<string, string>> {
  logger.trace({ sourceIds }, 'startgetPublishersBySourceIds');
  const { rows } = await client.query(`SELECT id, display_name FROM openalex.sources WHERE id = ANY($1)`, [sourceIds]);
  const result = rows.reduce((acc, row) => {
    acc[row.id] = row.display_name;
    return acc;
  }, {});
  logger.trace({ result }, 'getPublishersBySourceIds');
  return result;
}

export const OpenAlexService = {
  getMetadataByWorkId,
  getMetadataByDoi,
  getTopicsByIds,
};
