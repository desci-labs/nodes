import { expect } from "chai";
// @ts-ignore
import { ethers, upgrades } from "hardhat";
import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractFactory,
  Signer,
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
} from "../typechain-types";
import { randomBytes } from "crypto";
import { formatBytes32String } from "ethers/lib/utils";
import CID from "cids";

describe("ResearchObjectProxy", function () {
  let accounts: Signer[];
  let ResearchObjectFactory: ResearchObject__factory;
  let researchObject: ResearchObject;

  let DpidRegistryFactory: DpidRegistry__factory;
  let dpidRegistry: DpidRegistry;

  beforeEach(async function () {
    accounts = await ethers.getSigners();

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
    ])) as ResearchObject;
    await researchObject.deployed();
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
