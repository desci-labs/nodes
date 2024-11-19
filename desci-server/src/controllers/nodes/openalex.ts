import { Request, Response } from 'express';
import { z } from 'zod';

import { SuccessResponse } from '../../core/ApiResponse.js';
import { logger as parentLogger } from '../../logger.js';
import { OpenAlexWork, transformInvertedAbstractToText } from '../../services/AutomatedMetadata.js';
import { OpenAlexService } from '../../services/OpenAlexService.js';
import { WorksDetails } from '../doi/check.js';
const pg = await import('pg').then((value) => value.default);
const { Client } = pg;

export const GetWorkParamSchema = z.object({
  workId: z.string(),
});

export interface ErrorResponse {
  error: string;
  details?: z.ZodIssue[] | string;
}

/*
 ** Takes an openAlex workId as a route param and returns its metadata
 */
export const getOpenAlexWork = async (
  req: Request & { params: z.infer<typeof GetWorkParamSchema> },
  res: Response<WorksDetails | ErrorResponse>,
) => {
  const logger = parentLogger.child({
    module: 'OpenAlexWork::GetWork',
    params: req.params,
  });

  logger.info(`Fetching OpenAlex work: ${req.params.workId}`);

  try {
    let { workId } = GetWorkParamSchema.parse(req.params);

    workId = workId.toUpperCase();
    if (!workId.startsWith('https://openalex.org/')) workId = 'https://openalex.org/' + workId;

    const workMetadata = await OpenAlexService.getMetadataByWorkId(workId);

    logger.info({ workMetadata, workId }, 'OPEN ALEX QUERY success via workId');

    return new SuccessResponse(workMetadata).send(res);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn({ error: error.errors }, 'Invalid request parameters');
      return res.status(400).json({ error: 'Invalid request parameters', details: error.errors });
    }
    logger.error({ error }, 'Error fetching OpenAlex work');
    return res.status(500).json({ error: 'Internal server error' });
  }
};
