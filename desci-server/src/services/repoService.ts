import { DocumentId } from '@automerge/automerge-repo';
import { ResearchObjectV1, ManifestActions } from '@desci-labs/desci-models';
import axios, { AxiosInstance } from 'axios';

import { als, logger as parentLogger } from '../logger.js';
import { ResearchObjectDocument } from '../types/documents.js';

import { NodeUuid } from './manifestRepo.js';

const logger = parentLogger.child({ module: 'Repo Service' });

type ApiResponse<B> = { ok: boolean } & B;

class RepoService {
  #client: AxiosInstance;
  #apiKey: string;

  baseUrl: string;

  constructor() {
    if (!process.env.REPO_SERVICE_SECRET_KEY || !process.env.REPO_SERVER_URL)
      throw new Error('[REPO SERVICE]: env.REPO_SERVER_URL or env.REPO_SERVICE_SECRET_KEY missing');

    this.#apiKey = process.env.REPO_SERVICE_SECRET_KEY;
    this.baseUrl = process.env.REPO_SERVER_URL;

    logger.info({ url: this.baseUrl }, 'Init Repo Service');

    this.#client = axios.create({
      baseURL: this.baseUrl,
      headers: { 'x-api-key': this.#apiKey },
    });
  }

  async dispatchAction(arg: { uuid: NodeUuid | string; documentId: DocumentId; actions: ManifestActions[] }) {
    logger.info({ arg }, 'Disatch Changes');
    const response = await this.#client.post<{ ok: boolean; document: ResearchObjectDocument }>(
      `${this.baseUrl}/v1/nodes/documents/dispatch`,
      arg,
      {
        headers: {
          'x-api-remote-traceid': (als.getStore() as any)?.traceId,
        },
      },
    );
    logger.info({ arg, ok: response.data.ok }, 'Disatch Changes Response');
    if (response.status === 200 && response.data.ok) {
      return response.data.document;
    } else {
      // logger.info({ response: response.data }, 'Disatch Changes Response');
      return null;
    }
  }

  async dispatchChanges(arg: { uuid: NodeUuid | string; documentId: DocumentId; actions: ManifestActions[] }) {
    logger.info({ arg }, 'Disatch Actions');
    try {
      const response = await this.#client.post<{ ok: boolean; document: ResearchObjectDocument }>(
        `${this.baseUrl}/v1/nodes/documents/actions`,
        arg,
        {
          headers: {
            'x-api-remote-traceid': (als.getStore() as any)?.traceId,
          },
        },
      );
      logger.info({ arg, response: response.data }, 'Disatch Actions Response');
      if (response.status === 200 && response.data.ok) {
        return response.data.document;
      } else {
        return { ok: false, status: response.status, message: response.data };
      }
    } catch (err) {
      return { ok: false, status: err.status, message: err?.response?.data };
    }
  }

  async initDraftDocument(arg: { uuid: string; manifest: ResearchObjectV1 }) {
    logger.info({ arg }, 'Create Draft');
    try {
      const response = await this.#client.post<
        ApiResponse<{ documentId: DocumentId; document: ResearchObjectDocument }>
      >(`${this.baseUrl}/v1/nodes/documents`, arg, {
        headers: {
          'x-api-remote-traceid': (als.getStore() as any)?.traceId,
        },
      });
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
    if (!arg.uuid) {
      logger.warn({ arg }, 'Attempt to retrieve draft manifest for empty UUID');
      return null;
    }
    logger.info({ arg }, 'Retrieve Draft Document');
    try {
      const response = await this.#client.get<ApiResponse<{ document: ResearchObjectDocument }>>(
        `${this.baseUrl}/v1/nodes/documents/draft/${arg.uuid}`,
        {
          headers: {
            'x-api-remote-traceid': (als.getStore() as any)?.traceId,
          },
        },
      );
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
    // uuid = ensureUuidEndsWithDot(uuid) as NodeUuid;
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
