import { Response } from "express";
import { ethers } from "ethers";
import { logger as parentLogger } from '../../logger.js';
import { RequestWithNode } from "../../middleware/authorisation.js";
import { contracts, typechain as tc } from "@desci-labs/desci-contracts";
import { DpidMintedEvent } from "@desci-labs/desci-contracts/dist/typechain-types/DpidAliasRegistry.js";

type DpidResponse = DpidSuccessResponse | DpidErrorResponse;
export type DpidSuccessResponse = {
  dpid: number;
};

export type DpidErrorResponse = {
  error: string;
};

/** Not secret: pre-seeded ganache account for local dev */
const GANACHE_PKEY = "59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

let aliasRegistryAddress: string;
const url = process.env.SERVER_URL;

if (url.includes("localhost")) {
  aliasRegistryAddress = contracts.localDpidAliasInfo.proxies.at(0).address;
} else if (url.includes("dev") || url.includes("staging")) {
  aliasRegistryAddress = contracts.devDpidAliasInfo.proxies.at(0).address;
} else if (process.env.NODE_ENV === "production") {
  aliasRegistryAddress = contracts.prodDpidAliasInfo.proxies.at(0).address;
};

export const createDpid = async (req: RequestWithNode, res: Response<DpidResponse>) => {
  const owner = req.user;
  const node = req.node;
  const { uuid } = req.body;

  const logger = parentLogger.child({
    module: "NODE::createDpidController",
    body: req.body,
    uuid,
    user: owner,
    ceramicStream: node.ceramicStream,
  });

  if (!uuid) {
    return res.status(400).json({ error: "UUID is required" });
  };

  if (!process.env.HOT_WALLET_KEY) {
    logger.error("hot wallet not configured");
    return res.status(500).json({ error: "dpid registration not available" });
  };

  if (!process.env.ETHEREUM_RPC_URL) {
    logger.error("ethereum RPC endpoint not configured");
    return res.status(500).json({ error: "dpid registration not available" });
  };

  try {
    debugger;
    const provider = new ethers.providers.JsonRpcProvider(
      process.env.ETHEREUM_RPC_URL
    );

    await provider.ready;
    const wallet = new ethers.Wallet(
      url.includes("localhost") ? GANACHE_PKEY : process.env.HOT_WALLET_KEY,
      provider,
    );

    const dpidAliasRegistry = tc.DpidAliasRegistry__factory.connect(
      aliasRegistryAddress,
      wallet,
    );

    const derp = await dpidAliasRegistry.owner();
    console.log("owner:", derp);
    const hasDpid = await dpidAliasRegistry.find(node.ceramicStream);

    if (ethers.BigNumber.from(hasDpid).toNumber() !== 0) {
      return res.status(400).json({
        error: `stream already has dPID: ${node.ceramicStream}`,
      });
    };

    const tx = await dpidAliasRegistry.mintDpid(node.ceramicStream);
    const receipt = await tx.wait();
    const { args: [dpidBn, streamID] }= receipt.events[0] as DpidMintedEvent;
    const dpid = ethers.BigNumber.from(dpidBn).toNumber();
    
    logger.info(
      `Created dPID alias ${dpid} for stream ${streamID}`,
    );

    return res.status(200).send({ dpid });
  } catch (err) {
    logger.error({ err }, "node-create-dpid-err");
    return res.status(400).send({ error: err.message });
  };
};
