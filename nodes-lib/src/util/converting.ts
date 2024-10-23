import { decode } from "url-safe-base64";
import Base64Binary from "./base64binary.js";
import { base16 } from "multiformats/bases/base16";
import { base32 } from "multiformats/bases/base32";
import { CID } from "multiformats/cid";
import { BigNumber, BigNumberish, utils } from "ethers";

export const convertUUIDToHex = (uuid: string): string => {
  const decoded = decode(uuid);
  const buffer = Base64Binary.decodeArrayBuffer(decoded).slice(0, 32);
  let base64UuidToBase16 = Buffer.from(buffer).toString("hex");
  base64UuidToBase16 =
    "0x" +
    (base64UuidToBase16.length % 2 == 0
      ? base64UuidToBase16
      : "0" + base64UuidToBase16);
  return base64UuidToBase16;
};

export const convertUUIDToDecimal = (uuid: string): string => {
  const asHex = convertUUIDToHex(uuid);
  return BigNumber.from(asHex).toString();
};

export const convertCidTo0xHex = (cid: string): string => {
  const c = CID.parse(cid);
  const rootStrHex = c.toString(base16);
  const paddedAndPrefixed =
    "0x" + (rootStrHex.length % 2 === 0 ? rootStrHex : "0" + rootStrHex);
  return paddedAndPrefixed;
};

export const convert0xHexToCid = (hexCid: string): string => {
  const without0x = hexCid.substring(2);
  const withoutPadding =
    without0x.length % 2 === 0 ? without0x.substring(1) : without0x;

  const cidBytes = base16.decode(withoutPadding);
  const cid = CID.decode(cidBytes);
  return cid.toString(base32);
};

export const bnToNumber = (bn: BigNumberish): number =>
  BigNumber.from(bn).toNumber();

export const bnToString = (bn: BigNumberish): string =>
  BigNumber.from(bn).toString();

export const fullDidToLcAddress = (did: string) =>
  did.split(":").pop()?.toLowerCase();
