import { base16 } from "multiformats/bases/base16";
import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";

export const convertCidStringToHex = (cid: string) => {
  const cidObj = CID.parse(cid);
  const cidHex = cidObj.toString(base16);
  return cidHex;
};
