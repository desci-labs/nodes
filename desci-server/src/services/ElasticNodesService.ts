/*
 ** This service contains functionality for indexing published nodes on ElasticSearch
 */

import { ResearchObjectV1, ResearchObjectV1Author } from '@desci-labs/desci-models';
import { Node } from '@prisma/client';
import axios from 'axios';

import { prisma } from '../client.js';
import { PUBLIC_IPFS_PATH } from '../config/index.js';
import { elasticWriteClient } from '../elasticSearchClient.js';
import { logger as parentLogger } from '../logger.js';
import { getFromCache, setToCache } from '../redisClient.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { getFirstManuscript } from '../utils/manifest.js';
import { ensureUuidEndsWithDot, hexToCid, unpadUuid } from '../utils.js';

import { getManifestByCid, getManifestFromNode } from './data/processing.js';
import { searchEsAuthors } from './ElasticSearchService.js';
import { getDpidFromNode, NoveltyScoreConfig } from './node.js';
import { OpenAlexService } from './OpenAlexService.js';

export const NODES_INDEX = 'works_nodes_v1';
const NODES_ID_PREFIX = 'nodes/';

const logger = parentLogger.child({ module: 'Services::ElasticNodesService' });

const IPFS_URL = PUBLIC_IPFS_PATH; // Confusing, but refers to priv swarm IPFS public gateway
const PUB_IPFS_URL = process.env.PUBLIC_IPFS_RESOLVER || 'https://pub.desci.com/ipfs';

const SERVER_ENV_ES_NATIVE_WORKS_INDEX_MAP = {
  'http://localhost:5420': 'works_native_local',
  'https://nodes-api-dev.desci.com': 'works_native_dev',
  'https://nodes-api.desci.com': 'works_native_prod',
};

export const NATIVE_WORKS_INDEX =
  SERVER_ENV_ES_NATIVE_WORKS_INDEX_MAP[process.env.SERVER_URL || 'https://localhost:5420'];

const DPID_ENV_MAPPING = {
  'http://localhost:5420': 'http://localhost:5460/',
  'https://nodes-api-dev.desci.com': 'https://dev-beta.dpid.org/',
  'https://nodes-api.desci.com': 'https://beta.dpid.org/',
};

const DPID_RESOLVER_URL =
  process.env.DPID_URL_OVERRIDE || DPID_ENV_MAPPING[process.env.SERVER_URL || 'https://localhost:5420'];

type IndexResearchObjectContext = {
  manifest: ResearchObjectV1;
  dpid?: string | number;
};

async function indexResearchObject(nodeUuid: string, indexContext?: IndexResearchObjectContext) {
  nodeUuid = unpadUuid(nodeUuid);
  try {
    const workId = NODES_ID_PREFIX + nodeUuid;

    const workData = await fillNodeData(nodeUuid, indexContext);

    await elasticWriteClient.index({
      index: NATIVE_WORKS_INDEX,
      id: encodeURIComponent(workId),
      document: {
        work_id: workId,
        ...workData,
        '@timestamp': new Date(),
      },
      refresh: true, // ensures immediate indexing
    });
    logger.info(`Indexed work: ${workId}`);
    return { success: true };
  } catch (error) {
    logger.error({ error }, 'Error indexing work:');
    return {
      success: false,
      nodeUuid,
      error: error?.message,
    };
  }
}

