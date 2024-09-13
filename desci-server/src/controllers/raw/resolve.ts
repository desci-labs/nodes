import {
  CodeComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import axios from 'axios';
import { NextFunction, Request, Response } from 'express';
import { logger as parentLogger } from '../../logger.js';
import { getIndexedResearchObjects, IndexedResearchObject } from '../../theGraph.js';
import { decodeBase64UrlSafeToHex, hexToCid } from '../../utils.js';

const IPFS_RESOLVER_OVERRIDE = process.env.IPFS_RESOLVER_OVERRIDE || '';

export const resolve = async (req: Request, res: Response, next: NextFunction) => {
  /**
   * DCITE resolution scheme
   *
   * resolve/{BASE64-url safe UUID} ==> get latest manifest
   * resolve/{BASE64-url safe UUID}/{CID} ==> get manifest for this version
   * resolve/{BASE64-url safe UUID}/:version ==> get manifest for this version 0-indexed chronological
   *
   * any of the above support the following suffix resolution
   * .../:index/:JSONPATH (component index from manifest) ==>
   * or
   * .../:JSONPATH
   *                          if pdf component, send PDF
   *                          if code component, parse file tree suffix after slash and send code text for specified file
   */
  const uuid = req.params.query;
  const decodedUuid = '0x' + decodeBase64UrlSafeToHex(uuid);
  const [firstParam, secondParam, thirdParam, ...rest] = req.params[0]?.substring(1).split('/');
  const logger = parentLogger.child({
    // id: req.id,
    module: 'RAW::resolveController',
    body: req.body,
    uuid,
    params: req.params,
    firstParam,
    secondParam,
    thirdParam,
    remainderParams: rest,
    user: (req as any).user,
  });
  logger.debug(`[resolve::resolve] firstParam=${firstParam} secondParam=${secondParam}`);

  let result: IndexedResearchObject;
  try {
    const res = await getIndexedResearchObjects([uuid]);
    result = res.researchObjects[0];
  } catch (err) {
    logger.warn({ err }, `[ERROR] index lookup failed: ${err.message}`);
  };

  if (!result) {
    logger.warn({ uuid, result }, 'empty result or indexer down');
    return res.status(404).send({
      ok: false,
      msg: `resource not found`,
      decodedUuid,
      env: process.env.NODE_ENV,
    });
  };

  // Flip history to chronological
  result.versions.reverse();

  const ipfsResolver = IPFS_RESOLVER_OVERRIDE || req.query.g || 'https://ipfs.desci.com/ipfs';
  // TODO: add whitelist of resolvers

  if (!firstParam || !firstParam.trim().length) {
    // user requests latest version
    const targetCid = result.recentCid;
    const cidString = hexToCid(targetCid);
    try {
      logger.info(`Calling IPFS Resolver ${ipfsResolver} for CID ${cidString}`);
      const { data } = await axios.get(`${ipfsResolver}/${cidString}`);
      return res.send(data);
    } catch (err) {
      return res.status(500).send({ ok: false, msg: 'ipfs uplink failed, try setting ?g= querystring to resolver' });
    };
  };

  // user either requests version by index or a cid
  // user requests latest version
  let cidString;

  if (firstParam.length < 10) {
    // assume version by index
    logger.info(`parsing ${firstParam} as index`);
    const index = parseInt(firstParam);
    cidString = result.versions[index]?.cid;
    if (!cidString) {
      return res.status(404).send({
        ok: false,
        msg: `version index ${index} [${firstParam}] not found on object`,
        graphIndex: true,
        decodedUuid,
        env: process.env.NODE_ENV,
        result,
      });
    };

    cidString = hexToCid(cidString);
  } else {
    // assume version by cid
    const version = result.versions.find((v) => hexToCid(v.cid) === firstParam);
    if (!version) {
      return res.status(404).send({
        ok: false,
        msg: `version cid ${firstParam} not found on object`,
        graphIndex: true,
        decodedUuid,
        env: process.env.NODE_ENV,
        result,
      });
    };
    cidString = hexToCid(version.cid);
  };

  const { data } = await axios.get(
    `${ipfsResolver}/${cidString}`,
    { headers: { 'Bypass-Tunnel-Reminder': true } }
  );

  if (!secondParam) {
    logger.info("Returning manifest as there is no additional path");
    return res.send(data);
  };

  // process as json path if starts with dot
  if (secondParam.charAt(0) == '.') {
    logger.info(`Path interpreted as JSONPath (${secondParam})`);
    return res.status(500).send({ ok: false, msg: 'jsonpath coming soon' });
  } else {
    logger.info(`Path interpreted as component ID (${secondParam})`);
    const ro = data as ResearchObjectV1;
    const component = ro.components[parseInt(secondParam)] as ResearchObjectV1Component;

    if (!component) {
      logger.info(
        { components: ro.components, index: secondParam },
        `Could not resolve index in components`,
      );
      return res
        .status(400)
        .send({
          err: true,
          msg: `could not resolve component index ${secondParam} in ${ro.components}`,
        });
    };

    switch (component.type) {
      case ResearchObjectComponentType.PDF:
        return res.send(component);
      case ResearchObjectComponentType.CODE:
        const codeComponent = component as CodeComponent;
        if (!thirdParam) {
          return res.send(component);
        };

        if (thirdParam == '!') {
          logger.debug('recognize zip');
          //send the zip
          return axios.get(
            `${ipfsResolver}/${codeComponent.payload.url}`,
            { responseType: 'stream' }
          ).then((response) => {
            // The response will give you the zip file
            response.data.pipe(res);
          });
        };

        // send the individual file
        try {
          const targetUrl = `https://raw.githubusercontent.com/${
            codeComponent.payload.externalUrl.split('github.com/')[1]
          }/${[thirdParam, ...rest].filter(Boolean).join('/')}`;
          const { data } = await axios.get(targetUrl);
          return res.header('content-type', 'text/plain').send(data);
        } catch (err) {
          return res
            .status(400)
            .send({ ok: false, msg: `fail to resolve ${[thirdParam, ...rest].filter(Boolean).join('/')}` });
        };
      default:
        return res
          .status(400)
          .send({ err: true, msg: `could not find the appropriate resolver for component ${component.type}` });
    };
  };
};
