import { Signer, Wallet, getDefaultProvider, providers } from "ethers";
import { SigningKey } from "ethers/lib/utils.js";
import { getNodesLibInternalConfig } from "../config/index.js";
import { AuthMethod, AuthMethodOpts, Cacao, SiweMessage } from "@didtools/cacao";
import { EthereumWebAuth, normalizeAccountId } from "@didtools/pkh-ethereum";
import { randomString } from "@stablelib/random";
import { AccountId } from "caip";
import { DIDSession } from "did-session";

export const signerFromPkey = (pkey: string): Signer =>
  walletFromPkey(pkey);

const walletFromPkey = (pkey: string): Wallet => {
  const provider = getDefaultProvider(getNodesLibInternalConfig().chainConfig.rpcUrl);
  const paddedPkey = ensurePkeyPadding(pkey);
  const key = new SigningKey(paddedPkey);
  return new Wallet(key, provider);
};

const ensurePkeyPadding = (pkey: string) =>
  pkey.startsWith("0x") ? pkey : `0x${pkey}`;

/**
 * Get auth method for cases where we have a simple signer instead of a
 * complete wallet provider (i.e. metamask or similar).
 *
 * Assumes `resources` is passed as opts to `DIDSession.authorize` at time
 * of use.
*/
const getManualSignatureAuthMethod = (
  accountId: AccountId,
  signer: Signer
): AuthMethod => async (opts: AuthMethodOpts) => {
  const now = new Date();
  const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const normalizedAccount = normalizeAccountId(accountId);

  const siweMessage = new SiweMessage({
    domain: new URL(getNodesLibInternalConfig().apiUrl).hostname,
    address: normalizedAccount.address,
    statement: opts.statement ?? 'Give this application access to some of your data on Ceramic',
    uri: opts.uri, // ID of the CACAO, randomly populated by DIDSession.authorize
    version: "1", // SIWX version
    nonce: opts.nonce ?? randomString(10),
    issuedAt: now.toISOString(),
    expirationTime: opts.expirationTime ?? oneWeekLater.toISOString(),
    chainId: normalizedAccount.chainId.reference,
    resources: opts.resources,
  })
  const signature = await signer.signMessage(siweMessage.signMessage());
  siweMessage.signature = signature;
  const cacao = Cacao.fromSiweMessage(siweMessage);

  // NOTE: If things act up for a new type of signer, uncomment and trace verification:
  // debugger;
  // verifyEIP191Signature(cacao, { verifiers: getEIP191Verifier()});

  return cacao;
};

/**
 * From a signer, potentially wrapping a capable wallet provider, authenticate
 * a DID session using a SIWE CACAO, and return the DID ready for writing to
 * streams on behalf of the account.
*/
export const authorizedSessionDidFromSigner = async (
  signer: Signer,
  resources: string[],
) => {
  // Fuckery to get the inner provider for a metamask signer
  const externalProvider = (signer.provider as providers.Web3Provider)?.provider;
  // Otherwise, it's likely a regular jsonRpcProvider
  const jsonRpcProvider = signer.provider as providers.JsonRpcProvider;

  const address = await signer.getAddress();
  const network = await jsonRpcProvider.getNetwork();
  const chainId = `eip155:${network.chainId}`;
  const caipAccountId = new AccountId({ address, chainId });

  let authMethod: AuthMethod;
  if (externalProvider) {
    authMethod = await EthereumWebAuth.getAuthMethod(
      externalProvider,
      caipAccountId,
    );
  } else {
    authMethod = getManualSignatureAuthMethod(caipAccountId, signer);
  };

  const session = await DIDSession.authorize(
    authMethod,
    { resources }
  );
  return session.did;
};
