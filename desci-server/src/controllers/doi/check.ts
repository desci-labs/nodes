import { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { DoiError } from '../../core/doi/error.js';
import {
  BadRequestError,
  RequestWithNode,
  SuccessResponse,
  doiService,
  ensureUuidEndsWithDot,
  logger as parentLogger,
} from '../../internal.js';

const pg = await import('pg').then((value) => value.default);
const { Pool } = pg;

const logger = parentLogger.child({ module: '/controllers/doi/check/' });
// console.log('DB', process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.OPEN_ALEX_DATABASE_URL,
  connectionTimeoutMillis: 5000,

  // options: '-c search_path=public',
});

pool
  .connect()
  .then(async (v) => {
    logger.info({ v }, 'Postgres Poll connected');
    const { rows } = await pool.query(
      'select pdf_url from openalex.works_best_oa_locations wboal left join openalex.works w on w.id = wboal.work_id where w.doi = $1',
      ['https://doi.org/10.1088/2058-9565/ac70f4'],
    );
    logger.info({ rows }, 'PDF URL');
  })
  .catch((err) => logger.error({ err }, 'Postgres pool Error'));

pool.on('error', (err, client) => {
  logger.error({ err }, 'Unexpected error on idle client');
  process.exit(-1);
});
// export const client = await pool.connect();

export const checkMintability = async (req: RequestWithNode, res: Response, _next: NextFunction) => {
  const { uuid } = req.params;
  if (!uuid) throw new BadRequestError();

  const logger = parentLogger.child({
    module: 'DOI::checkMintability',
  });

  try {
    await doiService.checkMintability(uuid);
    new SuccessResponse(true).send(res);
  } catch (err) {
    logger.error(err, 'module:: checkMintability');
    if (!(err instanceof DoiError)) {
      // TODO: Sentry error reporting
    }
    new SuccessResponse(false).send(res);
  }
};

export const retrieveDoi = async (req: Request, res: Response, _next: NextFunction) => {
  const { doi: doiQuery, uuid, dpid } = req.query;
  const identifier = doiQuery || uuid || dpid;

  if (!identifier) throw new BadRequestError();

  if (uuid) {
    const pending = await doiService.hasPendingSubmission(ensureUuidEndsWithDot(uuid as string));
    logger.info({ pending }, 'GET DOI');
    if (pending) {
      new SuccessResponse({ status: pending.status }).send(res);
      return;
    }
  }

  logger.info({ doiQuery }, 'Retrieve DOI');

  const doiLink = (doiQuery as string).startsWith('https') ? doiQuery : `https://doi.org/${doiQuery}`;
  // pull record from openalex database
  const { rows } = await pool.query(
    'select pdf_url from openalex.works_best_oa_locations wboal left join openalex.works w on w.id = wboal.work_id where w.doi = $1',
    [doiLink],
  );

  logger.info({ rows }, 'OPEN ALEX QUERY');
  const doi = await doiService.findDoiRecord(identifier as string);
  const data = _.pick(doi, ['doi', 'dpid', 'uuid']);
  new SuccessResponse({ doi, pdf: rows?.[0].pdf_url, ...data }).send(res);
};
