import { decode } from "url-safe-base64";
import Base64Binary from "./base64binary.js";
import CID from "cids";

export const convertUUIDToHex = (uuid: string) => {
    const decoded = decode(uuid + ".");
    const buffer = Base64Binary.decodeArrayBuffer(decoded).slice(0, 32);
    let base64UuidToBase16 = Buffer.from(buffer).toString("hex");
    base64UuidToBase16 =
        "0x" + (base64UuidToBase16.length % 2 == 0 ? base64UuidToBase16 : "0" + base64UuidToBase16);
    return base64UuidToBase16;
};

export const getBytesFromCIDString = (cid: string) => {
    const c = new CID(cid)
    const rootStrHex = c.toString("base16");
    const hexEncoded = "0x" + (rootStrHex.length % 2 === 0 ? rootStrHex : "0" + rootStrHex);
    return hexEncoded;
};
