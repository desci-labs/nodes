import { contracts, typechain as tc } from "@desci-labs/desci-contracts";
import { Signer, providers } from "ethers";
import { type NodesEnv } from "./index.js";

export type ContractConnector =
  (signerOrProvider: Signer | providers.Provider) => tc.DpidAliasRegistry;

export type ChainID =
  | "1337" // local
  | "11155111" // sepolia
  | "11155420" // optimism sepolia
  | "10"; // optimism mainnet

export type ChainConfig = {
  /** Decimal chain ID */
  chainId: ChainID,
  /** RPC URL to use for communication */
  rpcUrl: string,
  /** Given a signer or provider, create a contract instance */
  dpidAliasRegistryConnector: ContractConnector,
};

export const CHAIN_CONFIGS = {
  local: {
    chainId: "1337",
    rpcUrl: "http://localhost:8545",
    dpidAliasRegistryConnector: signerOrProvider => tc.DpidAliasRegistry__factory.connect(
      contracts.localDpidAliasInfo.proxies.at(0)!.address,
      signerOrProvider,
    ),
  },
  dev: {
    chainId: "11155420",
    rpcUrl: "https://reverse-proxy-dev.desci.com/rpc_opt_sepolia",
    dpidAliasRegistryConnector: signerOrProvider => tc.DpidAliasRegistry__factory.connect(
      contracts.devDpidAliasInfo.proxies[0].address,
      signerOrProvider,
    ),
  },
  staging: {
    chainId: "11155420",
    rpcUrl: "https://reverse-proxy-staging.desci.com/rpc_opt_sepolia",
    dpidAliasRegistryConnector: signerOrProvider => tc.DpidAliasRegistry__factory.connect(
      contracts.prodDpidAliasInfo.proxies[0].address, // also uses prod contracts
      signerOrProvider,
    ),
  },
  prod: {
    chainId: "11155420",
    rpcUrl: "https://reverse-proxy-prod.desci.com/rpc_opt_sepolia",
    dpidAliasRegistryConnector: signerOrProvider => tc.DpidAliasRegistry__factory.connect(
      contracts.prodDpidAliasInfo.proxies[0].address,
      signerOrProvider,
    ),
  }

} as const satisfies { [Env in NodesEnv]: ChainConfig};
