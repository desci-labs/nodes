
import fs from 'fs/promises';
import path from 'path';

const IPFS_GATEWAY= 'https://itk.mypinata.cloud/ipfs/';

const processPublications = async (rootDir: string) => {
  const pubs = {};
  const entries = await fs.readdir(rootDir);

  for (const entry of entries) {
    const pubDir = path.join(rootDir, entry);
    const metadataPath = path.join(pubDir, 'metadata.json');

    const data = await fs.readFile(metadataPath, 'utf8');
    const raw = JSON.parse(data);

    raw.cids = {};
    raw.cids.article = raw.publication.revisions.map(r => r.article);
    raw.cids.code = raw.publication.revisions.map(r => r.source_code);

    pubs[entry] = raw;
  }

  return pubs;
}

const pubs = await processPublications('local-data/publications');
// for (const pub of pubs) {
//   const 
// }
