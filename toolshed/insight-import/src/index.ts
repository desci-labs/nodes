import 'dotenv/config'
import { Convert, IJMetadata } from './ijTypes.js';
import { makeNode } from './nodes.js';
import {NODESLIB_CONFIGS, setApiKey, setNodesLibConfig} from '@desci-labs/nodes-lib';
import {readdir, readFile} from "node:fs/promises";
import { join } from 'path';
import {signerFromPkey} from "@desci-labs/nodes-lib/dist/util/signing.js";

const PUBLISH_PKEY = process.env.PUBLISH_PKEY;
const API_TOKEN = process.env.NODES_API_TOKEN;

if (![PUBLISH_PKEY, API_TOKEN].every(Boolean)) {
  console.log('Expected PUBLISH_PKEY and API_TOKEN to both be set in .env');
  process.exit(1);
}
export const SIGNER = signerFromPkey(PUBLISH_PKEY);

const ENVS = ['local', 'dev', 'prod'];
const ENV = process.env.ENV || 'local';
if (!ENVS.includes(ENV)) {
  console.log(`Expected ENV to be in ${ENVS}, but got ${ENV}`);
  process.exit(1);
}

setNodesLibConfig(NODESLIB_CONFIGS[ENV]);
setApiKey(API_TOKEN);

const processPublications = async (rootDir: string) => {
  const pubs: Record<string, IJMetadata> = {};
  const pubDirs = await readdir(rootDir);

  for (const pubDir of pubDirs) {
    const metadataPath = join(rootDir, pubDir, 'metadata.json');
    const rawMetadata = await readFile(metadataPath, 'utf8');
    pubs[pubDir] = Convert.toIJMetadata(rawMetadata);
  }

  return pubs;
}

const pubs = await processPublications('local-data/publications');
for (const [pub, metadata] of Object.entries(pubs).slice(0,1)) {
  await makeNode(metadata)
}
