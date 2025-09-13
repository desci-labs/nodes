import type { Request, Response } from 'express';
import { logger as baseLogger } from '../../logger.js';

const logger = baseLogger.child({ module: 'getQuestion' });

// Supabase configuration - to be initialized if needed
let supabase: any = null;

// Initialize Supabase synchronously if environment variables are set
async function initSupabase() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
      logger.info('Supabase client initialized successfully');
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Supabase client');
    }
  }
}

// Initialize immediately
initSupabase();

interface GetQuestionQuery {
  id?: string;
}

/**
 * GET /v1/services/get-question?id={searchId}
 * Returns the question text for a given search ID from Supabase
 */
export const getQuestion = async (req: Request<any, any, any, GetQuestionQuery>, res: Response) => {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid search ID parameter' });
    }

    logger.info({ id }, 'Fetching question for search ID');

    // Check if Supabase is available
    if (!supabase) {
      logger.error('Supabase client not available');
      return res.status(503).json({ error: 'Database service not available' });
    }

    try {
      // Fetch only the query field from the search_logs table
      const { data, error } = await supabase
        .from('search_logs')
        .select('query')
        .eq('id', id)
        .single();

      if (error || !data) {
        logger.error({ error, id }, 'Search result not found');
        return res.status(404).json({ error: 'Search result not found' });
      }

      logger.info({ id }, 'Successfully retrieved question');

      // Return just the question text
      return res.status(200).json({
        id,
        question: data.query
      });

    } catch (dbError) {
      logger.error({ error: dbError, id }, 'Database error while fetching question');
      return res.status(500).json({ error: 'Failed to fetch question from database' });
    }

  } catch (error) {
    logger.error({ error }, 'Unexpected error in getQuestion');
    return res.status(500).json({ error: 'Internal server error' });
  }
};