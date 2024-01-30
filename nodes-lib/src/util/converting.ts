import { decode } from "url-safe-base64";
import Base64Binary from "./base64binary.js";
import { base16 } from "multiformats/bases/base16";
import { base32 } from "multiformats/bases/base32";
import { CID as mfCID } from "multiformats/cid"
import CID from "cids";

export const convertUUIDToHex = (uuid: string) => {
  const decoded = decode(uuid + ".");
  const buffer = Base64Binary.decodeArrayBuffer(decoded).slice(0, 32);
  let base64UuidToBase16 = Buffer.from(buffer).toString("hex");
  base64UuidToBase16 = "0x" + (base64UuidToBase16.length % 2 == 0
    ? base64UuidToBase16
    : "0" + base64UuidToBase16);
  return base64UuidToBase16;
};

export const getBytesFromCIDString = (cid: string) => {
    const c = new CID(cid);
    const rootStrHex = c.toString("base16");
    const hexEncoded = "0x" + (rootStrHex.length % 2 === 0 ? rootStrHex : "0" + rootStrHex);
    return hexEncoded;
};

export const convertHexToCID = (hexCid: string) => {
  hexCid = hexCid.substring(2); // remove 0x
  hexCid = hexCid.length % 2 === 0 ? hexCid.substring(1) : hexCid;

  const res2 = base16.decode(hexCid);
  const cid = mfCID.decode(res2);
  return cid.toString(base32);
};
