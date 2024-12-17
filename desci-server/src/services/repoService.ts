import { DocumentId } from '@automerge/automerge-repo';
import { ResearchObjectV1, ManifestActions } from '@desci-labs/desci-models';
import axios, { AxiosError, AxiosInstance } from 'axios';

import { als, logger as parentLogger } from '../logger.js';
import { ResearchObjectDocument } from '../types/documents.js';

import { NodeUuid } from './manifestRepo.js';

const logger = parentLogger.child({ module: 'Repo Service' });

type ApiResponse<B> = { ok: boolean } & B;

class RepoService {
  #client: AxiosInstance;
  #apiKey: string;

  baseUrl: string;

  defaultTimeoutInMilliseconds = 5000;
  timeoutErrorMessage = 'Timeout: Call to Repo service timed out';

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

  async getDraftDocument(arg: { uuid: NodeUuid; documentId?: string | DocumentId; timeout?: number }) {
    if (!arg.uuid && !arg.documentId) {
      logger.warn({ arg }, 'Attempt to retrieve draft manifest for empty UUID');
      return null;
    }
    try {
      // const controller = new AbortController();
      // setTimeout(() => {
      //   logger.trace('Abort request');
      //   controller.abort();
      // }, arg.timeout ?? this.defaultTimeoutInMilliseconds);
      logger.trace(
        { timout: arg.timeout || this.defaultTimeoutInMilliseconds, uuid: arg.uuid, documentId: arg.documentId },
        '[getDraftDocument]',
      );
      const response = await this.#client.get<ApiResponse<{ document: ResearchObjectDocument }>>(
        `${this.baseUrl}/v1/nodes/documents/draft/${arg.uuid}?documentId=${arg.documentId}`,
        {
          headers: {
            'x-api-remote-traceid': (als.getStore() as any)?.traceId,
          },
          // timeout: arg.timeout ?? this.defaultTimeoutInMilliseconds,
          signal: AbortSignal.timeout(arg.timeout ?? this.defaultTimeoutInMilliseconds), // controller.signal,
          timeoutErrorMessage: this.timeoutErrorMessage,
        },
      );
      logger.info({ arg }, 'Retrieve Draft Document');
      if (response.status === 200 && response.data.ok) {
        return response.data.document;
      } else {
        return null;
      }
    } catch (err) {
      const error = err as AxiosError;
      if (error?.code === 'ECONNABORTED' || error?.message?.toLowerCase().includes('timeout')) {
        logger.error({ error }, 'REPO_SERVICE_CALL_TIMEOUT');
      }
      logger.error({ err }, 'GET Draft Document Error');
      return null;
    }
  }

  async getDraftManifest({
    uuid,
    timeout,
    documentId,
  }: {
    uuid: NodeUuid;
    documentId?: string | DocumentId;
    timeout?: number;
  }) {
    try {
      const response = await this.getDraftDocument({ uuid, timeout, documentId });
      return response ? response.manifest : null;
    } catch (err) {
      logger.error({ err }, 'GET Draft manifest Error');
      return null;
    }
  }
}

const repoService = new RepoService();
export default repoService;