async function fillNodeData(nodeUuid: string, indexContext?: IndexResearchObjectContext) {
  const node = await prisma.node.findFirst({
    where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
    include: { DoiRecord: true },
  });
  if (!node) throw new Error(`Node not found for uuid ${nodeUuid}`);

  const manifest = indexContext?.manifest ?? (await getManifestFromNode(node)).manifest;
  let latestManifest = manifest;
  let firstVersionTime = new Date();

  if (indexContext) {
    const firstPublishedNodeVersion = await prisma.nodeVersion.findFirst({
      where: {
        nodeId: node.id,
        OR: [{ transactionId: { not: null } }, { commitId: { not: null } }],
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        createdAt: true,
      },
    });

    if (firstPublishedNodeVersion?.createdAt) {
      firstVersionTime = firstPublishedNodeVersion.createdAt || new Date();
    }
  } else {
    const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
    const researchObject = researchObjects[0];
    if (!researchObject) {
      throw new Error(`No resolver history found for node ${nodeUuid}`);
    }
    const versions = researchObject.versions;
    const firstVersion = versions.at(-1);
    firstVersionTime = new Date(parseInt(firstVersion?.time) * 1000);
    const latestPublishedManifestCid = hexToCid(researchObject.recentCid);
    latestManifest = await getManifestByCid(latestPublishedManifestCid);
  }

  const firstManuscript = getFirstManuscript(manifest);
  if (!firstManuscript) throw 'Manifest does not contain a manuscript';
  let dpid = indexContext?.dpid ?? (await getDpidFromNode(node, manifest));

  // To prevent collisions on dpid 500 with other devs, we add a namespace to the dpid
  // as the index for local-dev is shared.
  if (process.env.SERVER_URL === 'http://localhost:5420') {
    const dpidNamespace = process.env.ELASTIC_SEARCH_LOCAL_DEV_DPID_NAMESPACE;
    if (!dpidNamespace) {
      logger.warn(
        'ELASTIC_SEARCH_LOCAL_DEV_DPID_NAMESPACE is not set, your ES indexed works may collide with other devs.',
      );
    } else {
      logger.info(`Using dpid namespace ${dpidNamespace} for local-dev`);
      dpid = dpidNamespace + dpid;
    }
  }

  const doi = node?.DoiRecord?.[0]?.doi;
  let publication_year = firstVersionTime?.getFullYear().toString() || new Date().getFullYear().toString();
  const citedByCount = 0; // Get from external publication data

  if (isNaN(parseInt(publication_year))) {
    publication_year = new Date().getFullYear().toString();
  }

  if (isNaN(parseInt(firstVersionTime.getTime().toString()))) {
    // Can be NaN if ceramic timestamp isn't available yet
    firstVersionTime = new Date();
  }

  const [authors, aiData, best_locations] = await Promise.all([
    fillAuthorData(manifest.authors).catch((err) => logger.error({ err, nodeUuid }, 'Error filling author data')),
    getAiData(manifest, true).catch((err) => {
      logger.error({ err, nodeUuid }, 'Error getting AI data');
      throw 'Failed getting AI data';
    }),
    fillBestLocationsData(latestManifest, dpid).catch((err) =>
      logger.error({ err, nodeUuid }, 'Error filling best locations data'),
    ),
  ]);

  const concepts = formatConceptsData(aiData?.concepts);
  const topics = await fillTopicsData(aiData?.topics);

  const workData = {
    title: node.title,
    doi,
    dpid,
    type: 'preprint',
    abstract: manifest.description,
    cited_by_count: citedByCount,
    publication_year,
    publication_date: firstVersionTime,
    is_retracted: false,
    is_paratext: false,
    language: 'en', // Later update with some ML tool
    content_novelty_percentile: aiData ? aiData.contentNovelty?.percentile : 0,
    context_novelty_percentile: aiData ? aiData.contextNovelty?.percentile : 0,
    content_novelty_percentile_last_updated: aiData.generationDate,
    context_novelty_percentile_last_updated: aiData.generationDate,
    best_locations,
    authors,
    concepts,
    topics,
  };

  return workData;
}

async function fillAuthorData(manifestAuthors: ResearchObjectV1Author[]) {
  try {
    const nameOrcids = manifestAuthors?.map((a) => ({
      display_name: a.name,
      ...(a.orcid ? { orcid: a.orcid } : {}),
    }));

    const oaMatches = await searchEsAuthors(nameOrcids);
    logger.info('Search results:', oaMatches);
    const authors = oaMatches?.responses?.map((res) => {
      const hits = res.hits?.hits;
      const firstHit = hits?.[0];
      return {
        ...firstHit?._source,
        author_id: firstHit?._id,
      };
    });

    return authors;
  } catch (error) {
    logger.error('Error in fillAuthorData:', error);
    throw error;
  }
}

