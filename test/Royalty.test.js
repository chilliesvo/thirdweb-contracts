
const { ethers } = require("hardhat");
const { expect } = require("chai");
const { getRoyaltyFee } = require("./osb.utils");
const { parseEther, ZERO_ADDRESS } = require("./utils");

const baseUri = "ipfs://";

describe("Royalty", () => {
	beforeEach(async () => {
		//** Get Wallets */
		[deployer, superAdmin, crossmint] = await ethers.getSigners();

		//** Get Contracts */
		const OSBFactory = await ethers.getContractFactory("OSBFactory");
		const Setting    = await ethers.getContractFactory("Setting");
		const OSB721     = await ethers.getContractFactory("OSB721");
		const OSB1155    = await ethers.getContractFactory("OSB1155");
		const NFTChecker = await ethers.getContractFactory("NFTChecker");

		//** Deploy Contracts normal */
		const osb721  = await OSB721.deploy();
		const osb1155 = await OSB1155.deploy();
		
		//** Deploy Contracts with Proxy to upgrade contract in future */
		const setting    = await upgrades.deployProxy(Setting, [superAdmin.address]);
		const osbFactory = await upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
		nftChecker 		 = await upgrades.deployProxy(NFTChecker);

		const ownerContract = superAdmin.address;
		const controllerContract = ZERO_ADDRESS;
		await osbFactory.connect(superAdmin).create(true, ownerContract, controllerContract, baseUri, "OSB721", "SIN", superAdmin.address, 1000);
		await osbFactory.connect(superAdmin).create(false, ownerContract, controllerContract, baseUri, "OSB1155", "MUL", superAdmin.address, 1000);

		tokenSingle = await OSB721.attach((await osbFactory.tokenInfos(1)).token);
		tokenMulti = await OSB1155.attach((await osbFactory.tokenInfos(2)).token);
	});

	it("isImplementRoyalty", async () => {
		expect(await nftChecker.isImplementRoyalty(tokenSingle.address)).to.equal(true);
		expect(await nftChecker.isImplementRoyalty(tokenMulti.address)).to.equal(true);
	})

	it("check default percent", async () => {
		expect((await tokenSingle.royaltyInfo(0, parseEther(1)))[1]).to.equal(getRoyaltyFee(parseEther(1), 1000));
	})
});