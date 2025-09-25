import { ResearchObjectHistory, streams } from '@desci-labs/desci-codex-lib';
import axios from 'axios';
import { errWithCause } from 'pino-std-serializers';

import { logger as parentLogger } from '../logger.js';

const logger = parentLogger.child({
  module: 'Service::Codex',
});

const DPID_RESOLVER_URL = process.env.DPID_URL_OVERRIDE ?? 'https://beta.dpid.org';

const getStreamResolutionUrl = (streamId: string) => `${DPID_RESOLVER_URL}/api/v2/resolve/codex/${streamId}`;

const getDpidResolutionUrl = (dpid: number) => `${DPID_RESOLVER_URL}/api/v2/resolve/dpid/${dpid}`;

export const streamLookup = async (streamId: string): Promise<ResearchObjectHistory> => {
  try {
    const result = await axios.get<ResearchObjectHistory>(getStreamResolutionUrl(streamId), { timeout: 5_000 });
    logger.info(result.data, 'resolved stream');
    return result.data;
  } catch (e) {
    logger.error(errWithCause(e), 'Resolver stream lookup failed');
    throw new Error('Failed to call resolver', { cause: e });
  }
};

export const dpidLookup = async (dpid: number): Promise<ResearchObjectHistory> => {
  try {
    const result = await axios.get<ResearchObjectHistory>(getDpidResolutionUrl(dpid));
    logger.info(result.data, 'resolved dpid');
    return result.data;
  } catch (e) {
    logger.error(errWithCause(e), 'Resolver dpid lookup failed');
    throw new Error('Failed to call resolver', { cause: e });
  }
};

/**
 * Get timestamps, if anchored, for each commit ID.
 */
export const getCommitTimestamps = async (commitIds: string[]): Promise<Record<string, string>> => {
  if (commitIds.length === 0) {
    return {};
  }

  logger.debug({ commitIds }, 'getting timestamps from resolver');

  const uniqueStreamIds = [...new Set(commitIds.map((id) => streams.CommitID.fromString(id).baseID.toString()))];

  let histories: ResearchObjectHistory[];
  try {
    const result = await axios.post<ResearchObjectHistory[]>(`${DPID_RESOLVER_URL}/api/v2/query/history`, {
      ids: uniqueStreamIds,
    });
    histories = result.data;
  } catch (e) {
    logger.error({ error: errWithCause(e) }, 'Timestamp lookup failed');
    throw new Error('Failed to call resolver', { cause: e });
  }

  const commitTimestampMap: Record<string, string> = {};
  for (const stream of histories) {
    for (const version of stream.versions) {
      if (commitIds.includes(version.version)) {
        commitTimestampMap[version.version] = version.time?.toString();
      }
    }
  }

  logger.debug({ commitTimestampMap }, 'returning commit timestamps');
  return commitTimestampMap;
};
