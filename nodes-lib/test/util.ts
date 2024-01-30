import KeyDIDResolver from "key-did-resolver";
import { webcrypto } from "crypto";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";

const keyResolver = KeyDIDResolver.getResolver();

export const randomDID = async () => {
  const privateKey = new Uint8Array(32);
  webcrypto.getRandomValues(privateKey);
  const did = new DID({
    provider: new Ed25519Provider(privateKey),
    resolver: {
      ...keyResolver,
    },
  });
  await did.authenticate();
  return did;
};

export const sleep = async (seconds: number) => {
  await new Promise(r => setTimeout(r, seconds));
};
