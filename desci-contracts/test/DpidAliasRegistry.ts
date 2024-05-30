import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { ethers as hhe, upgrades } from "hardhat";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import {
  DpidAliasRegistry__factory,
  DpidAliasRegistry,
} from "../typechain-types";
import { TransactionReceipt } from "@ethersproject/abstract-provider";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { receiveMessageOnPort } from "worker_threads";

use(chaiAsPromised);

const FIRST_DPID = hhe.BigNumber.from(100);

describe("dPID", () => {
  let _accounts: SignerWithAddress[];
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let DpidAliasRegistryFactory: DpidAliasRegistry__factory;
  let dpidAliasRegistry: DpidAliasRegistry;

  before( async () => {
    _accounts = await hhe.getSigners()
    owner = _accounts[0];
    user1 = _accounts[1];
    user2 = _accounts[2];

    DpidAliasRegistryFactory = await hhe.getContractFactory(
      "DpidAliasRegistry",
    ) as DpidAliasRegistry__factory;

    dpidAliasRegistry = await upgrades.deployProxy(
      DpidAliasRegistryFactory,
      [
        FIRST_DPID // firstDpid
      ],
      {
        initializer: "initialize",
      }
    ) as DpidAliasRegistry;
    await dpidAliasRegistry.deployed();

    // Default instance to non-owner user
    dpidAliasRegistry = dpidAliasRegistry.connect(user1);
  });

  describe("deployment", () => {
    let reciept: TransactionReceipt;
    let proxyAddress: string;
    let implAddress: string;
    let proxyAdmin: string;

    before(async () => {
      reciept = await dpidAliasRegistry.deployTransaction.wait();
      proxyAddress = reciept.contractAddress;
      implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

      console.log({
        implAddress,
        proxyAddress,
        implOwner: await dpidAliasRegistry.owner(),
      })
    });

    it("costs a reasonable amount of gas", async () => {
      expect(
        BigNumber.from(reciept.cumulativeGasUsed).lte(32000000),
        `Gas limit exceeded`
      ).to.be.true;
    });

    it("is made through proxy", () => {
      expect(proxyAddress).not.to.equal(implAddress);
    });

    it("deploys implementation with proxy owner as owner", async () => {
      const registryOwner = await dpidAliasRegistry.owner();
      expect(registryOwner).to.equal(owner.address);
    });

    it("respects initializer dpid offset", async () => {
      const nextDpid = await dpidAliasRegistry.nextDpid();
      expect(nextDpid).to.equal(FIRST_DPID);
    })
  });

  describe("alias registry", () => {
    const STREAM_A = "kjzl6kcym7w8y7i5ugaq9a3vlm7hhuaf4bpl5o5qykeh4qtsa12c6rb5ekw6aaa";

    describe("entry", () => {
      let tx: ContractTransaction;
      let res: ContractReceipt;

      before(async () => {
        tx = await dpidAliasRegistry.mintDpid(STREAM_A);
        res = await tx.wait();
      });

      it("can be added", async () => {
        const entry = await dpidAliasRegistry.registry(100);
        expect(entry).to.equal(STREAM_A);
      });

      it("emits event on mint", async () => {
        const event = res.events![0];
        const [ dpid, streamId ] = event.args!;

        expect(event.event).to.equal("DpidMinted");
        expect(dpid).to.equal(BigNumber.from(100));
        expect(streamId).to.equal(STREAM_A);
      });

      it("increases counter on mint", async () => {
        const nextDpid = await dpidAliasRegistry.nextDpid();
        expect(nextDpid).to.equal(101);
      });

      it("gets next free dpid", async () => {
        const STREAM_B = "kjzl6kcym7w8y7i5ugaq9a3vlm7hhuaf4bpl5o5qykeh4qtsa12c6rb5ekw6bbb";
        const tx2 = await dpidAliasRegistry.mintDpid(STREAM_B);
        await tx2.wait();
        const entry = await dpidAliasRegistry.registry(101);
        expect(entry).to.equal(STREAM_B);
      });
    });

    describe("legacy entry", () => {
      let migrationEntry: DpidAliasRegistry.LegacyDpidEntryStruct;

      before(async () => {
        migrationEntry = {
          owner: user1.address, // of dpid owner
          versions: [
            {
              cid: "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku",
              time: 1716369952,
            },
          ],
        };
      });

      describe("import", () => {
        let successReceipt: ContractReceipt;

        it("can be done by contract owner", async () => {
          const tx = await dpidAliasRegistry
            .connect(owner)
            .importLegacyDpid(0, migrationEntry);
          successReceipt = await tx.wait();
        });

        it("can be resolved", async () => {
          const legacyEntry = await dpidAliasRegistry.legacyLookup(0);

          expect(legacyEntry.owner).to.equal(migrationEntry.owner);
          expect(legacyEntry.versions.length).to.equal(1);
          expect(legacyEntry.versions[0].cid).to.equal("bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku");
          expect(legacyEntry.versions[0].time).to.equal(1716369952);
        });

        it("emits an event on success", () => {
          const event = successReceipt.events![0];
          const [ dpid, { owner }] = event.args!;
          const args = successReceipt.events![0].args!;

          expect(event.event).to.equal("ImportedDpid");
          expect(dpid).to.equal(0);
          expect(owner).to.equal(user1.address);
        });

        it("can NOT be done by others", async () => {
          const doImport = async () => await dpidAliasRegistry
            .importLegacyDpid(1, migrationEntry);

          await expect(doImport()).to.be.rejectedWith("caller is not the owner");
        });
      });

      describe("upgrade", () => {
        let successReceipt: ContractReceipt;
        const STREAM_C = "kjzl6kcym7w8y7i5ugaq9a3vlm7hhuaf4bpl5o5qykeh4qtsa12c6rb5ekw6ccc";

        it("can NOT be done by others", async () => {
          const doUpgrade = async () => await dpidAliasRegistry
            .connect(user2)
            .upgradeDpid(0, STREAM_C);

          await expect(doUpgrade()).to.be.rejectedWith("unauthorized dpid upgrade");
        });

        it("can NOT be done by contract owner", async () => {
          const doUpgrade = async () => await dpidAliasRegistry
            .connect(owner)
            .upgradeDpid(0, STREAM_C);

          await expect(doUpgrade()).to.be.rejectedWith("unauthorized dpid upgrade");
        });

        it("can be done by dpid owner", async () => {
          const tx = await dpidAliasRegistry.upgradeDpid(0, STREAM_C);
          successReceipt = await tx.wait();

          const upgradedEntry = await dpidAliasRegistry.resolve(0);
          expect(upgradedEntry).to.equal(STREAM_C);
        });

        it("cannot be done twice", async () => {
          const doSecondUpgrade = async () =>
            await dpidAliasRegistry.upgradeDpid(0, STREAM_C);

          await expect(doSecondUpgrade()).to.be.rejectedWith("dpid already upgraded");
        });

        it("emits an event", async () => {
          const event = successReceipt.events![0];
          const [ dpid, streamId ] = event.args!;

          expect(event.event).to.equal("UpgradedDpid");
          expect(dpid).to.equal(0);
          expect(streamId).to.equal(STREAM_C);
        });
      });
    });
  });
});
