import { DocumentId } from '@automerge/automerge-repo';
import { ResearchObjectV1 } from '@desci-labs/desci-models';
import axios, { AxiosInstance } from 'axios';

import { logger as parentLogger } from '../logger.js';
import { ResearchObjectDocument } from '../types/documents.js';

import { ManifestActions, NodeUuid } from './manifestRepo.js';

const logger = parentLogger.child({ module: 'Repo Service' });

type ApiResponse<B> = { ok: boolean } & B;

class RepoService {
  #client: AxiosInstance;
  #apiKey: string;

  baseUrl: string;

  constructor() {
    this.#apiKey = process.env.REPO_SERVICE_SECRET_KEY;
    this.baseUrl = process.env.REPO_SERVER_URL;

    if (!this.#apiKey || !this.baseUrl) {
      throw new Error('[REPO SERVICE]: env.REPO_SERVER_URL or env.REPO_SERVICE_SECRET_KEY missing');
    }

    logger.info({ url: this.baseUrl }, 'Init Repo Service');

    this.#client = axios.create({
      baseURL: this.baseUrl,
      headers: { 'x-api-key': this.#apiKey },
    });
  }

  async dispatchAction(arg: { uuid: NodeUuid | string; documentId: DocumentId; actions: ManifestActions[] }) {
    logger.info({ arg }, 'Dispatch Changes');
    const response = await this.#client.post<{ ok: boolean; document: ResearchObjectDocument }>(
      `${this.baseUrl}/v1/nodes/documents/dispatch`,
      arg,
    );
    logger.info({ arg, response: response.data }, 'Dispatch Changes Response');
    if (response.status === 200 && response.data.ok) {
      return response.data.document;
    } else {
      // logger.info({ response: response.data }, 'Disatch Changes Response');
      return null;
    }
  }

  async initDraftDocument(arg: { uuid: string; manifest: ResearchObjectV1 }) {
    logger.info({ arg }, 'Create Draft');
    try {
      const response = await this.#client.post<
        ApiResponse<{ documentId: DocumentId; document: ResearchObjectDocument }>
      >(`${this.baseUrl}/v1/nodes/documents`, arg);
      logger.info({ response: response.data }, 'Create Draft Response');
      if (response.status === 200 && response.data.ok) {
        return response.data;
      } else {
        return null;
      }
    } catch (err) {
      logger.error({ err }, 'Create Draft Error');
      return null;
    }
  }

  async getDraftDocument(arg: { uuid: NodeUuid }) {
    logger.info({ arg }, 'Retrieve Draft Document');
    try {
      const response = await this.#client.get<ApiResponse<{ document: ResearchObjectDocument }>>(
        `${this.baseUrl}/v1/nodes/documents/draft/${arg.uuid}`,
      );
      logger.info({ response: response.data }, 'Draft Retrieval Response');
      if (response.status === 200 && response.data.ok) {
        return response.data.document;
      } else {
        return null;
      }
    } catch (err) {
      logger.error({ err }, 'GET Draft Document Error');
      return null;
    }
  }
  async getDraftManifest(uuid: NodeUuid) {
    logger.info({ uuid }, 'Retrieve Draft Document');
    // try {} catch (err) {}
    try {
      const response = await this.getDraftDocument({ uuid });
      return response ? response.manifest : null;
    } catch (err) {
      logger.error({ err }, 'GET Draft manifest Error');
      return null;
    }
  }
}

const repoService = new RepoService();
export default repoService;
