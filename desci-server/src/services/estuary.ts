import { ReadStream } from 'fs';

import axios, { AxiosResponse } from 'axios';
import FormData from 'form-data';

type ACTIONS = 'PIN' | 'UPLOAD';

const API_ROUTES: Record<ACTIONS, string> = {
  PIN: 'pinning/pins',
  UPLOAD: 'content/add',
};

const ESTUARY_API_KEY = process.env.ESTUARY_API_KEY;
const ESTUARY_API_URL = process.env.ESTUARY_API_URL;
const UPLOAD_ROUTE = `${ESTUARY_API_URL}/${API_ROUTES['UPLOAD']}`;
export interface ESTUARY_UPLOAD_RESPONSE {
  cid: string;
  retrieval_url: string;
  estuary_retrieval_url: string;
  estuaryId: number;
  providers: string[];
}

export const uploadData = async (cid: string, body: Buffer): Promise<ESTUARY_UPLOAD_RESPONSE> => {
  console.log('[estuary::uploadData]');
  const form = new FormData();
  form.append('data', body, { filename: cid });
  const { data } = await axios.post<any, AxiosResponse<ESTUARY_UPLOAD_RESPONSE>>(UPLOAD_ROUTE, form, {
    headers: {
      Authorization: `Bearer ${ESTUARY_API_KEY}`,
      ...form.getHeaders(),
    },
  });
  console.log('[estuary::uploadData] Estuary response', data);
  return data;
};
