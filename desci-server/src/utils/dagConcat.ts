//Thanks to https://github.com/webrecorder/ipfs-composite-files
/* eslint-disable @typescript-eslint/no-var-requires */
import { encode, decode, prepare } from '@ipld/dag-pb';
import { UnixFS } from 'ipfs-unixfs';
import { CID } from 'multiformats';
import { code as rawCode } from 'multiformats/codecs/raw';

// const { default: UnixFS } = IpfsUnixFS;

// ===========================================================================
export async function getSize(ipfs, cid, allowDir = false) {
  const block = await ipfs.block.get(cid);
  // console.log('cid: ', cid);
  if (typeof cid === 'string') cid = CID.parse(cid);
  // console.log('cid.code: ', cid.code);
  // if raw, use length of block
  if (cid.code == rawCode) {
    return block.length;
  }

  const { Data } = decode(block);

  // otherwise, parse to unixfs node
  const unixfs = UnixFS.unmarshal(Data);

  if (!allowDir && unixfs.isDirectory()) {
    throw new Error(`cid ${cid} is a directory, only files allowed`);
  }

  if (unixfs.data) {
    return unixfs.data.length;
  } else if (!unixfs.isDirectory()) {
    return unixfs.fileSize();
  } else {
    return unixfs.blockSizes.reduce((a, b) => a + b, BigInt(0));
  }
}

// ===========================================================================
export async function concat(ipfs, cids, sizes = {}) {
  if (cids.length === 1) {
    return cids[0];
  }

  const node = new UnixFS({ type: 'file' });

  const Links = await Promise.all(
    cids.map(async (cid) => {
      const Tsize = sizes[cid] !== undefined ? sizes[cid] : await getSize(ipfs, cid);

      return {
        Name: '',
        Hash: cid,
        Tsize,
      };
    }),
  );

  Links.map(({ Tsize }) => node.addBlockSize(Tsize));

  const Data = node.marshal();

  return await putBlock(ipfs, { Data, Links });
}

// ===========================================================================
async function _createDirLinks(ipfs, files) {
  const names = Object.keys(files);
  names.sort();

  return await Promise.all(
    names.map(async (Name) => {
      const { cid, size } = files[Name];
      // debugger;
      const Tsize = size !== undefined ? size : await getSize(ipfs, cid, true);

      return {
        Name,
        Hash: cid,
        Tsize,
      };
    }),
  );
}

// ===========================================================================
export async function makeDir(ipfs, files) {
  // debugger;
  const node = new UnixFS({ type: 'directory' });

  const Data = node.marshal();

  const Links = await _createDirLinks(ipfs, files);

  return await putBlock(ipfs, { Data, Links });
}

// ===========================================================================
export async function addToDir(ipfs, dirCid, files) {
  if (dirCid.code == rawCode) {
    throw new Error('raw cid -- not a directory');
  }

  const block = await ipfs.block.get(dirCid);

  const { Data, Links } = decode(block);

  // debugger;
  const node = UnixFS.unmarshal(Data);
  UnixFS.unmarshal;

  if (!node.isDirectory()) {
    throw new Error(`file cid -- not a directory`);
  }
  const newLinks = await _createDirLinks(ipfs, files);

  // debugger;
  const UpdatedLinks = [...Links, ...newLinks];

  // todo: disallow duplicates
  UpdatedLinks.sort((a, b) => (a.Name < b.Name ? -1 : 1));

  return await putBlock(ipfs, { Data, Links: UpdatedLinks });
}

//nodeCid refers to the dag node being updated, oldCid is the cid of the link to be replaced, newCid is the cid of the new link
export async function updateDagCid(ipfs, nodeCid, oldCid, newCid) {
  if (typeof nodeCid === 'string') oldCid = CID.parse(oldCid);
  if (typeof oldCid === 'string') oldCid = CID.parse(oldCid);
  if (typeof newCid === 'string') newCid = CID.parse(newCid);

  if (nodeCid.code == rawCode) {
    throw new Error('raw cid -- not a directory');
  }

  const block = await ipfs.block.get(nodeCid);

  const { Data, Links } = decode(block);

  const node = UnixFS.unmarshal(Data);
  UnixFS.unmarshal;

  if (!node.isDirectory()) {
    throw new Error(`file cid -- not a directory`);
  }

  const linkIdx = Links.findIndex((link) => link.Hash.equals(oldCid));

  // debugger;
  if (linkIdx !== -1) {
    Links[linkIdx].Hash = newCid;
  }

  return await putBlock(ipfs, { Data, Links });
}

// ===========================================================================
function putBlock(ipfs, node) {
  return ipfs.block.put(encode(prepare(node)), {
    version: 1,
    format: 'dag-pb',
  });
}
