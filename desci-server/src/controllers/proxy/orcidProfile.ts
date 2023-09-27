import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import parentLogger from 'logger';

export const ORCID_API_URL = 'https://orcid.org';

interface OrcidQueryResponse {
  ok: boolean;
  profile: any;
}
interface OrcidQueryResponseError {
  ok: boolean;
  error: string;
}

const ORCID_PROFILE_TTL = 1000 * 60 * 60 * 24; // 1 day
const REFRESH_RATE_LIMIT = 1000 * 60 * 5; // 5 minutes

export const orcidProfile = async (
  req: Request,
  res: Response<OrcidQueryResponse | OrcidQueryResponseError>,
  next: NextFunction,
) => {
  // debugger;
  const orcidId = req.params.orcidId as string;

  const { refresh: refreshQuery } = req.query;
  const refresh = refreshQuery === 'true';

  if (!orcidId) return res.status(400).json({ ok: false, error: 'orcidId required' });

  const logger = parentLogger.child({
    module: 'SERVICES::orcidQueryController',
    orcidId,
    refresh,
  });

  try {
    // fetch from cache
    const cachedResult = await prisma.orcidProfile.findFirst({ where: { orcidId: orcidId } });
    // check ttl against last updated
    const isFresh = cachedResult?.updatedAt < cachedResult?.expiresIn;

    if (cachedResult && isFresh && !refresh) {
      logger.info(
        { updatedAt: cachedResult.updatedAt, expiresIn: cachedResult.expiresIn },
        'Cached result found, returning',
      );
      return res.status(200).send({ ok: true, profile: cachedResult.profile });
    } else {
      //rate limit on refresh
      if (cachedResult && refresh) {
        const rateLimitDate = new Date(Date.now() - REFRESH_RATE_LIMIT);
        const isRecentlyRefreshed = cachedResult.updatedAt > rateLimitDate;
        if (isRecentlyRefreshed) {
          return res
            .status(429)
            .send({ ok: false, error: 'This ORCID id was recently refreshed, please try again in a few minutes.' });
        }
      }

      logger.info({}, 'No cached result found, or refresh triggered, fetching');
      const { data, status } = await axios.get<any, any>(`${ORCID_API_URL}/${orcidId}/public-record.json`, {});

      if (data?.lastModifiedTime === null) {
        return res.status(422).send({ ok: false, error: 'Invalid ORCID Id' });
      }

      if (status !== 200) {
        logger.warn({ status, data }, 'Error fetching ORCID profile');
        return res.status(status).send({ ok: false, error: 'Error fetching ORCID profile' });
      }

      const updateEntry = {
        profile: data,
        expiresIn: new Date(Date.now() + ORCID_PROFILE_TTL),
      };

      const upsertResult = await prisma.orcidProfile.upsert({
        where: { orcidId },
        update: updateEntry,
        create: { orcidId, ...updateEntry },
      });
      logger.info({ newExpiry: upsertResult.expiresIn }, 'Upserted ORCID profile');
      return res.status(200).send({ ok: true, profile: upsertResult.profile });
    }
  } catch (e) {
    logger.error({ e }, 'Error fetching ORCID profile');
    return res.status(500).send({ ok: false, error: 'Error fetching ORCID profile' });
  }
};
