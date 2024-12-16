export const PUBLIC_IPFS_PATH =
  process.env.NODE_ENV === 'dev'
    ? `http://host.docker.internal:8089/ipfs`
    : process.env.NODE_ENV === 'test'
      ? 'http://host.docker.internal:8091/ipfs'
      : 'https://ipfs.desci.com/ipfs';

export const ENABLE_PARTYKIT_FEATURE =
  process.env.ENABLE_PARTYKIT_FEATURE == '1' || process.env.ENABLE_PARTYKIT_FEATURE == 'true';
console.log({
  ENABLE_PARTYKIT_FEATURE,
  env: process.env.ENABLE_PARTYKIT_FEATURE,
});
