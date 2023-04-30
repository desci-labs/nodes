import { Bytes, BigInt } from "@graphprotocol/graph-ts";
import { VersionPush } from "./generated/DeSciNodes/ResearchObject";
import { ResearchObjectVersion, ResearchObject } from "./generated/schema";

import { encode, decode } from "as-base64";

// export const encodeBase64UrlSafe = (bytes: Buffer) => {
//   return encode(bytes);
// };

// export const convertHexToCID = (hex: string) => {
//   hex = hex.substring(2); // remove 0x
//   hex = hex.length % 2 === 0 ? hex.substring(1) : hex;
//   const cidBytes = Buffer.from(hex, "hex");

//   const res2 = base16.decode(hex);
//   const cid = multiformats.CID.decode(res2);
//   return cid.toString(base32);
// };

function toBytes(hexString: String): Bytes {
  let result = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < hexString.length; i += 2) {
    result[i / 2] = parseInt(hexString.substr(i, 2), 16);
  }
  return result as Bytes;
}

function padHexedUUID(hexString: string): string {
  const currentLength = hexString.length;
  if (currentLength === 66) return hexString;

  const split = hexString.split("0x");
  const difference = 66 - currentLength;
  const padding = "0".repeat(difference);
  // split.splice(1, 0, padding);
  const newHex = ["0x", padding, split[1]].join("");
  return newHex;
}

export function handleVersionPush(event: VersionPush): void {
  const uuid = event.params._uuid;
  const paddedHexedUUID = padHexedUUID(uuid.toHexString());

  let ro = ResearchObject.load(paddedHexedUUID);

  if (!ro) {
    ro = new ResearchObject(paddedHexedUUID);
    ro.owner = event.params._from.toHex();
    ro.id64 = encode(Bytes.fromBigInt(uuid));
    ro.id10 = uuid.toString();
  }

  const versionString = event.transaction.hash.toHexString();
  let rov = new ResearchObjectVersion(versionString);
  rov.researchObject = ro.id;
  rov.time = event.block.timestamp;
  rov.cid = event.params._cid.toHex();
  rov.from = event.params._from.toHex();
  rov.save();

  ro.recentCid = rov.cid;

  // let ro = new ResearchObjectVersion(event.transaction.hash.toHex());
  // ro.tokenURI = `test-${event.params._uuid.toHex()}`;
  // ro.tokenID = event.params._uuid;
  // ro.mintTime = event.block.timestamp;

  ro.save();
}
