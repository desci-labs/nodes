import { expect } from "chai";
// @ts-ignore
import { ethers, upgrades } from "hardhat";
import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractFactory,
  Signer,
  Wallet,
  utils,
} from "ethers";
import "@nomiclabs/hardhat-waffle";
import {
  ResearchObject__factory,
  ResearchObject,
  ContextUpgradeable,
  DpidRegistry__factory,
  DpidRegistry,
  TestERC721,
  ERC721,
  ERC721__factory,
  Paymaster,
} from "../typechain-types";
import { randomBytes } from "crypto";
import { formatBytes32String } from "ethers/lib/utils";
import CID from "cids";
import { GsnTestEnvironment } from "@opengsn/dev";
import { wrapContract } from "@opengsn/provider/dist/WrapContract";
import { GSNConfig, ether } from "@opengsn/provider";
const ResearchObjectAbi = require("../artifacts/contracts/ResearchObject.sol/ResearchObject.json");
const IRelayHub = require("../artifacts/@opengsn/contracts/src/interfaces/IRelayHub.sol/IRelayHub.json");

describe("ResearchObjectProxy", function () {
  let accounts: Signer[];
  let ResearchObjectFactory: ResearchObject__factory;
  let researchObject: ResearchObject;

  let DpidRegistryFactory: DpidRegistry__factory;
  let dpidRegistry: DpidRegistry;
  let pm: Paymaster,
    user: Signer,
    contract: ResearchObject,
    forwarderAddress: string | undefined,
    paymasterAddress: string | undefined,
    relayHubAddress: string | undefined,
    gnsConfig: Partial<GSNConfig>;

  beforeEach(async function () {
    accounts = await ethers.getSigners();
    // const env = await GsnTestEnvironment.startGsn("localhost");
    // const deployment = env.contractsDeployment; 
    const deployment = await GsnTestEnvironment.loadDeployment(
      "http://localhost:8545"
    );
    console.log("ethers provider")
    console.log("GsnTestEnvironment.startGsn(", deployment, ")");
    forwarderAddress = (await deployment).forwarderAddress;
    relayHubAddress = (await deployment).relayHubAddress;
    paymasterAddress = (await deployment).paymasterAddress;

    // deploy and initialize paymaster
    gnsConfig = {
      paymasterAddress: "",
      performDryRunViewRelayCall: false,
      jsonStringifyRequest: false,
      loggerConfiguration: {
        logLevel: "debug",
      },
      
    };
    // const Paymaster = await ethers.getContractFactory("Paymaster");
    // const paymaster = (await Paymaster.deploy()) as Paymaster;
    // await paymaster.deployed();
    let paymaster = new ethers.Contract(
      relayHubAddress!,
      IRelayHub.abi,
      new ethers.providers.StaticJsonRpcProvider("http://127.0.0.1:8545/")
    ) as Paymaster;
    console.log("Version paymaster", await paymaster.versionPaymaster());

    const relayHub = new ethers.Contract(
      relayHubAddress!,
      IRelayHub.abi,
      new ethers.providers.StaticJsonRpcProvider("http://127.0.0.1:8545/")
    );
    console.log("paymasterAddress", paymasterAddress);
    console.log("forwarderAddress", forwarderAddress);
    console.log("relay hub", relayHub?.address);
    console.log("relayHub version", await relayHub.versionHub());
    await paymaster.setRelayHub(relayHubAddress!);
    await paymaster.setTrustedForwarder(forwarderAddress!);
    pm = paymaster;
    gnsConfig.paymasterAddress = paymaster.address;
    // Fund paymaster
    const tx = await accounts[1].sendTransaction({
      to: paymaster.address,
      value: utils.parseEther("1"),
    });
    await tx.wait();

    DpidRegistryFactory = (await ethers.getContractFactory(
      "DpidRegistry"
    )) as unknown as DpidRegistry__factory;

    dpidRegistry = (await upgrades.deployProxy(
      DpidRegistryFactory,
      []
    )) as DpidRegistry;
    await dpidRegistry.deployed();

    ResearchObjectFactory = (await ethers.getContractFactory(
      "ResearchObject"
    )) as unknown as ResearchObject__factory;

    researchObject = (await upgrades.deployProxy(ResearchObjectFactory, [
      dpidRegistry.address,
      forwarderAddress,
    ])) as ResearchObject;
    await researchObject.deployed();

    user = Wallet.createRandom();
    user = user.connect(ethers.provider);
    console.log("provider", await user.getAddress());
    contract = (await new ethers.Contract(
      researchObject.address,
      ResearchObjectAbi.abi,
      user
    )) as ResearchObject;
    contract = (await wrapContract(
      contract as any,
      gnsConfig
    )) as unknown as ResearchObject;

    const owner = await contract.owner();
    console.log("contract owner", owner);
    console.log(
      "before::: ResearchObject contract",
      researchObject.address,
      contract.address
    );
  });

  describe("Gas", () => {
    it("Costs a reasonable amount of gas to deploy", async () => {
      // wait until the transaction is mined
      let tx = await researchObject.deployed();
      let res = await tx.deployTransaction.wait();
      console.log(`Deployment cost ${res.cumulativeGasUsed} gas units`);
      expect(
        BigNumber.from(res.cumulativeGasUsed).lte(32000000),
        `Gas limit exceeded`
      ).to.be.true;
    });
  });

  describe.only("Gasless transaction", () => {
    // let contract, user: Signer;

    describe("Minting", () => {
      it("Cost no amount of gas to mint", async () => {
        let uuid = randomBytes(32);
        const mintTx = await contract.mint(uuid, getBytes());

        // wait until the transaction is mined
        const res = await mintTx.wait();
        console.log(`Mint cost ${res.cumulativeGasUsed} gas units`);
        expect(
          BigNumber.from(res.cumulativeGasUsed).lte(300000),
          "Gas limit exceeded"
        ).to.be.true;

        // emit VersionPush(_msgSender(), tokenId, cid);
      });
    });
  });

  describe("ERC721", () => {
    describe("Minting", () => {
      it("Is mintable", async function () {
        let uuid = randomBytes(32);
        const mintTx = await researchObject.mint(uuid, getBytes());

        // wait until the transaction is mined
        const res = await mintTx.wait();
        console.log(`Mint cost ${res.cumulativeGasUsed} gas units`);
        expect(
          BigNumber.from(res.cumulativeGasUsed).lte(300000),
          "Gas limit exceeded"
        ).to.be.true;
      });

      it("Is mintable with dPID", async function () {
        let uuid = randomBytes(32);
        const mintTx = await researchObject.mintWithDpid(
          uuid,
          getBytes(),
          ethers.utils.formatBytes32String(""),
          0,
          { value: ethers.utils.parseUnits("500000", "gwei") }
        );

        // wait until the transaction is mined
        const res = await mintTx.wait();
        console.log(`Mint cost ${res.cumulativeGasUsed} gas units`);
        expect(
          BigNumber.from(res.cumulativeGasUsed).lte(300000),
          "Gas limit exceeded"
        ).to.be.true;

        const mintTx2 = await researchObject.mintWithDpid(
          randomBytes(32),
          getBytes(),
          ethers.utils.formatBytes32String(""),
          1,
          { value: ethers.utils.parseUnits("500000", "gwei") }
        );

        // wait until the transaction is mined
        const res2 = await mintTx2.wait();
        console.log(`Mint cost ${res2.cumulativeGasUsed} gas units`);
        expect(
          BigNumber.from(res2.cumulativeGasUsed).lte(300000),
          "Gas limit exceeded"
        ).to.be.true;
      });

      it("Is mintable to the caller by default", async function () {
        let uuid = randomBytes(32);
        const mintTx = await researchObject
          .connect(accounts[1])
          .mint(uuid, getBytes());

        // wait until the transaction is mined
        await mintTx.wait();

        expect(await researchObject.ownerOf(uuid)).eq(
          await accounts[1].getAddress(),
          "Wrong owner"
        );
      });

      it("Owner can set a URI", async function () {
        let uuid = randomBytes(32);
        const mintTx = await researchObject
          .connect(accounts[4])
          .mint(uuid, getBytes());

        await mintTx.wait();
        console.log(
          "WONER",
          await researchObject.owner(),
          await accounts[0].getAddress()
        );
        const uri = "http://api.desci.com/test/";
        const setTx = await researchObject.setURI(uri);

        await setTx.wait();

        const tokenId = await researchObject.tokenURI(uuid);

        expect(tokenId).eq(
          uri +
            BigNumber.from("0x" + Buffer.from(uuid).toString("hex")).valueOf(),
          "Wrong uri"
        );
      });

      it("Others can't set a URI", async function () {
        let uuid = randomBytes(32);
        const mintTx = await researchObject
          .connect(accounts[4])
          .mint(uuid, getBytes());

        await mintTx.wait();

        const uri = "http://api.desci.com/test/";
        await expect(
          researchObject.connect(accounts[4]).setURI(uri)
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });
    });
  });
});

const getBytes = () => {
  const rootStrHex = new CID(
    "bafybeiexeicryslhwnydxpffx6tv2lz6jg4orcm4pi2val53v4ig77i7ri"
  ).toString("base16");
  const hexEncoded =
    "0x" + (rootStrHex.length % 2 == 0 ? rootStrHex : "0" + rootStrHex);
  return hexEncoded;
};

const getBytes2 = () => {
  const rootStrHex = new CID(
    "bafybeidockyyycgrbwzacxknscvewla4ymlr4k54mbqc3ttsiq62ws2fqu"
  ).toString("base16");
  const hexEncoded =
    "0x" + (rootStrHex.length % 2 == 0 ? rootStrHex : "0" + rootStrHex);
  return hexEncoded;
};
