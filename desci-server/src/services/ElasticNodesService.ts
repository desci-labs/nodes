/*
 ** This service contains functionality for indexing published nodes on ElasticSearch
 */

import {
  PdfComponent,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Author,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
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
// import { searchEsAuthors } from './ElasticSearchService.js';
import { searchEsAuthors } from './ElasticSearchService.js';
import { getDpidFromNode, getDpidFromNodeUuid } from './node.js';
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

const DPID_URL = DPID_ENV_MAPPING[process.env.SERVER_URL || 'https://localhost:5420'];

async function indexResearchObject(nodeUuid: string) {
  nodeUuid = unpadUuid(nodeUuid);
  try {
    const workId = NODES_ID_PREFIX + nodeUuid;

    const workData = await fillNodeData(nodeUuid);

    await elasticWriteClient.index({
      index: NATIVE_WORKS_INDEX,
      id: workId,
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

async function fillNodeData(nodeUuid: string) {
  const node = await prisma.node.findFirst({
    where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
    include: { DoiRecord: true },
  });
  const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
  const researchObject = researchObjects[0];
  const versions = researchObject.versions;
  const firstVersion = versions.at(-1);
  const firstVersionTime = new Date(parseInt(firstVersion.time) * 1000);
  const { manifest } = await getManifestFromNode(node);
  const firstManuscript = getFirstManuscript(manifest);
  if (!firstManuscript) throw 'Manifest does not contain a manuscript';

  const latestPublishedManifestCid = hexToCid(researchObject.recentCid);
  const latestManifest = await getManifestByCid(latestPublishedManifestCid);
  const dpid = await getDpidFromNode(node);

  const doi = node?.DoiRecord?.[0]?.doi;
  const publication_year = firstVersionTime?.getFullYear().toString() || new Date().getFullYear().toString();
  const citedByCount = 0; // Get from external publication data

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
  //
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
      source_id: DPID_URL + dpid,
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

    const fileName = firstManuscriptCid + '.pdf';
    const presignedUrlEndpoint = `${process.env.SCORE_GEN_SERVER}/prod/gen-s3-url?file_name=${fileName}`;

    const presignedUrlData = await axios.get(presignedUrlEndpoint);
    const { url: presignedUrl, UploadedFileName: s3FileName } = presignedUrlData.data as {
      url: string;
      UploadedFileName: string;
    };

    const pubDataRefEntry = await prisma.publicDataReference.findFirst({ where: { cid: firstManuscriptCid } });
    const isExternal = pubDataRefEntry?.external ? true : false;

    const pdfUrl = isExternal ? `${PUB_IPFS_URL}/${firstManuscriptCid}` : `${IPFS_URL}/${firstManuscriptCid}`;
    const pdfRes = await axios({
      url: pdfUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });

    const pdfBuffer = pdfRes.data;

    // Upload the PDF
    const uploaded = await axios.put(presignedUrl as string, pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
      },
    });

    const resultUrl = `${process.env.SCORE_RESULT_API}/prod/get-result?UploadedFileName=${s3FileName}`;
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

export const ElasticNodesService = {
  indexResearchObject,
  getAiData,
};
