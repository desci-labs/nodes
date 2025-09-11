import { Request, Response } from 'express';
import { logger as parentLogger } from '../../logger.js';
import { getFromCache } from '../../redisClient.js';
import { OrcidRecommendationService } from '../../scripts/orcid-recommendation-script.js';

const logger = parentLogger.child({ module: 'RecommendationsController' });

interface OrcidRecommendations {
  directCoAuthors: string[];
  viewAuthors: string[];
  directCoAuthors2nd: string[];
  viewAuthors2nd: string[];
  metadata?: {
    generatedAt: string;
    counts: {
      directCoAuthors: number;
      viewAuthors: number;
      directCoAuthors2nd: number;
      viewAuthors2nd: number;
    };
  };
}

export const getOrcidRecommendations = async (req: Request, res: Response) => {
  try {
    const { orcid } = req.params;

    if (!orcid) {
      return res.status(400).json({ error: 'ORCID parameter is required' });
    }

    // Clean ORCID format
    const cleanOrcid = orcid.replace('https://orcid.org/', '').replace(/[^0-9X-]/g, '');
    const keyPrefix = `orcid_recommendations:${cleanOrcid}`;

    logger.info({ orcid: cleanOrcid }, 'Fetching ORCID recommendations');

    // Try to get from cache first
    try {
      const [directCoAuthors, viewAuthors, directCoAuthors2nd, viewAuthors2nd, metadata] = await Promise.all([
        getFromCache(`${keyPrefix}:direct_coauthors`),
        getFromCache(`${keyPrefix}:view_authors`),
        getFromCache(`${keyPrefix}:direct_coauthors_2nd`),
        getFromCache(`${keyPrefix}:view_authors_2nd`),
        getFromCache(`${keyPrefix}:metadata`),
      ]);

      if (directCoAuthors || viewAuthors || directCoAuthors2nd || viewAuthors2nd) {
        logger.info({ orcid: cleanOrcid }, 'Found cached recommendations');
        
        const recommendations: OrcidRecommendations = {
          directCoAuthors: directCoAuthors ? directCoAuthors.split(',').filter(Boolean) : [],
          viewAuthors: viewAuthors ? viewAuthors.split(',').filter(Boolean) : [],
          directCoAuthors2nd: directCoAuthors2nd ? directCoAuthors2nd.split(',').filter(Boolean) : [],
          viewAuthors2nd: viewAuthors2nd ? viewAuthors2nd.split(',').filter(Boolean) : [],
          metadata: metadata ? JSON.parse(metadata) : undefined,
        };

        return res.json(recommendations);
      }
    } catch (cacheError) {
      logger.warn({ error: cacheError, orcid: cleanOrcid }, 'Error reading from cache');
    }

    // If not in cache, generate new recommendations automatically
    logger.info({ orcid: cleanOrcid }, 'No cached recommendations found, generating new ones via API');
    
    const service = new OrcidRecommendationService();
    const recommendations = await service.buildRecommendationsForUser(cleanOrcid);
    
    // Save to cache for future requests
    await service.saveRecommendationsToRedis(cleanOrcid, recommendations);
    
    logger.info({ 
      orcid: cleanOrcid,
      counts: {
        directCoAuthors: recommendations.directCoAuthors.length,
        viewAuthors: recommendations.viewAuthors.length,
        directCoAuthors2nd: recommendations.directCoAuthors2nd.length,
        viewAuthors2nd: recommendations.viewAuthors2nd.length,
      }
    }, 'Generated new ORCID recommendations');

    return res.json(recommendations);

  } catch (error) {
    logger.error({ error, orcid: req.params.orcid }, 'Error fetching ORCID recommendations');
    return res.status(500).json({ 
      error: 'Failed to fetch recommendations',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};