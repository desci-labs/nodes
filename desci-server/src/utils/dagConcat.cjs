//Thanks to https://github.com/webrecorder/ipfs-composite-files
/* eslint-disable @typescript-eslint/no-var-requires */
const dagPb = require('@ipld/dag-pb');
const UnixFS = require('ipfs-unixfs');
const { code } = require('multiformats/codecs/raw');

const rawCode = code;
// ===========================================================================
async function getSize(ipfs, cid, allowDir = false) {
  // debugger;
  const block = await ipfs.block.get(cid);
  // if raw, use length of block
  if (cid.code == rawCode) {
    return block.length;
  }

  const { Data } = dagPb.decode(block);

  // otherwise, parse to unixfs node
  let unixfs = UnixFS.unmarshal(Data);

  if (!allowDir && unixfs.isDirectory()) {
    throw new Error(`cid ${cid} is a directory, only files allowed`);
  }

  if (unixfs.data) {
    return unixfs.data.length;
  } else if (!unixfs.isDirectory()) {
    return unixfs.fileSize();
  } else {
    // eslint-disable-next-line no-array-reduce/no-reduce
    return unixfs.blockSizes.reduce((a, b) => a + b, 0);
  }
}

// ===========================================================================
async function concat(ipfs, cids, sizes = {}) {
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
async function makeDir(ipfs, files) {
  const node = new UnixFS({ type: 'directory' });

  const Data = node.marshal();

  const Links = await _createDirLinks(ipfs, files);

  return await putBlock(ipfs, { Data, Links });
}

// ===========================================================================
async function addToDir(ipfs, dirCid, files) {
  if (dirCid.code == rawCode) {
    throw new Error('raw cid -- not a directory');
  }

  const block = await ipfs.block.get(dirCid);

  let { Data, Links } = dagPb.decode(block);

  // debugger;
  let node = UnixFS.unmarshal(Data);
  UnixFS.unmarshal;

  if (!node.isDirectory()) {
    throw new Error(`file cid -- not a directory`);
  }
  // debugger;
  const newLinks = await _createDirLinks(ipfs, files);

  Links = [...Links, ...newLinks];

  // todo: disallow duplicates
  Links.sort((a, b) => (a.Name < b.Name ? -1 : 1));

  return await putBlock(ipfs, { Data, Links });
}

// ===========================================================================
function putBlock(ipfs, node) {
  return ipfs.block.put(dagPb.encode(dagPb.prepare(node)), {
    version: 1,
    format: 'dag-pb',
  });
}

module.exports = {
  addToDir,
  concat,
  getSize,
  makeDir,
};
