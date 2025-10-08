import { contracts, typechain as tc } from "@desci-labs/desci-contracts";
import { Signer, providers } from "ethers";
import { type NodesEnv } from "./index.js";

export type NodesContract =
  | tc.ResearchObject
  | tc.ResearchObjectV2
  | tc.DpidRegistry
  | tc.DpidAliasRegistry;

export type ContractConnector<T extends NodesContract> = (
  signerOrProvider: Signer | providers.Provider,
) => T;

export type ChainID =
  | "1337" // local
  | "11155111" // sepolia
  | "11155420" // optimism sepolia
  | "10"; // optimism mainnet

export type LegacyChainConfig = {
  /** Decimal chain ID */
  chainId: ChainID;
  /** RPC URL to use for communication */
  rpcUrl: string;
  /** Given a signer or provider, create a contract instance */
  researchObjectConnector: ContractConnector<
    tc.ResearchObject | tc.ResearchObjectV2
  >;
  /** Given a signer or provider, create a contract instance */
  dpidRegistryConnector: ContractConnector<tc.DpidRegistry>;
};

export type ChainConfig = {
  /** Decimal chain ID */
  chainId: ChainID;
  /** RPC URL to use for communication */
  rpcUrl: string;
  /** Given a signer or provider, create a contract instance */
  dpidAliasRegistryConnector: ContractConnector<tc.DpidAliasRegistry>;
};

export const LEGACY_CHAIN_CONFIGS = {
  local: {
    chainId: "1337",
    rpcUrl: process.env.CHAIN_RPC_URL || "http://localhost:8545",
    researchObjectConnector: (signerOrProvider) =>
      tc.ResearchObjectV2__factory.connect(
        contracts.localRoInfo.proxies[0].address,
        signerOrProvider,
      ),
    dpidRegistryConnector: (signerOrProvider) =>
      tc.DpidRegistry__factory.connect(
        contracts.localDpidInfo.proxies[0].address,
        signerOrProvider,
      ),
  },
  dev: {
    chainId: "11155111",
    rpcUrl: "https://reverse-proxy-dev.desci.com/rpc_sepolia",
    researchObjectConnector: (signerOrProvider) =>
      tc.ResearchObjectV2__factory.connect(
        contracts.devRoInfo.proxies[0].address,
        signerOrProvider,
      ),
    dpidRegistryConnector: (signerOrProvider) =>
      tc.DpidRegistry__factory.connect(
        contracts.devDpidInfo.proxies[0].address,
        signerOrProvider,
      ),
  },
  staging: {
    chainId: "11155111",
    rpcUrl: "https://reverse-proxy-staging.desci.com/rpc_sepolia",
    researchObjectConnector: (signerOrProvider) =>
      tc.ResearchObjectV2__factory.connect(
        contracts.devRoInfo.proxies[0].address,
        signerOrProvider,
      ),
    dpidRegistryConnector: (signerOrProvider) =>
      tc.DpidRegistry__factory.connect(
        contracts.devDpidInfo.proxies[0].address,
        signerOrProvider,
      ),
  },
  prod: {
    chainId: "11155111",
    rpcUrl: "https://reverse-proxy-prod.desci.com/rpc_sepolia",
    researchObjectConnector: (signerOrProvider) =>
      tc.ResearchObjectV2__factory.connect(
        contracts.prodRoInfo.proxies[0].address,
        signerOrProvider,
      ),
    dpidRegistryConnector: (signerOrProvider) =>
      tc.DpidRegistry__factory.connect(
        contracts.prodDpidInfo.proxies[0].address,
        signerOrProvider,
      ),
  },
} as const satisfies { [Env in NodesEnv]: LegacyChainConfig };

export const CHAIN_CONFIGS = {
  local: {
    chainId: "1337",
    rpcUrl: process.env.CHAIN_RPC_URL || "http://localhost:8545",
    dpidAliasRegistryConnector: (signerOrProvider) =>
      tc.DpidAliasRegistry__factory.connect(
        contracts.localDpidAliasInfo.proxies.at(0)!.address,
        signerOrProvider,
      ),
  },
  dev: {
    chainId: "11155420",
    rpcUrl: "https://reverse-proxy-dev.desci.com/rpc_opt_sepolia",
    dpidAliasRegistryConnector: (signerOrProvider) =>
      tc.DpidAliasRegistry__factory.connect(
        contracts.devDpidAliasInfo.proxies[0].address,
        signerOrProvider,
      ),
  },
  staging: {
    chainId: "11155420",
    rpcUrl: "https://reverse-proxy-staging.desci.com/rpc_opt_sepolia",
    dpidAliasRegistryConnector: (signerOrProvider) =>
      tc.DpidAliasRegistry__factory.connect(
        contracts.prodDpidAliasInfo.proxies[0].address, // also uses prod contracts
        signerOrProvider,
      ),
  },
  prod: {
    chainId: "11155420",
    rpcUrl: "https://reverse-proxy-prod.desci.com/rpc_opt_sepolia",
    dpidAliasRegistryConnector: (signerOrProvider) =>
      tc.DpidAliasRegistry__factory.connect(
        contracts.prodDpidAliasInfo.proxies[0].address,
        signerOrProvider,
      ),
  },
} as const satisfies { [Env in NodesEnv]: ChainConfig };
