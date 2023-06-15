import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Signer } from "ethers";
import {
  DpidRegistry__factory,
  DpidRegistry,
  TestERC721__factory,
  TestERC721,
} from "../typechain-types";

const STANDARD_FEE = ethers.utils.parseUnits("500000", "gwei");
const ORG_FEE = ethers.utils.parseUnits("0.5", "ether");

describe("dPID", function () {
  let accounts: Signer[];
  let DpidRegistryFactory: DpidRegistry__factory;
  let dpidRegistry: DpidRegistry;
  const sampleUuid = "0x440912547197250917251";
  const sampleUuid2 = "0x19750927150120f";
  const stringToBytes32 = (str: string) =>
    ethers.utils.formatBytes32String(str);

  const DEFAULT_PREFIX = stringToBytes32("");

  let ERC721TestFactory: TestERC721__factory;
  let sbt1: TestERC721;
  let sbt2: TestERC721;

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

    ERC721TestFactory = (await ethers.getContractFactory(
      "TestERC721"
    )) as unknown as TestERC721__factory;

    sbt1 = await ERC721TestFactory.deploy("SBT1", "SBT1");
    await sbt1.deployed();

    sbt2 = await ERC721TestFactory.deploy("SBT2", "SBT2");
    await sbt2.deployed();
  });

  describe("Gas", () => {
    it("Costs a reasonable amount of gas to deploy", async () => {
      // wait until the transaction is mined
      let tx = await dpidRegistry.deployed();
      let res = await tx.deployTransaction.wait();
      // console.log("DISCOVERY DEPLOY", res);
      console.log(`Deployment cost ${res.cumulativeGasUsed} gas units`);
      expect(
        BigNumber.from(res.cumulativeGasUsed).lte(32000000),
        `Gas limit exceeded`
      ).to.be.true;
    });
  });

  describe("DpidRegistry", () => {
    const EXAMPLE_PREFIX = stringToBytes32("new");
    console.log("EXAMPLE", EXAMPLE_PREFIX);
    describe("Organizations", () => {
      it("assigns deployer to reserved orgs", async () => {
        const org = await dpidRegistry.organizations(stringToBytes32(""));
        expect(org.registrant).to.eq(await accounts[0].getAddress());
      });
      it.skip("must have a fee to register and organization", async () => {
        await expect(
          dpidRegistry.registerOrg(EXAMPLE_PREFIX)
        ).to.be.revertedWith("Fee required");
      });
      it.skip("must not have less than the fee to register and organization", async () => {
        await expect(
          dpidRegistry.registerOrg(EXAMPLE_PREFIX, { value: ORG_FEE.sub(1) })
        ).to.be.revertedWith("Fee required");
      });
      it("rejects prefixes with invalid characters", async () => {
        const strings = ["T", "A$", "test)", " ", "\n", "\t", "\r\n"];
        await Promise.all(
          strings.map((s) =>
            expect(
              dpidRegistry.registerOrg(stringToBytes32(s), { value: ORG_FEE })
            ).to.be.revertedWith("Invalid prefix")
          )
        );
      });
      it.skip("accepts prefixes with valid characters", async () => {
        const strings = [
          "science",
          "test",
          ".-",
          "9",
          "10.524",
          "harrison-jackson",
          "1234567890123456789012",
        ];
        const txs = strings.map((s) =>
          dpidRegistry
            .registerOrg(stringToBytes32(s), {
              value: ORG_FEE,
            })
            .then((e) => e.wait())
        );

        const res = await Promise.all(txs);

        res.map((r) => {
          expect(
            BigNumber.from(r.cumulativeGasUsed).lte(500000),
            "Gas limit exceeded"
          ).to.be.true;
        });
      });
      it("can register org with fee", async () => {
        const mintTx = await dpidRegistry
          .connect(accounts[1])
          .registerOrg(EXAMPLE_PREFIX, {
            value: ORG_FEE,
          });
        const res = await mintTx.wait();
        expect(
          BigNumber.from(res.cumulativeGasUsed).lte(300000),
          "Gas limit exceeded"
        ).to.be.true;

        const event = res.events!.find(
          (event) => event.event === "RegisterOrganization"
        );
        const [prefix, registrant, tokenGate] = event!.args!;

        expect(
          BigNumber.from(prefix).eq(EXAMPLE_PREFIX),
          "Prefix was unexpected value"
        ).to.be.true;
        expect(
          BigNumber.from(registrant).eq(await accounts[1].getAddress()),
          "Registrant address was unexpected value"
        ).to.be.true;
        expect(tokenGate.length).to.be.eq(0, "Token gate was unexpected value");

        const org = await dpidRegistry.organizations(EXAMPLE_PREFIX);
        expect(org.registrant).to.eq(await accounts[1].getAddress());
      });
      it("can't register org twice", async () => {
        const mintTx = await dpidRegistry.registerOrg(EXAMPLE_PREFIX, {
          value: ORG_FEE,
        });
        await mintTx.wait();

        await expect(
          dpidRegistry.registerOrg(EXAMPLE_PREFIX, {
            value: ORG_FEE,
          })
        ).to.be.revertedWith("Prefix taken");
      });

      it("can't register reserved org", async () => {
        const reserved = ["desci", "dpid", ""];
        await Promise.all(
          reserved.map((r) =>
            expect(
              dpidRegistry.registerOrg(stringToBytes32(r), {
                value: ORG_FEE,
              })
            ).to.be.revertedWith("Prefix taken")
          )
        );
      });
    });
    describe("Payment", () => {
      it("Can withdraw fees", async () => {
        const mintTx = await dpidRegistry
          .connect(accounts[1])
          .registerOrg(EXAMPLE_PREFIX, {
            value: ORG_FEE,
          });
        await mintTx.wait();

        const regTx = await dpidRegistry
          .connect(accounts[2])
          .put(EXAMPLE_PREFIX, sampleUuid, {
            value: STANDARD_FEE,
          });
        await regTx.wait();

        const origBalance = await accounts[0].getBalance();

        const withdrawTx = await dpidRegistry.withdraw();
        const receipt = await withdrawTx.wait();

        const gasCostWithdraw = receipt.gasUsed.mul(receipt.effectiveGasPrice);

        const newBalance = await accounts[0].getBalance();

        const diff = newBalance.sub(origBalance).add(gasCostWithdraw);

        const EXPECTED_FEE = ORG_FEE.add(STANDARD_FEE);

        expect(
          diff.eq(EXPECTED_FEE),
          `Expected to collect full fees ${diff} != ${EXPECTED_FEE} (gas: ${gasCostWithdraw})`
        ).to.be.true;
      });

      it.skip("Can withdraw fees after customizing", async () => {
        const NEW_ORG_FEE = ethers.utils.parseUnits("30000", "gwei");
        const NEW_REG_FEE = ethers.utils.parseUnits("2000", "gwei");

        let latestRegFee = await dpidRegistry.getFee();
        expect(
          latestRegFee.eq(STANDARD_FEE),
          `Reg fee mismatch ${latestRegFee} != ${STANDARD_FEE}`
        ).to.be.true;

        const rfTx = await dpidRegistry.setFee(NEW_REG_FEE);
        await rfTx.wait();

        latestRegFee = await dpidRegistry.getFee();
        expect(
          latestRegFee.eq(NEW_REG_FEE),
          `Reg fee mismatch ${latestRegFee} != ${NEW_REG_FEE}`
        ).to.be.true;

        let latestOrgFee = await dpidRegistry.getOrgFee();
        expect(
          latestOrgFee.eq(ORG_FEE),
          `Org fee mismatch ${latestOrgFee} != ${ORG_FEE}`
        ).to.be.true;

        const ofTx = await dpidRegistry.setOrgFee(NEW_ORG_FEE);
        await ofTx.wait();

        latestRegFee = await dpidRegistry.getFee();
        expect(
          latestRegFee.eq(NEW_REG_FEE),
          `Reg fee mismatch ${latestRegFee} != ${NEW_REG_FEE}`
        ).to.be.true;

        latestOrgFee = await dpidRegistry.getOrgFee();
        expect(
          latestOrgFee.eq(NEW_ORG_FEE),
          `Org fee mismatch ${latestOrgFee} != ${NEW_ORG_FEE}`
        ).to.be.true;

        const mintTx = await dpidRegistry
          .connect(accounts[1])
          .registerOrg(EXAMPLE_PREFIX, {
            value: NEW_ORG_FEE,
          });
        await mintTx.wait();

        const regTx = await dpidRegistry
          .connect(accounts[2])
          .put(EXAMPLE_PREFIX, sampleUuid, {
            value: NEW_REG_FEE,
          });
        await regTx.wait();

        const origBalance = await accounts[0].getBalance();

        const withdrawTx = await dpidRegistry.withdraw();
        const receipt = await withdrawTx.wait();

        const gasCostWithdraw = receipt.gasUsed.mul(receipt.effectiveGasPrice);

        const newBalance = await accounts[0].getBalance();

        const diff = newBalance.add(gasCostWithdraw).sub(origBalance);

        const EXPECTED_FEE = NEW_ORG_FEE.add(NEW_REG_FEE);

        expect(
          diff.eq(EXPECTED_FEE),
          `Expected to collect full fees ${diff} != ${EXPECTED_FEE} (gas: ${gasCostWithdraw})`
        ).to.be.true;
      });
    });
    describe("Managing entries", () => {
      it.skip("Can't add without paying fee", async function () {
        await expect(
          dpidRegistry.put(DEFAULT_PREFIX, sampleUuid)
        ).to.be.revertedWith("Fee required");
      });
      it.skip("Can't add paying fee below the requirement", async function () {
        await expect(
          dpidRegistry.put(DEFAULT_PREFIX, sampleUuid, {
            value: STANDARD_FEE.sub(1),
          })
        ).to.be.revertedWith("Fee required");
      });

      it("Can add with reasonable gas", async function () {
        const payload = sampleUuid;
        const mintTx = await dpidRegistry.put(DEFAULT_PREFIX, payload, {
          value: STANDARD_FEE,
        });

        // wait until the transaction is mined
        const res = await mintTx.wait();

        expect(
          BigNumber.from(res.cumulativeGasUsed).lte(300000),
          "Gas limit exceeded"
        ).to.be.true;
      });

      it("Can retrieve", async function () {
        const mintTx = await dpidRegistry.put(DEFAULT_PREFIX, sampleUuid, {
          value: STANDARD_FEE,
        });

        // wait until the transaction is mined
        const res = await mintTx.wait();

        expect(
          BigNumber.from(res.cumulativeGasUsed).lte(300000),
          "Gas limit exceeded"
        ).to.be.true;

        const event = res.events!.find((event) => event.event === "Register");
        const [id] = event!.args!;

        console.log("Got Event with id", id);
        expect(BigNumber.from(id).eq(0), "First entry was not 0").to.be.true;

        const resolved = await dpidRegistry.get(DEFAULT_PREFIX, id);
        expect(sampleUuid).to.eq(resolved, "Returned UUIDs didnt match");
        console.log("Got resolve", resolved);
      });

      it("Can retrieve 2", async function () {
        const tx = await dpidRegistry.put(DEFAULT_PREFIX, sampleUuid, {
          value: STANDARD_FEE,
        });
        const res = await tx.wait();

        const tx2 = await dpidRegistry.put(DEFAULT_PREFIX, sampleUuid2, {
          value: STANDARD_FEE,
        });
        const res2 = await tx2.wait();

        const event = res.events!.find((event) => event.event === "Register");
        const [prefix, id] = event!.args!;
        const event2 = res2.events!.find((event) => event.event === "Register");
        const [prefix2, id2] = event2!.args!;

        console.log("Got Event with id", id);
        console.log("Got Event with id", id2);

        expect(BigNumber.from(id).eq(0), "First entry was not 0").to.be.true;
        expect(BigNumber.from(id2).eq(1), "Second entry was not 1").to.be.true;

        const resolved = await dpidRegistry.get(DEFAULT_PREFIX, id);
        expect(sampleUuid).to.eq(resolved, "Returned UUIDs didnt match");
        console.log("Got resolve", resolved);

        const resolved2 = await dpidRegistry.get(DEFAULT_PREFIX, id2);
        expect(sampleUuid2).to.eq(resolved2, "Returned UUIDs didnt match");
        console.log("Got resolve", resolved2);
      });

      describe("Token gating", () => {
        it("Can set a token gate and fail new registration", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");
          const reg = await dpidRegistry.registerOrgWithGate(
            SPECIAL_PREFIX,
            [sbt1.address],
            { value: ORG_FEE }
          );
          const result = await reg.wait();

          const event = result.events!.find(
            (event) => event.event === "RegisterOrganization"
          );
          const [prefix, registrant, tokenGate] = event!.args!;

          expect(
            BigNumber.from(prefix).eq(SPECIAL_PREFIX),
            "Prefix was unexpected value"
          ).to.be.true;
          expect(
            BigNumber.from(registrant).eq(await accounts[0].getAddress()),
            "Registrant address was unexpected value"
          ).to.be.true;
          expect(tokenGate.length).to.be.eq(
            1,
            "Token gate length was unexpected value"
          );
          expect(tokenGate[0]).to.be.eq(
            sbt1.address,
            "Token gate was unexpected value"
          );

          await expect(
            dpidRegistry.put(SPECIAL_PREFIX, sampleUuid, {
              value: STANDARD_FEE,
            })
          ).to.be.revertedWith("Unauthorized: Token gate");
        });
        it("Can set a token gate and pass new registration with token", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");
          const reg = await dpidRegistry.registerOrgWithGate(
            SPECIAL_PREFIX,
            [sbt1.address],
            { value: ORG_FEE }
          );
          await reg.wait();

          const sbtTransfer = await sbt1.mint(await accounts[0].getAddress());
          await sbtTransfer.wait();

          await dpidRegistry.put(SPECIAL_PREFIX, sampleUuid, {
            value: STANDARD_FEE,
          });
        });

        it("Can deregister token gate and pass new registration with token", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");
          const reg = await dpidRegistry.registerOrgWithGate(
            SPECIAL_PREFIX,
            [sbt1.address],
            { value: ORG_FEE }
          );
          await reg.wait();

          const updateOrgTx = await dpidRegistry.updateOrg(SPECIAL_PREFIX, []);
          await updateOrgTx.wait();

          await dpidRegistry.put(SPECIAL_PREFIX, sampleUuid, {
            value: STANDARD_FEE,
          });
        });

        it("Can swap token gate and fail new registration without token", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");
          const reg = await dpidRegistry.registerOrgWithGate(
            SPECIAL_PREFIX,
            [sbt1.address],
            { value: ORG_FEE }
          );
          await reg.wait();

          const sbtTransfer = await sbt1.mint(await accounts[0].getAddress());
          await sbtTransfer.wait();

          const updateOrgTx = await dpidRegistry.updateOrg(SPECIAL_PREFIX, [
            sbt2.address,
          ]);
          await updateOrgTx.wait();

          await expect(dpidRegistry.put(SPECIAL_PREFIX, sampleUuid, {
            value: STANDARD_FEE,
          })).to.be.revertedWith("Unauthorized: Token gate")
        });

        it("Only owner can update org", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");
          const reg = await dpidRegistry.registerOrgWithGate(
            SPECIAL_PREFIX,
            [sbt1.address],
            { value: ORG_FEE }
          );
          await reg.wait();

          await expect(
            dpidRegistry
              .connect(accounts[1])
              .updateOrg(SPECIAL_PREFIX, [sbt2.address])
          ).to.be.revertedWith("Only owner updates");
        });

        it("Can only update registered org", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");

          await expect(
            dpidRegistry
              .updateOrg(SPECIAL_PREFIX, [])
          ).to.be.revertedWith("Only owner updates");
        });

        it("Can set multiple token gates and pass new registration with token", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");
          const reg = await dpidRegistry.registerOrgWithGate(
            SPECIAL_PREFIX,
            [sbt2.address, sbt1.address],
            { value: ORG_FEE }
          );
          await reg.wait();

          const sbtTransfer = await sbt1.mint(await accounts[0].getAddress());
          await sbtTransfer.wait();

          await dpidRegistry.put(SPECIAL_PREFIX, sampleUuid, {
            value: STANDARD_FEE,
          });
        });
        it("Can set multiple token gates in varying order and pass new registration with token", async function () {
          const SPECIAL_PREFIX = stringToBytes32("token");
          const reg = await dpidRegistry.registerOrgWithGate(
            SPECIAL_PREFIX,
            [sbt2.address, sbt1.address],
            { value: ORG_FEE }
          );
          await reg.wait();

          const sbtTransfer = await sbt2.mint(await accounts[1].getAddress());
          await sbtTransfer.wait();

          await dpidRegistry
            .connect(accounts[1])
            .put(SPECIAL_PREFIX, sampleUuid, {
              value: STANDARD_FEE,
            });
        });
      });
    });
  });
});
