import { getNodesLibInternalConfig, NODESLIB_CONFIGS, setNodesLibConfig, type NodesEnv } from '@desci-labs/nodes-lib';
import { providers, utils } from 'ethers'
import { encode as base64UrlEncode, trim } from 'url-safe-base64';

const getRegistryReaderForEnv = (env: NodesEnv) => {
  setNodesLibConfig({ ...NODESLIB_CONFIGS[env], apiKey: 'bleh' });
  const provider = new providers.JsonRpcProvider(
    getNodesLibInternalConfig().legacyChainConfig.rpcUrl
  );
  return getNodesLibInternalConfig().legacyChainConfig.dpidRegistryConnector(provider);
}

type DpidRegistry = ReturnType<typeof getRegistryReaderForEnv>

function hexToUrlSafeBase64(hex: string): string {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const buf = Buffer.from(cleanHex, 'hex');
  const base64 = buf.toString('base64');
  return trim(base64UrlEncode(base64));
}

const getUuidFromDpid = async (registry: DpidRegistry, dpid: number) =>
  await registry.get(utils.formatBytes32String('beta'), dpid);

const scanRegistry = async (reader: DpidRegistry) => {
  const dpidToUuid: Record<number, string> = {};
  const startDpid = 0;
  const BATCH_SIZE = 100;
  let currentDpid = startDpid;

  while (true) {
    // Create batch of promises
    const batchPromises = Array.from({ length: BATCH_SIZE }, async (_, i) => {
      const dpid = currentDpid + i;
      try {
        const uuid = await getUuidFromDpid(reader, dpid);
        return ({ dpid, hex: uuid.toHexString() });
      } catch (err) {
        console.error(`Error fetching DPID ${dpid}:`, err);
        throw err;
      }
    });

    // Execute batch in parallel
    const results = await Promise.all(batchPromises);

    // Check if we've reached the end
    const endIndex = results.findIndex(result => result.hex === '0x00');
    if (endIndex !== -1) {
      // Add all valid results up to the end
      results.slice(0, endIndex).forEach(({ dpid, hex }) => {
        dpidToUuid[dpid] = hexToUrlSafeBase64(hex);
      });
      console.log(`Reached end of legacy registry at DPID ${currentDpid + endIndex - 1}`);
      break;
    }

    // Add all results from this batch
    results.forEach(({ dpid, hex }) => {
      dpidToUuid[dpid] = hexToUrlSafeBase64(hex);
    });

    currentDpid += BATCH_SIZE;
    console.log(`Scanned DPIDs ${currentDpid - BATCH_SIZE} to ${currentDpid - 1}`);
  }

  return dpidToUuid;
}

const dev = await scanRegistry(getRegistryReaderForEnv('dev'));
const prod = await scanRegistry(getRegistryReaderForEnv('prod'));

console.log('Finished scanning dPIDs:', JSON.stringify({ dev, prod }, undefined, 2));