async function fillBestLocationsData(manifest: ResearchObjectV1, dpid: string | number) {
  const license = manifest.defaultLicense;
  const works_count = 0;

  const firstManuscript = getFirstManuscript(manifest);
  if (!firstManuscript) return [];
  const firstManuscriptCid = firstManuscript.payload.cid || firstManuscript.payload.url; // Old PDF payloads used .url field for CID

  const pubDataRefEntry = await prisma.publicDataReference.findFirst({ where: { cid: firstManuscriptCid } });
  const isExternal = pubDataRefEntry?.external ? true : false;

  const pdfUrl = isExternal ? `${PUB_IPFS_URL}/${firstManuscriptCid}` : `${IPFS_URL}/${firstManuscriptCid}`;

  const best_locations = [
    {
      license,
      cited_by_count: 0,
      publisher: 'Desci Labs',
      pdf_url: pdfUrl,
      is_oa: true,
      source_id: DPID_RESOLVER_URL + dpid,
      display_name: 'Desci Labs',
      works_count,
      version: 'preprint',
    },
  ];
  return best_locations;
}

function formatConceptsData(rawConcepts: AiData['concepts']) {
  if (!rawConcepts) return [];

  const concepts = rawConcepts.concept_ids?.map((conceptId, i) => ({
    concept_id: conceptId,
    display_name: rawConcepts.concept_names[i],
  }));

  return concepts;
}

async function fillTopicsData(rawTopics: AiData['topics']) {
  if (!rawTopics) return [];

  const dbTopics = await OpenAlexService.getTopicsByIds(rawTopics.topic_ids);
  const formattedTopics = dbTopics?.map((topic) => ({
    ...topic,
    topic_id: topic.id,
  }));

  return formattedTopics;
}

