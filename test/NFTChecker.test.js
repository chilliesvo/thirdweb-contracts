const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("./utils");
const { contractFactoriesLoader, deployProxy, deploy } = require("../utils/utils");

const contractUri = "ipfs://{CID}/contractUri.json";

describe("NFTChecker", () => {
	before(async () => {
		//** Get Wallets */
		[deployer, superAdmin, crossmint] = await ethers.getSigners();

		//** Load Contract Factories */
		const contractFactories = await contractFactoriesLoader();
		const { OSBFactory, NFTChecker, Setting, OSB721, OSB1155 } = contractFactories;

		nftChecker = await deployProxy(NFTChecker);

		//** Deploy Contracts normal */
		const osb721 = await deploy(OSB721);
		const osb1155 = await deploy(OSB1155);

		//** Deploy Contracts with Proxy to upgrade contract in future */
		setting = await deployProxy(Setting, [superAdmin.address]);
		osbFactory = await deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);

		//** Collection Input */
		const isSingle = true;
		const owner = superAdmin.address;
		const controller = ZERO_ADDRESS;
		const maxTotalSupply = 0;
		let defaultReceiverRoyalty;
		let defaultPercentageRoyalty;

		defaultReceiverRoyalty = superAdmin.address;
		defaultPercentageRoyalty = 1000;
		await osbFactory.connect(superAdmin).create(
			isSingle, owner, controller,
			[contractUri, "OSB721", "SIN", defaultReceiverRoyalty, defaultPercentageRoyalty, maxTotalSupply]
		);

		defaultReceiverRoyalty = ZERO_ADDRESS;
		defaultPercentageRoyalty = 0;
		await osbFactory.connect(superAdmin).create(!isSingle, owner, controller,
			[contractUri, "OSB1155", "MUL", defaultReceiverRoyalty, defaultPercentageRoyalty, maxTotalSupply]
		);
		tokenSingle = await OSB721.attach((await osbFactory.tokenInfos(1)).token);
		tokenMulti = await OSB1155.attach((await osbFactory.tokenInfos(2)).token);
	});

	it("isERC721", async () => {
		expect(await nftChecker.isERC721(tokenSingle.address)).equal(true);
		expect(await nftChecker.isERC721(tokenMulti.address)).equal(false);
	})

	it("isERC1155", async () => {
		expect(await nftChecker.isERC1155(tokenMulti.address)).equal(true);
		expect(await nftChecker.isERC1155(tokenSingle.address)).equal(false);
	})

	it("isERC165", async () => {
		expect(await nftChecker.isERC165(tokenMulti.address)).equal(true);
		expect(await nftChecker.isERC165(tokenMulti.address)).equal(true);
		expect(await nftChecker.isERC165(ZERO_ADDRESS)).equal(false);
		expect(await nftChecker.isERC165(superAdmin.address)).equal(false);
		expect(await nftChecker.isERC165(setting.address)).equal(false);
	})

	it("isNFT", async () => {
		expect(await nftChecker.isNFT(tokenSingle.address)).equal(true);
		expect(await nftChecker.isNFT(tokenMulti.address)).equal(true);
		expect(await nftChecker.isNFT(ZERO_ADDRESS)).equal(false);
		expect(await nftChecker.isNFT(superAdmin.address)).equal(false);
		expect(await nftChecker.isNFT(setting.address)).equal(false);
	})

	it("isImplementRoyalty", async () => {
		expect(await nftChecker.isImplementRoyalty(tokenSingle.address)).equal(true);
		expect(await nftChecker.isImplementRoyalty(tokenMulti.address)).equal(true);
	})
});
