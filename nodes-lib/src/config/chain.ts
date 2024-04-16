import { contracts, typechain as tc } from "@desci-labs/desci-contracts";
import { Signer, providers } from "ethers";
import { type NodesEnv } from "./index.js";

export type NodesContract =
  | tc.ResearchObject
  | tc.ResearchObjectV2
  | tc.DpidRegistry;
export type ContractConnector<T extends NodesContract> =
  (signerOrProvider: Signer | providers.Provider) => T;

export type ChainID =
  | "1337"
  | "11155111";

export type ChainConfig = {
  /** Decimal chain ID */
  chainId: ChainID,
  /** RPC URL to use for communication */
  rpcUrl: string,
  /** Given a signer or provider, create a contract instance */
  researchObjectConnector: ContractConnector<tc.ResearchObject | tc.ResearchObjectV2>,
  /** Given a signer or provider, create a contract instance */
  dpidRegistryConnector: ContractConnector<tc.DpidRegistry>,
};

export const CHAIN_CONFIGS = {
  local: {
    chainId: "1337",
    rpcUrl: "http://localhost:8545",
    researchObjectConnector: signerOrProvider => tc.ResearchObject__factory.connect(
      contracts.localRoInfo.proxies.at(0)!.address,
      signerOrProvider
    ),
    dpidRegistryConnector: signerOrProvider => tc.DpidRegistry__factory.connect(
      contracts.localDpidInfo.proxies.at(0)!.address,
      signerOrProvider
    ),
  },
  dev: {
    chainId: "11155111",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo",
    researchObjectConnector: signerOrProvider => tc.ResearchObjectV2__factory.connect(
      contracts.devRoInfo.proxies.at(0)!.address,
      signerOrProvider
    ),
    dpidRegistryConnector: signerOrProvider => tc.DpidRegistry__factory.connect(
      contracts.devDpidInfo.proxies.at(0)!.address,
      signerOrProvider
    ),
  },
  prod: {
    chainId: "11155111",
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo",
    researchObjectConnector: signerOrProvider => tc.ResearchObjectV2__factory.connect(
      contracts.prodRoInfo.proxies.at(0)!.address,
      signerOrProvider
    ),
    dpidRegistryConnector: signerOrProvider => tc.DpidRegistry__factory.connect(
      contracts.prodDpidInfo.proxies.at(0)!.address,
      signerOrProvider
    ),
  },
} as const satisfies { [Env in NodesEnv]: ChainConfig };
