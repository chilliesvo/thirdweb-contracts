const { ethers, upgrades } = require("hardhat");

async function main() {
	//* Loading contract factory */
	const Project    = await ethers.getContractFactory("Project");
	const Sale       = await ethers.getContractFactory("Sale");
	const OSBFactory = await ethers.getContractFactory("OSBFactory");
	const Gift       = await ethers.getContractFactory("Gift");
	const Setting    = await ethers.getContractFactory("Setting");

	//* Deploy contracts */
	console.log("================================================================================");
	console.log("UPDATING CONTRACTS");
	console.log("================================================================================");

	const admin = await upgrades.erc1967.getAdminAddress("address proxy");
    await upgrades.upgradeProxy("address proxy", OSBFactory);
    console.log("OSBFactory upgraded");

    await upgrades.upgradeProxy("address proxy", Project);
    console.log("Project upgraded");

    await upgrades.upgradeProxy("address proxy", Sale);
    console.log("Sale upgraded");

    await upgrades.upgradeProxy("address proxy", Gift);
    console.log("Gift upgraded");

    await upgrades.upgradeProxy("address proxy", Setting);
    console.log("Setting upgraded");

	console.log("================================================================================");
	console.log("DONE");
	console.log("================================================================================");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
