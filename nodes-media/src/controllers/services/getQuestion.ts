import type { Request, Response } from 'express';
import { logger as baseLogger } from '../../logger.js';

const logger = baseLogger.child({ module: 'getQuestion' });

// Supabase configuration - to be initialized if needed
let supabase: any = null;
let initPromise: Promise<any> | null = null;

/**
 * Promise-based Supabase initializer and accessor
 * Returns the Supabase client, initializing it if necessary
 */
async function getSupabase(): Promise<any> {
  // If already initialized, return immediately
  if (supabase) {
    return supabase;
  }

  // If initialization is in progress, wait for it
  if (initPromise) {
    await initPromise;
    return supabase;
  }

  // Start initialization
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    initPromise = (async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
        logger.info('Supabase client initialized successfully');
        return supabase;
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize Supabase client');
        throw err;
      }
    })();

    await initPromise;
    return supabase;
  } else {
    throw new Error('Supabase environment variables not configured');
  }
}

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

    try {
      // Get Supabase client, initializing if necessary
      const supabaseClient = await getSupabase();

      // Fetch only the query field from the search_logs table
      const { data, error } = await supabaseClient
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

    } catch (dbError: any) {
      // Handle Supabase initialization errors specifically
      if (dbError.message?.includes('environment variables not configured')) {
        logger.error('Supabase not configured');
        return res.status(503).json({ error: 'Database service not available' });
      }

      logger.error({ error: dbError, id }, 'Database error while fetching question');
      return res.status(500).json({ error: 'Failed to fetch question from database' });
    }

  } catch (error) {
    logger.error({ error }, 'Unexpected error in getQuestion');
    return res.status(500).json({ error: 'Internal server error' });
  }
};