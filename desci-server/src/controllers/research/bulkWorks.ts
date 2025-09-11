import { Request, Response } from 'express';
import { logger as parentLogger } from '../../logger.js';
import { elasticClient } from '../../elasticSearchClient.js';

const logger = parentLogger.child({ module: 'BulkWorksController' });

export const getBulkWorksByOrcids = async (req: Request, res: Response) => {
  try {
    const { orcids, limit = 50 } = req.body;

    if (!orcids || !Array.isArray(orcids) || orcids.length === 0) {
      return res.status(400).json({ error: 'orcids array is required and cannot be empty' });
    }

    logger.info({ orcidCount: orcids.length, limit }, 'Fetching bulk works by ORCIDs');

    // Format ORCIDs for Elasticsearch search
    const formattedOrcids = orcids.map(orcid => {
      const cleanOrcid = orcid.replace('https://orcid.org/', '').replace(/[^0-9X-]/g, '');
      return `https://orcid.org/${cleanOrcid}`;
    });

    // Search for recent works by these authors
    const searchResponse = await elasticClient.search({
      index: 'works_*',
      body: {
        query: {
          bool: {
            should: formattedOrcids.map(orcid => ({
              nested: {
                path: 'authors',
                query: {
                  term: {
                    'authors.orcid': orcid
                  }
                }
              }
            })),
            minimum_should_match: 1
          }
        },
        sort: [
          { 'publication_date': { order: 'desc', missing: '_last' } },
          { 'cited_by_count': { order: 'desc', missing: '_last' } },
          { '_score': { order: 'desc' } }
        ],
        size: Math.min(limit, 100), // Cap at 100 for performance
        _source: [
          'id',
          'title', 
          'authors.display_name',
          'authors.orcid',
          'authors.institutions',
          'doi',
          'publication_date',
          'publication_year',
          'type',
          'primary_location.source',
          'abstract_inverted_index',
          'cited_by_count',
          'concepts',
          'open_access',
          'language',
          'primary_topic'
        ]
      }
    });

    const works = searchResponse.hits.hits.map((hit: any) => {
      const source = hit._source;
      
      // Convert abstract from inverted index if available
      let abstract = '';
      if (source.abstract_inverted_index) {
        try {
          const words: string[] = [];
          const maxIndex = Math.max(...Object.values(source.abstract_inverted_index).flat() as number[]);
          const wordArray = new Array(maxIndex + 1);
          
          Object.entries(source.abstract_inverted_index).forEach(([word, positions]) => {
            (positions as number[]).forEach(pos => {
              wordArray[pos] = word;
            });
          });
          
          abstract = wordArray.filter(Boolean).join(' ').slice(0, 500);
        } catch (e) {
          logger.warn({ workId: source.id }, 'Error processing abstract');
        }
      }

      return {
        id: source.id,
        title: source.title,
        authors: (source.authors || []).map((author: any) => ({
          display_name: author.display_name,
          orcid: author.orcid,
          institutions: author.institutions || []
        })),
        doi: source.doi,
        publication_date: source.publication_date,
        publication_year: source.publication_year,
        type: source.type,
        venue: source.primary_location?.source ? {
          display_name: source.primary_location.source.display_name,
          issn_l: source.primary_location.source.issn_l
        } : undefined,
        abstract,
        cited_by_count: source.cited_by_count || 0,
        concepts: (source.concepts || []).slice(0, 5).map((concept: any) => ({
          id: concept.id,
          display_name: concept.display_name,
          level: concept.level,
          score: concept.score
        })),
        open_access: source.open_access ? {
          is_oa: source.open_access.is_oa || false,
          oa_url: source.open_access.oa_url
        } : { is_oa: false },
        language: source.language,
        primary_topic: source.primary_topic
      };
    });

    logger.info({ 
      orcidCount: orcids.length, 
      worksFound: works.length,
      limit 
    }, 'Successfully fetched bulk works');

    return res.json(works);

  } catch (error) {
    logger.error({ error, orcids: req.body?.orcids?.length }, 'Error fetching bulk works');
    return res.status(500).json({ 
      error: 'Failed to fetch research works',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};