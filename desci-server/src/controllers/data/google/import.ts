import { Request, Response } from 'express';

import { logger as parentLogger } from '../../../logger.js';
import { processS3DataToIpfs } from '../../../services/data/processing.js';
import {
  GoogleApiService,
  googleDocsExportMap,
  googleDocsMimeExtensionConversionMap,
} from '../../../services/googleApiService.js';
import { ErrorResponse, UpdateResponse } from '../update.js';

interface GoogleImportReqBody {
  uuid: string;
  contextPath: string;
  googleFileId: string;
  gAuthAccessToken: string; // We can change this to use the oauth backend flow in the future
}

export const googleImport = async (
  req: Request<any, any, GoogleImportReqBody>,
  res: Response<UpdateResponse | ErrorResponse>,
) => {
  const owner = (req as any).user;
  const node = (req as any).node;

  const { uuid, contextPath, googleFileId, gAuthAccessToken } = req.body;
  if (contextPath === undefined) return res.status(400).json({ error: 'contextPath is required' });
  if (googleFileId === undefined) return res.status(400).json({ error: 'googleFileId is required' });
  if (gAuthAccessToken === undefined) return res.status(400).json({ error: 'gAuthAccessToken is required' });

  const logger = parentLogger.child({
    module: 'DATA::GoogleImportController',
    uuid: uuid,
    user: owner.id,
    contextPath: contextPath,
    googleFileId,
  });
  const googleService = new GoogleApiService(gAuthAccessToken);
  // googleService.exchangeCodeForToken(gAuthAccessToken);
  const fileMd = await googleService.getFileMetadata(googleFileId);

  const isGoogleDoc = googleDocsExportMap.hasOwnProperty(fileMd.mimeType);
  let fileStream;
  let fileName = fileMd.name;

  if (isGoogleDoc) {
    const exportMimeType = googleDocsExportMap[fileMd.mimeType];
    fileStream = await googleService.exportFile(googleFileId, exportMimeType);
    fileName = fileMd.name + '.' + googleDocsMimeExtensionConversionMap[fileMd.mimeType];
  } else {
    fileStream = await googleService.getFileStream(googleFileId);
  }
  // debugger;
  const files = [
    {
      originalname: '/' + fileName,
      content: fileStream,
      // If unset (should only happen on folders and links, which prob don't work anyway), pass undefined instead of NaN
      size: Number(fileMd.size) || undefined,
    },
  ];
  const { ok, value } = await processS3DataToIpfs({
    files,
    user: owner,
    node,
    contextPath,
  });
  if (ok) {
    const {
      rootDataCid: newRootCidString,
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    } = value as UpdateResponse;
    return res.status(200).json({
      rootDataCid: newRootCidString,
      manifest: updatedManifest,
      manifestCid: persistedManifestCid,
      tree: tree,
      date: date,
    });
  } else {
    if (!('message' in value)) return res.status(500);
    logger.error({ value }, 'processing error occured');
    return res.status(value.status).json({ status: value.status, error: value.message });
  }
  // return res.status(400);
};
