export const PUBLIC_IPFS_PATH =
  process.env.NODE_ENV === 'dev'
    ? `http://host.docker.internal:8089/ipfs`
    : process.env.NODE_ENV === 'test'
      ? 'http://host.docker.internal:8091/ipfs'
      : 'https://ipfs.desci.com/ipfs';

export const ENABLE_PARTYKIT_FEATURE =
  process.env.ENABLE_PARTYKIT_FEATURE == '1' || process.env.ENABLE_PARTYKIT_FEATURE == 'true';
export const PARTY_SERVER_HOST = process.env.PARTY_SERVER_HOST;
export const PARTY_SERVER_TOKEN = process.env.PARTY_SERVER_TOKEN;

export const IS_DEV = process.env.NODE_ENV == 'dev';
export const IS_TEST = process.env.NODE_ENV == 'test';

console.log({
  env: process.env.ENABLE_PARTYKIT_FEATURE,
  ENABLE_PARTYKIT_FEATURE,
  PARTY_SERVER_HOST,
  IS_DEV,
  IS_TEST,
});
