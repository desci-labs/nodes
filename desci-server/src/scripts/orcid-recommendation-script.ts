#!/usr/bin/env ts-node
/**
 * ORCID Co-Author Recommendation Script
 * 
 * This script fetches ORCID IDs from various sources for building a news feed recommendation system:
 * 1. Direct co-authors: Authors who have co-authored papers with the target ORCID
 * 2. View-authors: Authors of papers the target ORCID has viewed/bookmarked
 * 3. Second-order relationships: Co-authors of the above categories
 * 
 * Results are saved to Redis as comma-separated lists for each category.
 */

import { performance } from 'perf_hooks';
import { prisma } from '../client.js';
import { logger as parentLogger } from '../logger.js';
import { elasticClient } from '../elasticSearchClient.js';
import { setToCache } from '../redisClient.js';
// import orcidApiService from '../services/orcid.js';
// import { searchEsAuthors } from '../services/ElasticSearchService.js';

const logger = parentLogger.child({ module: 'OrcidRecommendationScript' });

interface OrcidRecommendations {
  directCoAuthors: string[];
  viewAuthors: string[];
  directCoAuthors2nd: string[];
  viewAuthors2nd: string[];
}

interface ElasticAuthor {
  display_name: string;
  orcid: string | null;
  id: string;
}

interface ElasticWork {
  authors: ElasticAuthor[];
  title: string;
  doi?: string;
  id: string;
}

class OrcidRecommendationService {
  private readonly CACHE_TTL = 60 * 60 * 24 * 7; // 1 week
  private readonly BATCH_SIZE = 100;
  private readonly MAX_SECOND_ORDER_DEPTH = 50;

  constructor() {}

