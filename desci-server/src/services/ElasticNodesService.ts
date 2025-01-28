/*
 ** This service contains functionality for indexing published nodes on ElasticSearch
 */

import {
  PdfComponent,
  ResearchObjectComponentDocumentSubtype,
  ResearchObjectComponentType,
  ResearchObjectV1,
  ResearchObjectV1Component,
} from '@desci-labs/desci-models';
import axios from 'axios';

import { prisma } from '../client.js';
import { PUBLIC_IPFS_PATH } from '../config/index.js';
import { elasticWriteClient } from '../elasticSearchClient.js';
import { logger as parentLogger } from '../logger.js';
import { getFromCache, setToCache } from '../redisClient.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { ensureUuidEndsWithDot, unpadUuid } from '../utils.js';

import { getManifestFromNode } from './data/processing.js';
import { OpenAlexService } from './OpenAlexService.js';

export const NODES_INDEX = 'works_nodes_v1';
const NODES_ID_PREFIX = 'nodes/';

const logger = parentLogger.child({ module: 'Services::ElasticNodesService' });

const IPFS_URL = PUBLIC_IPFS_PATH; // Confusing, but refers to priv swarm IPFS public gateway
const PUB_IPFS_URL = process.env.PUBLIC_IPFS_RESOLVER || 'https://pub.desci.com/ipfs';

async function indexResearchObject(nodeUuid: string) {
  nodeUuid = unpadUuid(nodeUuid);
  try {
    const workId = NODES_ID_PREFIX + nodeUuid;

    const workData = await fillNodeData(nodeUuid);

    debugger;
    await elasticWriteClient.index({
      index: 'works_native_local',
      id: workId,
      document: {
        work_id: workId,
        ...workData,
        '@timestamp': new Date(),
      },
      refresh: true, // ensures immediate indexing
    });
    logger.info(`Indexed work: ${workId}`);
  } catch (error) {
    console.error('Error indexing work:', error);
    throw error;
  }
}

async function fillNodeData(nodeUuid: string) {
  const node = await prisma.node.findFirst({
    where: { uuid: ensureUuidEndsWithDot(nodeUuid) },
    include: { DoiRecord: true },
  });
  debugger;
  const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
  const versions = researchObjects[0].versions;
  const firstVersion = versions.at(-1);
  const firstVersionTime = new Date(parseInt(firstVersion.time) * 1000);
  const { manifest } = await getManifestFromNode(node);

  const doi = node?.DoiRecord?.[0]?.doi;

  const publication_year = firstVersionTime?.getFullYear() || new Date().getFullYear();

  const citedByCount = 0; // Get from external publication data

  debugger;
  const aiData = await getAiData(manifest, true);
  const concepts = formatConceptsData(aiData?.concepts);
  const topics = await fillTopicsData(aiData?.topics);

  const workData = {
    title: node.title,
    doi,
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
    concepts,
    topics,
  };

  return workData;
}

function formatConceptsData(rawConcepts: AiData['concepts']) {
  if (!rawConcepts) return [];

  const concepts = rawConcepts.concept_ids.map((conceptId, i) => ({
    concept_id: conceptId,
    display_name: rawConcepts.concept_names[i],
  }));

  return concepts;
}

async function fillTopicsData(rawTopics: AiData['topics']) {
  if (!rawTopics) return [];

  const dbTopics = await OpenAlexService.getTopicsByIds(rawTopics.topic_ids);
  const formattedTopics = dbTopics.map((topic) => ({
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
    const firstManuscript = manifest.components.find(
      (c) =>
        c.type === ResearchObjectComponentType.PDF &&
        (c as PdfComponent).subtype === ResearchObjectComponentDocumentSubtype.MANUSCRIPT,
    );
    const firstManuscriptCid = firstManuscript.payload.cid || firstManuscript.payload.url; // Old PDF payloads used .url field for CID

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

    const external = false; // TODO: Add external handling

    const pdfUrl = external ? `${PUB_IPFS_URL}/${firstManuscriptCid}` : `${IPFS_URL}/${firstManuscriptCid}`;
    const pdfRes = await axios({
      url: pdfUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });

    const pdfBuffer = pdfRes.data;

    // Upload the PDF
    await axios.put(presignedUrl as string, pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
      },
    });

    const resultUrl = `${process.env.SCORE_RESULT_API}/prod/get-result?UploadedFileName=${s3FileName}`;
    let resultRes;
    await delay(2000); // Wait for the file to be available in the lambda service
    do {
      try {
        resultRes = await axios.get(resultUrl);
        debugger;
        await delay(1500);
      } catch (e) {
        if (e.response?.status === 404) {
          logger.warn('File not ready yet in AI lambda service, retrying in 2s');
          await delay(2000);
        } else {
          throw e;
        }
      }
    } while (
      (resultRes?.data && resultRes?.data?.status !== 'SUCCEEDED' && resultRes?.data?.status !== 'FAILED') ||
      !resultRes?.data
    );

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

    if (resultRes.data.status === 'SUCCEEDED') {
      setToCache(cacheKey, deserializedData);
    }

    return {
      contentNovelty: deserializedData.result.predictions.content,
      contextNovelty: deserializedData.result.predictions.context,
      concepts: deserializedData.concepts,
      topics: deserializedData.topics,
      references: deserializedData.references,
      generationDate: deserializedData.generationDate,
    };
  } catch (error) {
    logger.error({ error }, 'Error retrieving AI data');
    return null;
  }
}

export const ElasticNodesService = {
  indexResearchObject,
};
