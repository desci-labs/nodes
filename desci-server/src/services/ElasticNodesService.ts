/*
 ** This service contains functionality for indexing published nodes on ElasticSearch
 */

import { prisma } from '../client.js';
import { elasticClient } from '../elasticSearchClient.js';
import { getIndexedResearchObjects } from '../theGraph.js';
import { unpadUuid } from '../utils.js';

import { getManifestFromNode } from './data/processing.js';

export const NODES_INDEX = 'works_nodes_v1';
const NODES_ID_PREFIX = 'nodes/';

async function indexResearchObject(nodeUuid: string) {
  nodeUuid = unpadUuid(nodeUuid);
  try {
    const workId = NODES_ID_PREFIX + nodeUuid;

    const workData = await fillNodeData(nodeUuid);

    await elasticClient.index({
      index: 'works_nodes_v1',
      id: workId,
      document: {
        work_id: workId,
        ...workData,
        '@timestamp': new Date(),
      },
      refresh: true, // ensures immediate indexing
    });
  } catch (error) {
    console.error('Error indexing work:', error);
    throw error;
  }
}

async function fillNodeData(nodeUuid: string) {
  const node = await prisma.node.findFirst({
    where: { uuid: nodeUuid },
    include: { DoiRecord: true },
  });
  const { researchObjects } = await getIndexedResearchObjects([nodeUuid]);
  const versions = researchObjects[0].versions;
  const firstVersion = versions.at(-1);
  const firstVersionTime = new Date(firstVersion.time);
  const { manifest } = await getManifestFromNode(node);

  const doi = node?.DoiRecord?.[0].doi;

  const publication_year = firstVersionTime?.getFullYear() || new Date().getFullYear();

  const citedByCount = 0; // Get from external publication data

  const workData = {
    title: node.title,
    doi,
    type: 'preprint',
    abstract: manifest.description,
    citedByCount,
    publication_year,
    publication_date: firstVersionTime,
    is_retracted: false,
    is_paratext: false,
    language: 'en', // Later update with some ML tool
    content_novelty_percentile: 0,
    context_novelty_percentile: 0,
  };

  return workData;
}

export const ElasticNodesService = {
  indexResearchObject,
};
