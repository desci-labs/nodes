import { 
    DpidRegistry,
  DpidRegistry__factory,
  ResearchObject,
  ResearchObjectV2,
  ResearchObjectV2__factory,
  ResearchObject__factory
} from "@desci-labs/desci-contracts/typechain-types/index.js";
import { Signer, providers } from "ethers";
import { type NodesEnv } from "./index.js";

import localRoInfo from "@desci-labs/desci-contracts/.openzeppelin/unknown-research-object.json";
import localDpidInfo from "@desci-labs/desci-contracts/.openzeppelin/unknown-dpid.json";
import devRoInfo from "@desci-labs/desci-contracts/.openzeppelin/sepoliaDev-research-object.json";
import devDpidInfo from "@desci-labs/desci-contracts/.openzeppelin/sepoliaDev-dpid.json";
import prodRoInfo from "@desci-labs/desci-contracts/.openzeppelin/sepoliaProd-research-object.json";
import prodDpidInfo from "@desci-labs/desci-contracts/.openzeppelin/sepoliaProd-dpid.json";

export type SigMaker = Signer | providers.JsonRpcSigner;
export type NodesContract =
  | ResearchObject
  | ResearchObjectV2
  | DpidRegistry;
export type ContractConnector<T extends NodesContract> =
  (signer: SigMaker) => T;

export type ChainConfig = {
  rpcUrl: string,
  researchObjectConnector: ContractConnector<ResearchObject | ResearchObjectV2>,
  dpidRegistryConnector: ContractConnector<DpidRegistry>,
};

export const CHAIN_CONFIGS = {
  local: {
    rpcUrl: "http://localhost:8545",
    researchObjectConnector: signer => ResearchObject__factory.connect(
      localRoInfo.proxies.at(0)!.address,
      signer
    ),
    dpidRegistryConnector: signer => DpidRegistry__factory.connect(
      localDpidInfo.proxies.at(0)!.address,
      signer
    ),
  },
  dev: {
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo",
    researchObjectConnector: signer => ResearchObjectV2__factory.connect(
      devRoInfo.proxies.at(0)!.address,
      signer
    ),
    dpidRegistryConnector: signer => DpidRegistry__factory.connect(
      devDpidInfo.proxies.at(0)!.address,
      signer
    ),
  },
  prod: {
    rpcUrl: "https://eth-sepolia.g.alchemy.com/v2/demo",
    researchObjectConnector: signer => ResearchObjectV2__factory.connect(
      prodRoInfo.proxies.at(0)!.address,
      signer
    ),
    dpidRegistryConnector: signer => DpidRegistry__factory.connect(
      prodDpidInfo.proxies.at(0)!.address,
      signer
    ),
  },
} as const satisfies { [Env in NodesEnv]: ChainConfig };
