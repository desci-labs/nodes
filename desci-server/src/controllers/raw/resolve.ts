import {
  CodeComponent,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import axios from 'axios';
import { ethers } from 'ethers';
import { NextFunction, Request, Response } from 'express';

import { decodeBase64UrlSafeToHex, hexToCid } from '@/../utils';
import parentLogger from 'logger';
import { getIndexedResearchObjects } from 'theGraph';

import goerli from '../../desci-contracts-artifacts/contracts/ResearchObject.sol/ResearchObject.json';
import localhost from '../../desci-contracts-artifacts/contracts/ResearchObject.sol/ResearchObject.json';
import goerliInfo from '../../desci-contracts-config/goerli-research-object.json';
import localhostInfo from '../../desci-contracts-config/unknown-research-object.json';

const IPFS_RESOLVER_OVERRIDE = process.env.IPFS_RESOLVER_OVERRIDE || '';
//change
export const directChainCall = async (decodedUuid: string) => {
  let provider;
  try {
    provider = new ethers.providers.JsonRpcProvider(
      process.env.NODE_ENV === 'production'
        ? 'https://eth-goerli.g.alchemy.com/v2/ZeIzCAJyPpRnTtPNSmddHGF-q2yp-2Uy'
        : 'http://host.docker.internal:8545',
    );
    const bn = await provider.getBlockNumber();
  } catch (err) {
    throw Error('failed to connect to blockchain RPC');
  }

  const compiled = process.env.NODE_ENV === 'production' ? goerli : localhost;
  const deployed = process.env.NODE_ENV === 'production' ? goerliInfo : localhostInfo;
  const deployedAddress = deployed.proxies[deployed.proxies.length - 1].address;

  const researchObjectContract = new ethers.Contract(deployedAddress, compiled.abi, provider);
  // debugger;
  const eventFilter = researchObjectContract.filters.VersionPush();

  const events = await researchObjectContract.queryFilter(eventFilter);

  const version = events.reverse().find((e) => e.args._uuid._hex == decodedUuid);
  return {
    recentCid: version.args._cid,
    versions: events.reverse().map((e) => ({
      cid: e.args._cid,
    })),
  };
};

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
  const uuid = req.params.query; // TODO: check if we need a dot here
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
  // const node = await prisma.node.findFirst({
  //   where: { uuid },
  // });
  // const version = await prisma.nodeVersion.findFirst({
  //   where: {
  //     nodeId: node.id,
  //     transactionId: {
  //       not: null,
  //     },
  //   },
  // });
  const deployed = process.env.NODE_ENV === 'production' ? goerliInfo : localhostInfo;
  const deployedAddress = deployed.proxies[0].address;
  let graphOk = false;
  let result;
  try {
    const { researchObjects } = await getIndexedResearchObjects([uuid]);
    result = researchObjects[0];
    result.versions.reverse();
    graphOk = true;
  } catch (err) {
    logger.warn({ err }, `[ERROR] graph lookup fail ${err.message}`);
  }

  if (!result) {
    // indexer down
    // attempt to read off chain directly
    logger.warn({ result }, 'resolver: empty result or indexer down');
    // try {
    //   const chainData = await directChainCall(decodedUuid);
    //   result = chainData;
    // } catch (err) {
    //   console.error('onchain lookup fail');
    res.status(404).send({
      ok: false,
      msg: `resource not found via smart contract event log`,
      address: deployedAddress,
      graphIndex: graphOk,
      decodedUuid,
      env: process.env.NODE_ENV,
    });
    return;
    // }
  }

  // console.log('VERSION', version.args._cid);

  const ipfsResolver = IPFS_RESOLVER_OVERRIDE || req.query.g || 'https://ipfs.desci.com/ipfs';
  // TODO: add whitelist of resolvers

  if (!firstParam || !firstParam.trim().length) {
    // user requests latest version
    const targetCid = result.recentCid;
    const cidString = hexToCid(targetCid);
    try {
      logger.info(`Calling IPFS Resolver ${ipfsResolver} for CID ${cidString}`);
      const { data } = await axios.get(`${ipfsResolver}/${cidString}`);
      res.send(data);
    } catch (err) {
      res.status(500).send({ ok: false, msg: 'ipfs uplink failed, try setting ?g= querystring to resolver' });
    }
    return;
  }

  // user either requests version by index or a cid
  // user requests latest version
  let cidString;

  if (firstParam.length < 10) {
    // assume version by index
    logger.info(`parsing ${firstParam} as index`);
    const index = parseInt(firstParam);
    cidString = result.versions[index]?.cid;
    if (!cidString) {
      res.status(404).send({
        ok: false,
        msg: `version index ${index} [${firstParam}] not found on object`,
        address: deployedAddress,
        graphIndex: true,
        decodedUuid,
        env: process.env.NODE_ENV,
        result,
      });
      return;
    }
    cidString = hexToCid(cidString);
  } else {
    // assume version by cid
    const version = result.versions.find((v) => hexToCid(v.cid) === firstParam);
    if (!version) {
      res.status(404).send({
        ok: false,
        msg: `version cid ${firstParam} not found on object`,
        address: deployedAddress,
        graphIndex: true,
        decodedUuid,
        env: process.env.NODE_ENV,
        result,
      });
      return;
    }
    cidString = hexToCid(version.cid);
  }
  const { data } = await axios.get(`${ipfsResolver}/${cidString}`, { headers: { 'Bypass-Tunnel-Reminder': true } });
  if (!secondParam) {
    res.send(data);
    return;
  }

  // process as json path if starts with dot
  if (secondParam.charAt(0) == '.') {
    // process as JSONpath
    res.status(500).send({ ok: false, msg: 'jsonpath coming soon' });
    return;
  } else {
    // process as component id
    const ro = data as ResearchObjectV1;
    const component = ro.components[parseInt(secondParam)] as ResearchObjectV1Component;
    if (!component) {
      res
        .status(400)
        .send({ err: true, msg: `could not resolve component index ${parseInt(secondParam)} [${secondParam}]` });
      return;
    }
    switch (component.type) {
      case ResearchObjectComponentType.PDF:
        res.send(component);
        return;
      case ResearchObjectComponentType.CODE:
        const codeComponent = component as CodeComponent;
        logger.debug('is code component');
        if (!thirdParam) {
          res.send(component);
          return;
        }
        if (thirdParam == '!') {
          logger.debug('recognize zip');
          //send the zip
          axios.get(`${ipfsResolver}/${codeComponent.payload.url}`, { responseType: 'stream' }).then((response) => {
            // The response will give you the zip file
            response.data.pipe(res);
          });

          return;
        }
        // send the individual file
        try {
          const targetUrl = `https://raw.githubusercontent.com/${
            codeComponent.payload.externalUrl.split('github.com/')[1]
          }/${[thirdParam, ...rest].filter(Boolean).join('/')}`;
          const { data } = await axios.get(targetUrl);
          res.header('content-type', 'text/plain').send(data);
        } catch (err) {
          res
            .status(400)
            .send({ ok: false, msg: `fail to resolve ${[thirdParam, ...rest].filter(Boolean).join('/')}` });
        }
        return;
      default:
        res
          .status(400)
          .send({ err: true, msg: `could not find the appropriate resolver for component ${component.type}` });
        return;
    }
  }

  // res.send({ ok: true, decodedUuid, cidString });
};
