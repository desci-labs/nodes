import { PUBLIC_IPFS_PATH } from 'config';

export const cleanupManifestUrl = (url: string, gateway?: string) => {
  if (url && (PUBLIC_IPFS_PATH || gateway)) {
    const s = url.split('/');
    const res = `${gateway ? gateway : PUBLIC_IPFS_PATH}/${s[s.length - 1]}`;
    console.log(`resolving ${url} => ${res}`);
    return res;
  }
  return url;
};
