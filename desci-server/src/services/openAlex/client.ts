import { logger } from '../../logger.js';

import { OpenAlexAuthor, OpenAlexWork } from './types.js';

/**
 * A wrapper http client for querying, caching and parsing requests
 * from the OpenAlex Rest Api https://docs.openalex.org/
 * Initialize constructor with Openalex Api url https://api.openalex.org/
 */
export class OpenAlexClient {
  //   baseurl = 'https://api.openalex.org/';

  constructor(private baseurl: string = 'https://api.openalex.org/') {}

  async searchAuthorByOrcid(orcid: string) {
    // url should look like this: https://api.openalex.org/authors?filter=orcid:0000-0001-7413-0412
    try {
      // Format ORCID if needed (remove any prefixes like https://orcid.org/)
      const formattedOrcid = orcid.replace('https://orcid.org/', '');

      // Get author by ORCID
      const url = `${this.baseurl}authors?filter=orcid:${formattedOrcid}`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      // If no results found
      if (!data.results || data.results.length === 0) {
        return null;
      }

      //   // Get the first author from results
      //   const authorId = data.results[0].id;

      //   // Get detailed author profile using the ID
      //   const profileUrl = `${this.baseurl}authors/${authorId}`;
      //   const profileResponse = await fetch(profileUrl, {
      //     headers: {
      //       Accept: 'application/json',
      //     },
      //   });

      //   if (!profileResponse.ok) {
      //     return null;
      //   }

      return data.results[0] as OpenAlexAuthor;
    } catch (error) {
      console.error('Error searching author by ORCID:', error);
      return null;
    }
  }

  async searchWorksByOpenAlexId(
    id: string,
    { page = 1, perPage = 10 }: { page: number; perPage: number },
  ): Promise<WorksResult> {
    try {
      // Ensure the ID is properly formatted
      const formattedId = id.startsWith('https://openalex.org/') ? id : `https://openalex.org/${id}`;

      // Build the URL with pagination parameters
      const url = `${this.baseurl}works?filter=author.id:${encodeURIComponent(formattedId)}&page=${page}&per-page=${perPage}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      logger.trace({ url, response: response.ok }, 'searchWorksByOpenAlexId');
      if (!response.ok) {
        return { works: [], meta: { count: 0, page, perPage } };
      }

      const data = await response.json();

      return {
        works: (data.results || []) as OpenAlexWork[],
        meta: {
          count: data.meta?.count || 0,
          page: data.meta?.page || page,
          perPage: data.meta?.per_page || perPage,
          totalPages: data.meta?.total_pages || 1,
        },
      };
    } catch (error) {
      console.error('Error searching works by OpenAlex ID:', error);
      return { works: [], meta: { count: 0, page, perPage } };
    }
  }
}

export interface WorksResult {
  works: OpenAlexWork[];
  meta: {
    count: number;
    page: number;
    perPage: number;
    totalPages?: number;
  };
}
