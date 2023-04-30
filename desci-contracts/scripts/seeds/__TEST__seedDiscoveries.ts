import { run, ethers } from "hardhat";
import { BigNumber, Contract, ContractFactory, Signer } from "ethers";

async function main() {
    await run("compile");

    const accounts = await ethers.getSigners();

    const Discovery = await ethers.getContractFactory("Discovery");
    const discovery = await Discovery.deploy();

    await discovery.deployed();

    console.log("Discovery deployed to:", discovery.address);


    const MAX_CITATIONS = 200;
    let MAX_DISCOVERIES = MAX_CITATIONS * 2;

    let maxGas = 0;
    let index;
    for (index = 0; index < MAX_DISCOVERIES; index++) {
        let max = index < MAX_CITATIONS ? index : MAX_CITATIONS;
        const citations = new Array(max);
        for (let i = 0; i < max; i++) {
            citations[i] = i;
        }

        const mintTx = await discovery.mint(await Promise.all([accounts[1].getAddress(), accounts[2].getAddress()]), citations, "https://google.com")

        // wait until the transaction is mined
        const res = await mintTx.wait();
    }

    console.log(`[Discovery::mint] gas=${maxGas} total=${MAX_DISCOVERIES}`);

    const indexToSync = index - 1;
    const syncTx = await discovery.syncCitations(indexToSync);
    const res = await syncTx.wait();

    const gasUsed = BigNumber.from(res.cumulativeGasUsed).toNumber();
    console.log(`[Discovery::syncCitations] gas=${gasUsed} total=${MAX_DISCOVERIES}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