  /**
   * Main function to build ORCID recommendations for a user
   */
  async buildRecommendationsForUser(targetOrcid: string): Promise<OrcidRecommendations> {
    const startTime = performance.now();
    logger.info({ targetOrcid }, 'Starting ORCID recommendation building');

    try {
      // Step 1: Get direct co-authors from Elasticsearch
      logger.info('Fetching direct co-authors from Elasticsearch');
      const directCoAuthors = await this.getDirectCoAuthors(targetOrcid);
      logger.info({ count: directCoAuthors.length }, 'Found direct co-authors');

      // Step 2: Get authors from viewed/bookmarked papers
      logger.info('Fetching authors from viewed/bookmarked papers');
      const viewAuthors = await this.getViewedPaperAuthors(targetOrcid);
      logger.info({ count: viewAuthors.length }, 'Found view authors');

      // Step 3: Get second-order co-authors for direct co-authors
      logger.info('Fetching second-order co-authors for direct co-authors');
      const directCoAuthors2nd = await this.getSecondOrderCoAuthors(directCoAuthors);
      logger.info({ count: directCoAuthors2nd.length }, 'Found second-order direct co-authors');

      // Step 4: Get second-order co-authors for view authors
      logger.info('Fetching second-order co-authors for view authors');
      const viewAuthors2nd = await this.getSecondOrderCoAuthors(viewAuthors);
      logger.info({ count: viewAuthors2nd.length }, 'Found second-order view authors');

      const recommendations: OrcidRecommendations = {
        directCoAuthors: this.deduplicateOrcids(directCoAuthors, [targetOrcid]),
        viewAuthors: this.deduplicateOrcids(viewAuthors, [targetOrcid]),
        directCoAuthors2nd: this.deduplicateOrcids(directCoAuthors2nd, [targetOrcid, ...directCoAuthors]),
        viewAuthors2nd: this.deduplicateOrcids(viewAuthors2nd, [targetOrcid, ...viewAuthors])
      };

      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);
      
      logger.info({
        targetOrcid,
        directCoAuthors: recommendations.directCoAuthors.length,
        viewAuthors: recommendations.viewAuthors.length,
        directCoAuthors2nd: recommendations.directCoAuthors2nd.length,
        viewAuthors2nd: recommendations.viewAuthors2nd.length,
        duration: `${duration}ms`
      }, 'ORCID recommendation building completed');

      return recommendations;
    } catch (error) {
      logger.error({ error, targetOrcid }, 'Error building ORCID recommendations');
      throw error;
    }
  }

  /**
   * Get direct co-authors from Elasticsearch by searching for works by the target ORCID
   */
  private async getDirectCoAuthors(targetOrcid: string): Promise<string[]> {
    const coAuthors: Set<string> = new Set();

    try {
      // Format ORCID for ES search
      const formattedOrcid = this.formatOrcidForSearch(targetOrcid);
      
      // Search for works by this author in Elasticsearch
      const searchResponse = await elasticClient.search({
        index: 'works_*', // Search across all works indices
        body: {
          query: {
            nested: {
              path: 'authors',
              query: {
                term: {
                  'authors.orcid': formattedOrcid
                }
              }
            }
          },
          _source: ['authors.orcid', 'authors.display_name', 'title'],
          size: 1000 // Adjust as needed
        }
      });

      const works = searchResponse.hits.hits;
      logger.info({ worksFound: works.length }, 'Found works by target ORCID');

      // Extract co-authors from each work
      for (const work of works) {
        const workData = work._source as ElasticWork;
        if (workData.authors) {
          for (const author of workData.authors) {
            if (author.orcid && this.isValidOrcid(author.orcid) && author.orcid !== formattedOrcid) {
              coAuthors.add(this.cleanOrcid(author.orcid));
            }
          }
        }
      }

      // Also try ORCID API to get additional works
      const orcidApiWorks = await this.getWorksFromOrcidApi(targetOrcid);
      for (const orcid of orcidApiWorks) {
        coAuthors.add(orcid);
      }

    } catch (error) {
      logger.error({ error, targetOrcid }, 'Error fetching direct co-authors from Elasticsearch');
    }

    return Array.from(coAuthors);
  }

  /**
   * Get authors from papers the user has viewed or bookmarked
   */
  private async getViewedPaperAuthors(targetOrcid: string): Promise<string[]> {
    const authors: Set<string> = new Set();

    try {
      // Find user by ORCID
      const user = await prisma.user.findUnique({
        where: { orcid: this.formatOrcidForSearch(targetOrcid) },
        include: {
          BookmarkedNode: {
            include: {
              node: true
            }
          },
          interactionLogs: {
            where: {
              action: 'RETRIEVE_URL', // or other view-related actions
              nodeId: { not: null }
            },
            include: {
              node: true
            },
            take: 1000,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        logger.warn({ targetOrcid }, 'User not found for ORCID');
        return Array.from(authors);
      }

      const processedWorks = new Set<string>();

      // Process bookmarked nodes
      for (const bookmark of user.BookmarkedNode) {
        if (bookmark.oaWorkId && !processedWorks.has(bookmark.oaWorkId)) {
          processedWorks.add(bookmark.oaWorkId);
          const workAuthors = await this.getAuthorsFromElasticWork(bookmark.oaWorkId);
          workAuthors.forEach(orcid => authors.add(orcid));
        }
        
        if (bookmark.doi && !processedWorks.has(bookmark.doi)) {
          processedWorks.add(bookmark.doi);
          const workAuthors = await this.getAuthorsFromElasticWorkByDoi(bookmark.doi);
          workAuthors.forEach(orcid => authors.add(orcid));
        }
      }

      // Process viewed nodes from interaction logs
      const viewedNodeUuids = new Set(
        user.interactionLogs
          .filter(log => log.nodeId)
          .map(log => log.node?.uuid)
          .filter(Boolean)
      );

      for (const nodeUuid of viewedNodeUuids) {
        if (nodeUuid) {
          const nodeAuthors = await this.getAuthorsFromNode(nodeUuid);
          nodeAuthors.forEach(orcid => authors.add(orcid));
        }
      }

    } catch (error) {
      logger.error({ error, targetOrcid }, 'Error fetching viewed paper authors');
    }

    return Array.from(authors);
  }

  /**
   * Get second-order co-authors (co-authors of co-authors)
   */
  private async getSecondOrderCoAuthors(firstOrderOrcids: string[]): Promise<string[]> {
    const secondOrderAuthors: Set<string> = new Set();
    const limitedOrcids = firstOrderOrcids.slice(0, this.MAX_SECOND_ORDER_DEPTH);
    
    logger.info({ firstOrder: firstOrderOrcids.length, processing: limitedOrcids.length }, 'Processing second-order co-authors');

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < limitedOrcids.length; i += this.BATCH_SIZE) {
      const batch = limitedOrcids.slice(i, i + this.BATCH_SIZE);
      
      const batchPromises = batch.map(async (orcid) => {
        try {
          const coAuthors = await this.getDirectCoAuthors(orcid);
          return coAuthors;
        } catch (error) {
          logger.warn({ orcid, error }, 'Error fetching co-authors for second-order processing');
          return [];
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          result.value.forEach(orcid => secondOrderAuthors.add(orcid));
        }
      });

      // Add small delay between batches
      if (i + this.BATCH_SIZE < limitedOrcids.length) {
        await this.delay(100);
      }
    }

    return Array.from(secondOrderAuthors);
  }

  /**
   * Save recommendations to Redis
   */
  async saveRecommendationsToRedis(targetOrcid: string, recommendations: OrcidRecommendations): Promise<void> {
    try {
      const cleanOrcid = this.cleanOrcid(targetOrcid);
      const keyPrefix = `orcid_recommendations:${cleanOrcid}`;

      const savePromises = [
        setToCache(`${keyPrefix}:direct_coauthors`, recommendations.directCoAuthors.join(','), this.CACHE_TTL),
        setToCache(`${keyPrefix}:view_authors`, recommendations.viewAuthors.join(','), this.CACHE_TTL),
        setToCache(`${keyPrefix}:direct_coauthors_2nd`, recommendations.directCoAuthors2nd.join(','), this.CACHE_TTL),
        setToCache(`${keyPrefix}:view_authors_2nd`, recommendations.viewAuthors2nd.join(','), this.CACHE_TTL),
        setToCache(`${keyPrefix}:metadata`, JSON.stringify({
          generatedAt: new Date().toISOString(),
          counts: {
            directCoAuthors: recommendations.directCoAuthors.length,
            viewAuthors: recommendations.viewAuthors.length,
            directCoAuthors2nd: recommendations.directCoAuthors2nd.length,
            viewAuthors2nd: recommendations.viewAuthors2nd.length
          }
        }), this.CACHE_TTL)
      ];

      await Promise.all(savePromises);
      
      logger.info({ targetOrcid }, 'Successfully saved recommendations to Redis');
    } catch (error) {
      logger.error({ error, targetOrcid }, 'Error saving recommendations to Redis');
      throw error;
    }
  }

  // Helper methods

  private async getWorksFromOrcidApi(orcid: string): Promise<string[]> {
    // This would require implementing ORCID API works endpoint
    // For now, return empty array as the main logic uses Elasticsearch
    return [];
  }

  private async getAuthorsFromElasticWork(workId: string): Promise<string[]> {
    try {
      const response = await elasticClient.get({
        index: 'works_*',
        id: workId.replace('https://openalex.org/', ''),
        _source: ['authors.orcid']
      });

      const work = response._source as ElasticWork;
      return work.authors
        ?.filter(author => author.orcid && this.isValidOrcid(author.orcid))
        .map(author => this.cleanOrcid(author.orcid)) || [];
    } catch (error) {
      logger.warn({ workId, error }, 'Error fetching authors from Elastic work');
      return [];
    }
  }

  private async getAuthorsFromElasticWorkByDoi(doi: string): Promise<string[]> {
    try {
      const response = await elasticClient.search({
        index: 'works_*',
        body: {
          query: {
            term: { 'doi.keyword': doi.toLowerCase() }
          },
          _source: ['authors.orcid'],
          size: 1
        }
      });

      const hits = response.hits.hits;
      if (hits.length === 0) return [];

      const work = hits[0]._source as ElasticWork;
      return work.authors
        ?.filter(author => author.orcid && this.isValidOrcid(author.orcid))
        .map(author => this.cleanOrcid(author.orcid)) || [];
    } catch (error) {
      logger.warn({ doi, error }, 'Error fetching authors from Elastic work by DOI');
      return [];
    }
  }

  private async getAuthorsFromNode(nodeUuid: string): Promise<string[]> {
    try {
      // Get node from database
      const node = await prisma.node.findUnique({
        where: { uuid: nodeUuid },
        include: { authors: true }
      });

      if (!node) return [];

      // Extract ORCIDs from node authors
      const orcids = node.authors
        .map(author => author.orcid)
        .filter(orcid => orcid && this.isValidOrcid(orcid))
        .map(orcid => this.cleanOrcid(orcid));

      return orcids;
    } catch (error) {
      logger.warn({ nodeUuid, error }, 'Error fetching authors from node');
      return [];
    }
  }

  private formatOrcidForSearch(orcid: string): string {
    const cleaned = this.cleanOrcid(orcid);
    return `https://orcid.org/${cleaned}`;
  }

  public cleanOrcid(orcid: string): string {
    return orcid.replace('https://orcid.org/', '').replace(/[^0-9X-]/g, '');
  }

  private isValidOrcid(orcid: string): boolean {
    const cleanOrcid = this.cleanOrcid(orcid);
    return /^\d{4}-\d{4}-\d{4}-(\d{3}[0-9X])$/.test(cleanOrcid);
  }

  private deduplicateOrcids(orcids: string[], exclusions: string[] = []): string[] {
    const cleanExclusions = exclusions.map(o => this.cleanOrcid(o));
    const uniqueOrcids = [...new Set(orcids.map(o => this.cleanOrcid(o)))];
    return uniqueOrcids.filter(orcid => !cleanExclusions.includes(orcid));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution function
export const main = async () => {
  const targetOrcid = process.argv[2];
  
  if (!targetOrcid) {
    throw new Error('Usage: npm run script:orcid-recommendations <orcid-id>');
  }

  const service = new OrcidRecommendationService();

  logger.info({ targetOrcid }, 'Building ORCID recommendations');
  
  const startTime = performance.now();
  const recommendations = await service.buildRecommendationsForUser(targetOrcid);
  const endTime = performance.now();
  
  const duration = Math.round(endTime - startTime);
  
  logger.info({
    targetOrcid,
    results: {
      directCoAuthors: recommendations.directCoAuthors.length,
      viewAuthors: recommendations.viewAuthors.length,
      directCoAuthors2nd: recommendations.directCoAuthors2nd.length,
      viewAuthors2nd: recommendations.viewAuthors2nd.length
    },
    duration: `${duration}ms`
  }, 'ORCID recommendations completed');
  
  // Save to Redis
  logger.info({ targetOrcid }, 'Saving recommendations to Redis');
  await service.saveRecommendationsToRedis(targetOrcid, recommendations);
  
  const cleanOrcid = targetOrcid.replace('https://orcid.org/', '').replace(/[^0-9X-]/g, '');
  logger.info({
    targetOrcid,
    redisKeys: [
      `orcid_recommendations:${cleanOrcid}:direct_coauthors`,
      `orcid_recommendations:${cleanOrcid}:view_authors`,
      `orcid_recommendations:${cleanOrcid}:direct_coauthors_2nd`,
      `orcid_recommendations:${cleanOrcid}:view_authors_2nd`,
      `orcid_recommendations:${cleanOrcid}:metadata`
    ]
  }, 'Successfully saved to Redis');
  
  return recommendations;
};

// Execute script
main()
  .then(() => logger.info({}, 'Script completed successfully'))
  .catch((err) => {
    logger.error({ err }, 'Error running ORCID recommendations script');
    console.log('Error running script:', err);
  });

export { OrcidRecommendationService };