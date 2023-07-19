import axios from 'axios';
import { Request, Response, NextFunction } from 'express';

import prisma from 'client';
import parentLogger from 'logger';

export const ORCID_API_URL = 'https://orcid.org';

interface OrcidQueryResponse {
  ok: boolean;
  profile: Record<any, any>;
}
interface OrcidQueryResponseError {
  ok: boolean;
  error: string;
}

export const orcidQuery = async (
  req: Request,
  res: Response<OrcidQueryResponse | OrcidQueryResponseError>,
  next: NextFunction,
) => {
  const { orcidId, refresh } = req.query;
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
      return res.status(200).send({ ok: true, profile: cachedResult });
    } else {
      //rate limit on refresh
      logger.info({}, 'No cached result found, or refresh triggered, fetching');
      const { data, status } = await axios.get<any, any>(`${ORCID_API_URL}/${orcidId}/public-record.json`, {});

      if (status !== 200) {
        logger.error({ status, data }, 'Error fetching ORCID profile');
        return res.status(status).send({ ok: false, error: 'Error fetching ORCID profile' });
      }

      const updateEntry = {
        profile: data,
        expiresIn: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day
      };

      const upsertResult = await prisma.orcidProfile.upsert({
        where: { orcidId },
        update: updateEntry,
        create: { orcidId, ...updateEntry },
      });
      logger.info({ newExpiry: upsertResult.expiresIn }, 'Upserted ORCID profile');
      return res.status(200).send({ ok: true, profile: upsertResult });
    }
  } catch (e) {
    logger.error({ e }, 'Error fetching ORCID profile');
    return res.status(500).send({ ok: false, error: 'Error fetching ORCID profile' });
  }
};
