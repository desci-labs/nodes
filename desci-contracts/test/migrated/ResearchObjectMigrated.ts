import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Signer } from "ethers";
import {
  DpidRegistry__factory,
  DpidRegistry,
  ERC721,
  ERC721__factory,
  TestERC721__factory,
  TestERC721,
  ResearchObject,
  ResearchObjectMigrated__factory,
  ResearchObjectMigrated,
} from "../../typechain-types";
import {
  MigrationDataStruct,
  VersionPushMigratedEvent,
} from "../../typechain-types/ResearchObjectMigrated";

const STANDARD_FEE = ethers.utils.parseUnits("500000", "gwei");
const ORG_FEE = ethers.utils.parseUnits("0.5", "ether");

const FROM_ADDR = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";
const DEFAULT_PREFIX = ethers.utils.formatBytes32String("");

describe("Research Object Migration", function () {
  let accounts: Signer[];
  let DpidRegistryFactory: DpidRegistry__factory;
  let dpidRegistry: DpidRegistry;

  const sampleUuid = "0x440912547197250917251";
  const sampleUuid2 = "0x19750927150120f";

  let ResearchObjectMigratedFactory: ResearchObjectMigrated__factory;
  //   let researchObjectMigrated: ResearchObjectMigrated;

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

    dpidRegistry.setFee(0);

    ResearchObjectMigratedFactory = (await ethers.getContractFactory(
      "ResearchObjectMigrated"
    )) as unknown as ResearchObjectMigrated__factory;
  });

  describe("Initialization", () => {
    it("Can receive no migration data and be deployed", async () => {
      const importData: MigrationDataStruct[] = [];
      let researchObjectMigrated = (await upgrades.deployProxy(
        ResearchObjectMigratedFactory,
        [dpidRegistry.address]
      )) as ResearchObjectMigrated;
      await researchObjectMigrated.deployed();

      const result = await researchObjectMigrated._importChunk(
        importData,
        DEFAULT_PREFIX
      );
      console.log("result", result);

      // ensure we are owner
      expect(await researchObjectMigrated.owner()).to.equal(
        await accounts[0].getAddress()
      );
      // ensure we own dpid contract
      expect(await dpidRegistry.owner()).to.equal(
        await accounts[0].getAddress()
      );
    });

    it("Can receive one migration entry and be deployed", async () => {
      const targetUuid =
        "0x0ae8abde65748fe1ced55a91190483d29ac72384593e0dee1eb4a36ebf9c31a0";
      const targetDpid = "0x0";
      const targetCidBytes =
        "0x0f01551220df36b21446f6dc9e3ba055f20d5a727a2c7230a1f93f21a5bfe0fd7326aa63c3";

      const importData: MigrationDataStruct[] = [
        {
          from: FROM_ADDR,
          cid: targetCidBytes,
          dpid: targetDpid,
          timestamp: 1623345600,
          uuid: targetUuid,
        },
      ];
      let researchObjectMigrated = (await upgrades.deployProxy(
        ResearchObjectMigratedFactory,
        [dpidRegistry.address]
      )) as ResearchObjectMigrated;
      await researchObjectMigrated.deployed();

      const result = await researchObjectMigrated._importChunk(
        importData,
        DEFAULT_PREFIX
      );
      console.log("result", result);

      // expect one log of each
      const logs = await researchObjectMigrated.queryFilter(
        researchObjectMigrated.filters.VersionPushMigrated(),
        0,
        "latest"
      );
      const migrateLog = await researchObjectMigrated.queryFilter(
        researchObjectMigrated.filters.VersionPushMigrated(),
        0,
        "latest"
      );
      expect(logs.length).to.equal(1);
      expect(migrateLog.length).to.equal(1);

      // check RO side
      expect(await researchObjectMigrated.exists(targetUuid)).to.be.true;
      expect(await researchObjectMigrated.exists(0x0)).to.be.false;

      // check dpid entry
      expect(await dpidRegistry.get(DEFAULT_PREFIX, targetDpid)).to.equal(
        targetUuid
      );
      expect(await researchObjectMigrated._metadata(targetUuid)).to.equal(
        targetCidBytes
      );
    });
  });

  it("Can receive two migration entries for same dpid and be valid", async () => {
    const targetUuid =
      "0x0ae8abde65748fe1ced55a91190483d29ac72384593e0dee1eb4a36ebf9c31a0";
    const targetDpid = "0x0";
    const targetCidBytes =
      "0x0f01551220df36b21446f6dc9e3ba055f20d5a727a2c7230a1f93f21a5bfe0fd7326aa63c3";

    const targetCidBytes2 =
      "0x0f01551220a2282832493f2f5374b765209d542ade51cf5ac9f738b81ec440f4ac21d4e310";

    const importData: MigrationDataStruct[] = [
      {
        from: FROM_ADDR,
        cid: targetCidBytes,
        dpid: targetDpid,
        timestamp: 1623345600,
        uuid: targetUuid,
      },
      {
        from: FROM_ADDR,
        cid: targetCidBytes2,
        dpid: targetDpid,
        timestamp: 1623345700,
        uuid: targetUuid,
      },
    ];
    let researchObjectMigrated = (await upgrades.deployProxy(
      ResearchObjectMigratedFactory,
      [dpidRegistry.address]
    )) as ResearchObjectMigrated;
    await researchObjectMigrated.deployed();

    const result = await researchObjectMigrated._importChunk(
      importData,
      DEFAULT_PREFIX
    );
    console.log("result", result);

    // check RO side
    expect(await researchObjectMigrated.exists(targetUuid)).to.be.true;
    expect(await researchObjectMigrated.exists(0x0)).to.be.false;

    // inspect event logs
    const updateLogs =
      await researchObjectMigrated.queryFilter<VersionPushMigratedEvent>(
        researchObjectMigrated.filters.VersionPush(),
        0,
        "latest"
      );
    const migrateLogs = await researchObjectMigrated.queryFilter(
      researchObjectMigrated.filters.VersionPushMigrated(),
      0,
      "latest"
    );
    // expect two logs
    expect(updateLogs.length).to.equal(2);
    expect(migrateLogs.length).to.equal(2);
    // expect first log to have timestamp 1
    expect(migrateLogs[0].args._migration_timestamp).to.equal(
      importData[0].timestamp
    );
    expect(migrateLogs[1].args._migration_timestamp).to.equal(
      importData[1].timestamp
    );
    expect(updateLogs[0].args._cid).to.equal(importData[0].cid);
    expect(updateLogs[1].args._cid).to.equal(importData[1].cid);

    // check dpid entry
    expect(await dpidRegistry.get(DEFAULT_PREFIX, targetDpid)).to.equal(
      targetUuid
    );
    expect(await researchObjectMigrated._metadata(targetUuid)).to.equal(
      targetCidBytes2
    );

    expect(await dpidRegistry.get(DEFAULT_PREFIX, "0x1")).to.equal(0x0);
  });

  it("Can receive two migration entries for interleaved dpid and be valid", async () => {
    const targetUuid =
      "0x0ae8abde65748fe1ced55a91190483d29ac72384593e0dee1eb4a36ebf9c31a0";
    const targetUuid2 =
      "0x0ae8abde65748fe1ced55a91190483d29ac72384593e0dee1eb4a36ebf9c31a1";
    const targetDpid = "0x0";
    const targetDpid2 = "0x1";
    const targetCidBytes =
      "0x0f01551220df36b21446f6dc9e3ba055f20d5a727a2c7230a1f93f21a5bfe0fd7326aa63c3";

    const targetCidBytes2 =
      "0x0f01551220a2282832493f2f5374b765209d542ade51cf5ac9f738b81ec440f4ac21d4e310";

    const target2CidBytes =
      "0x0f015512209cf107adddf229ae090c27cc3998b51daf075dac2e3824d828cc71e1c3782903";
    const target2CidBytes2 =
      "0x0f015512207c3f09e9316cd7e3d8e1937df4058c4db3be4b4f4159200edb14b516c0f98a06";

    const importData: MigrationDataStruct[] = [
      {
        from: FROM_ADDR,
        cid: targetCidBytes,
        dpid: targetDpid,
        timestamp: 1623345600,
        uuid: targetUuid,
      },
      {
        from: FROM_ADDR,
        cid: target2CidBytes,
        dpid: targetDpid2,
        timestamp: 1623345700,
        uuid: targetUuid2,
      },
      {
        from: FROM_ADDR,
        cid: targetCidBytes2,
        dpid: targetDpid,
        timestamp: 1623345800,
        uuid: targetUuid,
      },
      {
        from: FROM_ADDR,
        cid: target2CidBytes2,
        dpid: targetDpid,
        timestamp: 1623345900,
        uuid: targetUuid2,
      },
    ];
    let researchObjectMigrated = (await upgrades.deployProxy(
      ResearchObjectMigratedFactory,
      [dpidRegistry.address]
    )) as ResearchObjectMigrated;
    await researchObjectMigrated.deployed();

    const result = await researchObjectMigrated._importChunk(
      importData,
      DEFAULT_PREFIX
    );
    console.log("result", result);

    // check RO side
    expect(await researchObjectMigrated.exists(targetUuid)).to.be.true;
    expect(await researchObjectMigrated.exists(targetUuid2)).to.be.true;
    expect(await researchObjectMigrated.exists(0x0)).to.be.false;

    // inspect event logs
    const updateLogs =
      await researchObjectMigrated.queryFilter<VersionPushMigratedEvent>(
        researchObjectMigrated.filters.VersionPush(),
        0,
        "latest"
      );
    const migrateLogs = await researchObjectMigrated.queryFilter(
      researchObjectMigrated.filters.VersionPushMigrated(),
      0,
      "latest"
    );
    // expect two logs
    expect(updateLogs.length).to.equal(4);
    expect(migrateLogs.length).to.equal(4);
    // check all logs match
    for (let i = 0; i < importData.length; i++) {
      expect(migrateLogs[i].args._migration_timestamp).to.equal(
        importData[i].timestamp
      );
      expect(migrateLogs[i].args._cid).to.equal(importData[i].cid);
      expect(migrateLogs[i].args._from).to.equal(importData[i].from);
      expect(migrateLogs[i].args._uuid).to.equal(importData[i].uuid);
      expect(updateLogs[i].args._cid).to.equal(importData[i].cid);
      expect(updateLogs[i].args._from).to.equal(await accounts[0].getAddress());
      expect(updateLogs[i].args._uuid).to.equal(importData[i].uuid);
    }

    // check dpid entry
    expect(await dpidRegistry.get(DEFAULT_PREFIX, targetDpid)).to.equal(
      targetUuid
    );
    expect(await researchObjectMigrated._metadata(targetUuid)).to.equal(
      targetCidBytes2
    );

    expect(await dpidRegistry.get(DEFAULT_PREFIX, targetDpid2)).to.equal(
      targetUuid2
    );
    expect(await researchObjectMigrated._metadata(targetUuid2)).to.equal(
      target2CidBytes2
    );

    expect(await dpidRegistry.get(DEFAULT_PREFIX, "0x1")).to.equal(targetUuid2);
    expect(await dpidRegistry.get(DEFAULT_PREFIX, "0x2")).to.equal(0x0);
  });
});