interface AiApiResult {
  UploadedFileName: string;
  status: 'SUCCEEDED' | 'RUNNING' | 'FAILED';
  result: {
    predictions: {
      content: { novelty_score: number; percentile: number };
      context: { novelty_score: number; percentile: number };
    };
    info: string;
  };
  modelVersion?: string;
  apiVersion?: string;
  concepts?: {
    concept_ids: string[];
    concept_scores: number[];
    concept_names: string[];
  };
  topics?: {
    topic_ids: string[];
    topic_scores: number[];
    topic_names: string[];
  };
  references?: {
    work_ids: string[];
    source_ids: string[];
    source_names: string[];
    source_scores: number[];
  };
  error?: string;
  generationDate?: Date;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

type AiData = {
  contentNovelty: AiApiResult['result']['predictions']['content'];
  contextNovelty: AiApiResult['result']['predictions']['context'];
  concepts: AiApiResult['concepts'];
  topics: AiApiResult['topics'];
  references: AiApiResult['references'];
  generationDate: Date;
};

const AI_DATA_CACHE_PREFIX = 'AI-';

async function getAiData(manifest: ResearchObjectV1, useCache: boolean): Promise<AiData | null> {
  try {
    const firstManuscript = getFirstManuscript(manifest);
    if (!firstManuscript) return null;
    const firstManuscriptCid = firstManuscript.payload?.cid || firstManuscript.payload?.url; // Old PDF payloads used .url field for CID

    if (!firstManuscriptCid) return null;

    const cacheKey = AI_DATA_CACHE_PREFIX + firstManuscriptCid;
    if (useCache) {
      // Check if AI data is already cached for this manuscript
      const cachedData = await getFromCache(cacheKey);
      if (cachedData) {
        return cachedData as AiData;
      }
    }

    const pubDataRefEntry = await prisma.publicDataReference.findFirst({ where: { cid: firstManuscriptCid } });
    const isExternal = pubDataRefEntry?.external ? true : false;

    const sendCidUrl = `${process.env.AI_CID_SEND_SERVER}/v1/send-cid?cid=${firstManuscriptCid}${
      isExternal ? '&external=true' : '&external=false'
    }&force_run=false`;

    const sendCidRes = await axios.get(sendCidUrl as string);

    const urlData = sendCidRes.data as {
      message: {
        UploadedFileName: { novelty_api: string; full_ref_api: string };
      };
    };

    const { UploadedFileName } = urlData.message;
    if (!UploadedFileName) {
      logger.error({ urlData }, 'Error getting AI data, missing UploadedFileName');
      return null;
    }

    const resultUrl = `${process.env.SCORE_RESULT_API}/prod/get-result?UploadedFileName=${UploadedFileName.novelty_api}`;
    let resultRes;
    await delay(2000); // Wait for the file to be available in the lambda service
    let retries = 15;
    do {
      try {
        retries--;
        resultRes = await axios.get(resultUrl);
        await delay(1500);
      } catch (e) {
        if (e.response?.data?.message === 'No item found with that UploadedFileName') {
          logger.warn({ retriesRemaining: retries }, 'File not ready yet in AI lambda service, retrying in 2s');
          await delay(2000);
        } else {
          throw e;
        }
      }
    } while (
      (retries > 0 &&
        resultRes?.data &&
        resultRes?.data?.status !== 'SUCCEEDED' &&
        resultRes?.data?.status !== 'FAILED') ||
      !resultRes?.data
    );

    if (retries <= 0) {
      throw new Error('AI Data result fetch retry limit exceeded');
    }

    if (resultRes.data.status === 'FAILED') {
      logger.error({ resultRes }, 'AI processing failed');
      return null;
    }

    const data = resultRes.data as any;
    const deserializedData: AiApiResult = {
      ...data,
      ...(data.result ? { result: JSON.parse(data.result) } : {}),
      ...(data.concepts ? { concepts: JSON.parse(data.concepts) } : {}),
      ...(data.topics ? { topics: JSON.parse(data.topics) } : {}),
      ...(data.references ? { references: JSON.parse(data.references) } : {}),
      generationDate: Date.now(),
    };

    const aiData = {
      contentNovelty: deserializedData?.result?.predictions?.content,
      contextNovelty: deserializedData?.result?.predictions?.context,
      concepts: deserializedData.concepts,
      topics: deserializedData.topics,
      references: deserializedData.references,
      generationDate: deserializedData.generationDate,
    };

    if (resultRes.data.status === 'SUCCEEDED') {
      setToCache(cacheKey, aiData);
    }

    return aiData;
  } catch (error) {
    logger.error({ error }, 'Error retrieving AI data');
    return null;
  }
}

/**
 * Updates the novelty score data for an ES entry.
 ** Hides/Shows the novelty scores for a node in ES Query results.
 */
async function updateNoveltyScoreDataForEsEntry(
  node: Pick<Node, 'uuid' | 'cid' | 'manifestUrl'>,
  updatedConfig: NoveltyScoreConfig,
): Promise<void> {
  try {
    const hideContentNovelty = updatedConfig?.hideContentNovelty;
    const hideContextNovelty = updatedConfig?.hideContextNovelty;

    logger.info(
      { fn: 'updateNoveltyScoreDataForEsEntry', nodeUuid: node.uuid, updatedConfig },
      'Updating novelty score data for ES entry',
    );

    const { researchObjects } = await getIndexedResearchObjects([node.uuid]);
    const researchObject = researchObjects[0];
    const latestPublishedManifestCid = hexToCid(researchObject.recentCid);
    const latestManifest = await getManifestByCid(latestPublishedManifestCid);
    const aiData = await getAiData(latestManifest, false);

    const contentNoveltyPercentile = aiData ? aiData.contentNovelty?.percentile : 0;
    const contextNoveltyPercentile = aiData ? aiData.contextNovelty?.percentile : 0;
    const lastUpdatedDate = aiData.generationDate;

    const updateFields = {
      ...(hideContentNovelty !== true && {
        content_novelty_percentile: contentNoveltyPercentile,
        content_novelty_percentile_last_updated: lastUpdatedDate,
      }),
      ...(hideContextNovelty !== true && {
        context_novelty_percentile: contextNoveltyPercentile,
        context_novelty_percentile_last_updated: lastUpdatedDate,
      }),
    };

    const removalFields = [];

    if (hideContentNovelty) {
      removalFields.push('content_novelty_percentile');
      removalFields.push('content_novelty_percentile_last_updated');
    }
    if (hideContextNovelty) {
      removalFields.push('context_novelty_percentile');
      removalFields.push('context_novelty_percentile_last_updated');
    }

    if (Object.keys(updateFields).length > 0) {
      const updateResult = await updateIndexedResearchObject(node.uuid, updateFields);
      logger.info(
        { fn: 'updateNoveltyScoreDataForEsEntry', updateResult, nodeUuid: node.uuid, updatedConfig, updateFields },
        'Update result:',
      );
    }
    if (removalFields.length > 0) {
      const removalResult = await removeFieldsFromIndexedResearchObject(node.uuid, removalFields);
      logger.info(
        {
          fn: 'updateNoveltyScoreDataForEsEntry',
          removalResult,
          nodeUuid: node.uuid,
          updatedConfig,
          removalFields,
        },
        'Removal result:',
      );
    }
    logger.info({ fn: 'updateNoveltyScoreDataForEsEntry' }, 'Completed updateNoveltyScoreDataForEsEntry');
    return;
  } catch (e) {
    logger.error({ e }, 'Error updating novelty score data for ES entry');
  }
}

/**
 * Updates specific fields of an indexed research object in Elasticsearch.
 *
 * @param nodeUuid The UUID of the node to update. (Period optional)
 * @param updates An object containing the fields to add or update.
 */
async function updateIndexedResearchObject(nodeUuid: string, updates: Record<string, any>) {
  nodeUuid = unpadUuid(nodeUuid);
  const workId = NODES_ID_PREFIX + nodeUuid;
  try {
    await elasticWriteClient.update({
      index: NATIVE_WORKS_INDEX,
      id: encodeURIComponent(workId),
      doc: updates,
      refresh: true,
      doc_as_upsert: false, // don't create if doesnt exist
    });

    logger.info(
      { fn: 'updateIndexedResearchObject' },
      `Updated work: ${workId} with fields: ${Object.keys(updates).join(', ')}`,
    );
    return { success: true, workId };
  } catch (error) {
    if (error.meta?.statusCode === 404) {
      logger.warn({ fn: 'updateIndexedResearchObject', nodeUuid, workId, updates }, `Document not found for update.`);
      return { success: false, nodeUuid, error: 'Document not found' };
    }
    logger.error({ fn: 'updateIndexedResearchObject', error, nodeUuid, workId, updates }, 'Error updating work:');
    return {
      success: false,
      nodeUuid,
      error: error?.message || 'Unknown error during update',
    };
  }
}

/**
 * Removes specific fields from an indexed research object in Elasticsearch.
 *
 * @param nodeUuid The UUID of the node to update.
 * @param fieldsToRemove An array of field names to remove.
 */
async function removeFieldsFromIndexedResearchObject(nodeUuid: string, fieldsToRemove: string[]) {
  nodeUuid = unpadUuid(nodeUuid);
  const workId = NODES_ID_PREFIX + nodeUuid;
  if (!fieldsToRemove || fieldsToRemove.length === 0) {
    logger.info({ fn: 'removeFieldsFromIndexedResearchObject', nodeUuid }, 'No fields specified for removal.');
    return { success: true, workId: null, message: 'No fields to remove' };
  }

  try {
    await elasticWriteClient.update({
      index: NATIVE_WORKS_INDEX,
      id: encodeURIComponent(workId),
      script: {
        source: 'for (field in params.fields) { ctx._source.remove(field) }',
        lang: 'painless',
        params: {
          fields: fieldsToRemove,
        },
      },
      refresh: true,
    });

    logger.info(
      { fn: 'removeFieldsFromIndexedResearchObject' },
      `Updated work: ${workId}, removed fields: ${fieldsToRemove.join(', ')}`,
    );
    return { success: true, workId };
  } catch (error) {
    if (error.meta?.statusCode === 404) {
      logger.warn(
        { fn: 'removeFieldsFromIndexedResearchObject', nodeUuid, workId, fieldsToRemove },
        `Document not found for field removal.`,
      );
      return { success: false, nodeUuid, error: 'Document not found' };
    }
    logger.error(
      { fn: 'removeFieldsFromIndexedResearchObject', error, nodeUuid, workId, fieldsToRemove },
      'Error removing fields from work:',
    );
    return {
      success: false,
      nodeUuid,
      error: error?.message || 'Unknown error during field removal',
    };
  }
}

export const ElasticNodesService = {
  indexResearchObject,
  getAiData,
  updateIndexedResearchObject,
  removeFieldsFromIndexedResearchObject,
  updateNoveltyScoreDataForEsEntry,
};
