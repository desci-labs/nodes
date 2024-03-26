import { Signer, Wallet, getDefaultProvider } from "ethers";
import { SigningKey } from "ethers/lib/utils.js";
import { getConfig } from "../config/index.js";

export const signerFromPkey = (pkey: string): Signer =>
  walletFromPkey(pkey);

const walletFromPkey = (pkey: string): Wallet => {
  const provider = getDefaultProvider(getConfig().chainConfig.rpcUrl);
  const paddedPkey = ensurePkeyPadding(pkey);
  const key = new SigningKey(paddedPkey);
  return new Wallet(key, provider);
};

const ensurePkeyPadding = (pkey: string) =>
  pkey.startsWith("0x") ? pkey : `0x${pkey}`;
