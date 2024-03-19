import { expect } from "chai";
import { ethers } from "hardhat";
import {
  BigNumber,
  BigNumberish,
  Contract,
  ContractFactory,
  Signer,
} from "ethers";
import "@nomiclabs/hardhat-waffle";
import { ResearchObject__factory, ResearchObject } from "../typechain-types";
import { randomBytes } from "crypto";
import { convertCidStringToHex } from "./lib/utils";

describe("ResearchObject", function () {
  let accounts: Signer[];
  let ResearchObjectFactory: ResearchObject__factory;
  let researchObject: ResearchObject;

  beforeEach(async function () {
    accounts = await ethers.getSigners();

    ResearchObjectFactory = (await ethers.getContractFactory(
      "ResearchObject"
    )) as unknown as ResearchObject__factory;

    researchObject = await ResearchObjectFactory.deploy();
    await researchObject.deployed();
  });

  describe("Gas", () => {
    it("Costs a reasonable amount of gas to deploy", async () => {
      // wait until the transaction is mined
      let tx = await researchObject.deployed();
      let res = await tx.deployTransaction.wait();
      // console.log("DISCOVERY DEPLOY", res);
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

        expect(
          BigNumber.from(res.cumulativeGasUsed).lte(300000),
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

      it("Can be minted by non-deployer", async function () {
        let uuid = randomBytes(32);
        const mintTx = await researchObject
          .connect(accounts[4])
          .mint(uuid, getBytes());

        await mintTx.wait();

        const owner = await researchObject.ownerOf(uuid);

        expect(owner).eq(await accounts[4].getAddress(), "Wrong owner");
      });
    });

    describe("Transfers", () => {
      it("Can not be transferred after mint", async function () {
        let uuid = randomBytes(32);
        const mintTx = await researchObject.mint(uuid, getBytes());

        await mintTx.wait();

        const fromAddress = await accounts[0].getAddress();
        const toAddress = await accounts[1].getAddress();

        await expect(
          researchObject.transferFrom(fromAddress, toAddress, uuid)
        ).to.be.revertedWith("no transfer");

        const owner = await researchObject.ownerOf(uuid);

        expect(owner).eq(fromAddress, "Wrong owner");
      });
    });

    describe("Metadata", () => {
      it("Prevents object holder which is not contract owner from adding revisions", async () => {
        let uuid = randomBytes(32);
        const mintTx = await researchObject
          .connect(accounts[2])
          .mint(uuid, getBytes());

        await mintTx.wait();

        const ro2 = await researchObject.connect(accounts[3]);
        await expect(ro2.updateMetadata(uuid, getBytes2())).to.be.revertedWith(
          "No permission"
        );

        expect(await researchObject._metadata(uuid)).to.eq(getBytes());
      });
      it("Object holder can add revisions", async () => {
        let uuid = randomBytes(32);
        const mintTx = await researchObject
          .connect(accounts[2])
          .mint(uuid, getBytes());

        await mintTx.wait();

        expect(await researchObject._metadata(uuid)).to.eq(getBytes());

        const updateTx = await researchObject
          .connect(accounts[2])
          .updateMetadata(uuid, getBytes2());
        await updateTx.wait();

        expect(await researchObject._metadata(uuid)).to.eq(getBytes2());
      });
    });
  });
});

const getBytes = () => {
  const rootStrHex = convertCidStringToHex(
    "bafkreiepot62powegf7tt73gyiz24facsdloywggattt2asz5y4eaqhkyi"
  );
  const hexEncoded =
    "0x" + (rootStrHex.length % 2 == 0 ? rootStrHex : "0" + rootStrHex);
  return hexEncoded;
};

const getBytes2 = () => {
  const rootStrHex = convertCidStringToHex(
    "bafybeidockyyycgrbwzacxknscvewla4ymlr4k54mbqc3ttsiq62ws2fqu"
  );
  const hexEncoded =
    "0x" + (rootStrHex.length % 2 == 0 ? rootStrHex : "0" + rootStrHex);
  return hexEncoded;
};
