export const PUBLIC_IPFS_PATH =
  process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'test'
    ? `http://host.docker.internal:8089/ipfs`
    : 'https://ipfs.desci.com/ipfs';

export const MEDIA_SERVER_API_URL = process.env.NODES_MEDIA_SERVER_URL;
export const MEDIA_SERVER_API_KEY = process.env.MEDIA_SECRET_KEY;
