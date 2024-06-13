export const PUBLIC_IPFS_PATH =
  process.env.NODE_ENV === 'dev'
    ? `http://host.docker.internal:8089/ipfs`
    : process.env.NODE_ENV === 'test'
      ? 'http://host.docker.internal:8099/ipfs'
      : 'https://ipfs.desci.com/ipfs';
