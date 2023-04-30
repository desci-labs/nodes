export const PUBLIC_IPFS_PATH =
  process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'test'
    ? `http://host.docker.internal:8089/ipfs`
    : 'https://ipfs.desci.com/ipfs';
