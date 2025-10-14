import { DocumentId } from '@automerge/automerge-repo';
import { ResearchObjectV1, ManifestActions } from '@desci-labs/desci-models';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { errWithCause } from 'pino-std-serializers';

import { als, logger as parentLogger } from '../logger.js';
import { ResearchObjectDocument } from '../types/documents.js';

import { NodeUuid } from './manifestRepo.js';

const logger = parentLogger.child({ module: 'Repo Service' });

const cloudflareWorkerApi = process.env.CLOUDFLARE_WORKER_API;
const cloudflareWorkerApiSecret = process.env.CLOUDFLARE_WORKER_API_SECRET;
const enableWorkersApi = process.env.ENABLE_WORKERS_API == 'true';

type ApiResponse<B> = { ok: boolean } & B;

class RepoService {
  #client: AxiosInstance;
  #apiKey: string;

  baseUrl: string;

  defaultTimeoutInMilliseconds = 5000;
  timeoutErrorMessage = 'Timeout: Call to Repo service timed out';

  constructor() {
    console.log('CLOUDFLARE_WORKER_API_SECRET', cloudflareWorkerApiSecret);
    console.log('CLOUDFLARE_WORKER_API', cloudflareWorkerApi);
    if (!cloudflareWorkerApiSecret || !cloudflareWorkerApi)
      throw new Error('[REPO SERVICE]: env.cloudflareWorkerApi or env.cloudflareWorkerApiSecret missing');

    this.#apiKey = process.env.REPO_SERVICE_SECRET_KEY;
    this.baseUrl = process.env.REPO_SERVER_URL;

    logger.info({ url: this.baseUrl }, 'Init Repo Service');

    this.#client = axios.create({
      baseURL: this.baseUrl,
      headers: { 'x-api-key': this.#apiKey },
    });
  }

  async dispatchAction(arg: { uuid: NodeUuid | string; documentId: DocumentId; actions: ManifestActions[] }) {
    logger.info({ arg, enableWorkersApi, cloudflareWorkerApi }, 'Disatch Changes');
    try {
      const response = await this.#client.post<{ ok: boolean; document: ResearchObjectDocument }>(
        `${cloudflareWorkerApi}/parties/automerge/${arg.documentId}`,
        arg,
        {
          headers: {
            'x-api-remote-traceid': (als.getStore() as any)?.traceId,
            ...(enableWorkersApi ? { 'x-api-key': cloudflareWorkerApiSecret } : undefined),
          },
        },
      );
      logger.trace({ arg, ok: response.data.ok }, 'Disatch Actions Response');
      if (response.status === 200 && response.data.ok) {
        return response.data.document;
      } else {
        logger.trace({ response: response.data }, 'Disatch Actions Failed');
        console.log({ response: response.data }, 'Disatch Actions Failed');
        return null;
      }
    } catch (err) {
      logger.info({ arg, err }, 'dispatchChanges Error');
      console.log({ arg, err }, 'dispatchChanges Error');
      return null;
    }
  }

  async dispatchChanges(arg: { uuid: NodeUuid | string; documentId: DocumentId; actions: ManifestActions[] }) {
    console.log('DISPATCH CHANGES', { arg });
    try {
      const response = await this.#client.post<{ ok: boolean; document: ResearchObjectDocument }>(
        `${cloudflareWorkerApi}/parties/automerge/${arg.documentId}`,
        arg,
        {
          headers: {
            'x-api-remote-traceid': (als.getStore() as any)?.traceId,
            ...(enableWorkersApi ? { 'x-api-key': cloudflareWorkerApiSecret } : undefined),
          },
        },
      );
      logger.trace({ arg, response: response.data }, 'dispatchChanges Response');
      if (response.status === 200 && response.data.ok) {
        return response.data.document;
      } else {
        return { ok: false, status: response.status, message: response.data };
      }
    } catch (err) {
      console.log('DISPATCH CHANGES ERROR', { arg, err });
      return { ok: false, status: err.status, message: err?.response?.data };
    }
  }

  async initDraftDocument(arg: { uuid: string; manifest: ResearchObjectV1 }) {
    try {
      const response = await this.#client.post<
        ApiResponse<{ documentId: DocumentId; document: ResearchObjectDocument }>
      >(`${cloudflareWorkerApi}/api/documents`, arg, {
        headers: {
          'x-api-remote-traceid': (als.getStore() as any)?.traceId,
          ...(enableWorkersApi ? { 'x-api-key': cloudflareWorkerApiSecret } : undefined),
        },
      });
      logger.trace({ status: response.status, response: response.data }, 'Create Draft Response');
      if (response.status === 200) {
        return response.data;
      } else {
        return null;
      }
    } catch (err) {
      logger.error({ err: errWithCause(err), enableWorkersApi, cloudflareWorkerApi }, 'Create Draft Error');
      return null;
    }
  }

  async getDraftDocument(arg: { uuid: NodeUuid; documentId?: string | DocumentId; timeout?: number }) {
    if (!arg.uuid && !arg.documentId) {
      logger.warn({ arg }, 'Attempt to retrieve draft manifest for empty UUID');
      return null;
    }
    try {
      logger.trace(
        { timout: arg.timeout || this.defaultTimeoutInMilliseconds, uuid: arg.uuid, documentId: arg.documentId },
        '[getDraftDocument]',
      );
      const response = await this.#client.get<ApiResponse<{ document: ResearchObjectDocument }>>(
        `${cloudflareWorkerApi}/parties/automerge/${arg.documentId}`,
        {
          headers: {
            'x-api-remote-traceid': (als.getStore() as any)?.traceId,
            ...(enableWorkersApi && { 'x-api-key': cloudflareWorkerApiSecret }),
          },
          signal: AbortSignal.timeout(arg.timeout ?? this.defaultTimeoutInMilliseconds),
          timeoutErrorMessage: this.timeoutErrorMessage,
        },
      );
      logger.info({ arg, doc: response.data.ok }, 'Retrieve Draft Document');
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
