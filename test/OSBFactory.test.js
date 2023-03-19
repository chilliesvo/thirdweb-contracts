const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("./utils");

const baseUri = "ipfs://";

describe("OSBFactory", () => {
	beforeEach(async () => {
		//** Get Wallets */
		[deployer, superAdmin, user1, user2, user3, crossmint] = await ethers.getSigners();

		//** Get Contracts */
		const OSBFactory = await ethers.getContractFactory("OSBFactory");
		const Setting = await ethers.getContractFactory("Setting");
		const OSB721 = await ethers.getContractFactory("OSB721");
		const OSB1155 = await ethers.getContractFactory("OSB1155");

		//** Deploy Contracts normal */
		osb721 = await OSB721.deploy();
		osb1155 = await OSB1155.deploy();

		//** Deploy Contracts with Proxy to upgrade contract in future */
		const setting = await upgrades.deployProxy(Setting, [superAdmin.address]);
		await expect(upgrades.deployProxy(OSBFactory, [ZERO_ADDRESS, osb721.address, osb1155.address, crossmint.address])).to.revertedWith("Invalid settingAddress");
		await expect(upgrades.deployProxy(OSBFactory, [setting.address, ZERO_ADDRESS, osb1155.address, crossmint.address])).to.revertedWith("Invalid library721Address");
		await expect(upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, ZERO_ADDRESS, crossmint.address])).to.revertedWith("Invalid library1155Address");
		osbFactory = await upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);

		//** Check settings after deployed */
        expect(await osbFactory.setting()).to.equal(setting.address);
        expect(await osbFactory.library721Address()).to.equal(osb721.address);
        expect(await osbFactory.library1155Address()).to.equal(osb1155.address);
	});

	describe("setLibrary721Address", () => {
		it("Should return exception `Caller is not the super admin`", async () => {
			expect(await osbFactory.library721Address()).to.equal(osb721.address);
			await expect(osbFactory.connect(user1).setLibrary721Address(user1.address)).to.revertedWith("Caller is not the super admin");
			await osbFactory.connect(superAdmin).setLibrary721Address(user1.address);
			expect(await osbFactory.library721Address()).to.equal(user1.address);
		})

		it("Should return exception `Invalid library721Address`", async () => {
			expect(await osbFactory.library721Address()).to.equal(osb721.address);
			await expect(osbFactory.connect(superAdmin).setLibrary721Address(ZERO_ADDRESS)).to.revertedWith("Invalid library721Address");
			await osbFactory.connect(superAdmin).setLibrary721Address(user1.address);
			expect(await osbFactory.library721Address()).to.equal(user1.address);
		})

		it("Should return success", async () => {
			expect(await osbFactory.library721Address()).to.equal(osb721.address);
			await osbFactory.connect(superAdmin).setLibrary721Address(user1.address);
			expect(await osbFactory.library721Address()).to.equal(user1.address);
		})
	})

	describe("setLibrary1155Address", () => {
		it("Should return exception `Caller is not the super admin`", async () => {
			expect(await osbFactory.library1155Address()).to.equal(osb1155.address);
			await expect(osbFactory.connect(user1).setLibrary1155Address(user1.address)).to.revertedWith("Caller is not the super admin");
			await osbFactory.connect(superAdmin).setLibrary1155Address(user1.address);
			expect(await osbFactory.library1155Address()).to.equal(user1.address);
		})

		it("Should return exception `Invalid library1155Address`", async () => {
			expect(await osbFactory.library1155Address()).to.equal(osb1155.address);
			await expect(osbFactory.connect(superAdmin).setLibrary1155Address(ZERO_ADDRESS)).to.revertedWith("Invalid library1155Address");
			await osbFactory.connect(superAdmin).setLibrary1155Address(user1.address);
			expect(await osbFactory.library1155Address()).to.equal(user1.address);
		})

		it("Should return success", async () => {
			expect(await osbFactory.library1155Address()).to.equal(osb1155.address);
			await osbFactory.connect(superAdmin).setLibrary1155Address(user1.address);
			expect(await osbFactory.library1155Address()).to.equal(user1.address);
		})
	})

	describe("create", () => {
		it("Create token single", async () => {
			expect(await osbFactory.lastId()).to.equal(0);

			const ownerContract = superAdmin.address;
			const controllerContract = ZERO_ADDRESS;
			await osbFactory.connect(superAdmin).create(true, ownerContract, controllerContract, [baseUri, "Single Token", "SIN", superAdmin.address, 1000, 0]);
			const tokenInfo = await osbFactory.tokenInfos(1);
			expect(await osbFactory.lastId()).to.equal(1);
			expect(tokenInfo.owner).to.equal(superAdmin.address);   
			expect(tokenInfo.isSingle).to.equal(true);
			expect(tokenInfo.contractUri).to.equal(baseUri);
			expect(tokenInfo.name).to.equal("Single Token");
			expect(tokenInfo.symbol).to.equal("SIN");
			expect(tokenInfo.defaultReceiverRoyalty).to.equal(superAdmin.address);
			expect(tokenInfo.defaultPercentageRoyalty).to.equal(1000);
		})

		it("Create token multi", async () => {
			expect(await osbFactory.lastId()).to.equal(0);

			const ownerContract = superAdmin.address;
			const controllerContract = ZERO_ADDRESS;
			await osbFactory.connect(superAdmin).create(false, ownerContract, controllerContract, [baseUri, "Multi Token", "MUL", superAdmin.address, 1000, 0]);
			expect(await osbFactory.lastId()).to.equal(1);
			const tokenInfo = await osbFactory.tokenInfos(1);
			expect(await osbFactory.lastId()).to.equal(1);
			expect(tokenInfo.owner).to.equal(superAdmin.address);   
			expect(tokenInfo.isSingle).to.equal(false);
			expect(tokenInfo.contractUri).to.equal(baseUri);
			expect(tokenInfo.name).to.equal("Multi Token");
			expect(tokenInfo.symbol).to.equal("MUL");
			expect(tokenInfo.defaultReceiverRoyalty).to.equal(superAdmin.address);
			expect(tokenInfo.defaultPercentageRoyalty).to.equal(1000);
		})
	})

	describe("createAndMintSingleToken", () => {
		it("Success", async () => {
			await osbFactory.connect(superAdmin).createAndMintSingleToken(
				superAdmin.address,
				[baseUri, "Single Token", "SIN", ZERO_ADDRESS, 0, 0],
				[baseUri, baseUri, baseUri]
			)
		})
	})

	describe("createAndMintSingleTokenWithRoyalty", () => {
		it("Success", async () => {
			await osbFactory.connect(superAdmin).createAndMintSingleTokenWithRoyalty(
				superAdmin.address,
				[baseUri, "Single Token", "SIN", ZERO_ADDRESS, 0, 0],
				[baseUri, baseUri, baseUri],
				[[superAdmin.address, 0], [superAdmin.address, 0], [superAdmin.address, 0]]);
		})
	})

	describe("createAndMintMultiToken", () => {
		it("Success", async () => {
			await osbFactory.connect(superAdmin).createAndMintMultiToken(
				superAdmin.address,
				[baseUri, "Multi Token", "MUL", ZERO_ADDRESS, 0, 0],
				[baseUri, baseUri, baseUri],
				[10, 100, 10]);
		})
	})

	describe("createAndMintMultiTokenWithRoyalty", () => {
		it("Success", async () => {
			await osbFactory.connect(superAdmin).createAndMintMultiTokenWithRoyalty(
				superAdmin.address,
				[baseUri, "Multi Token", "MUL", ZERO_ADDRESS, 0, 0],
				[baseUri, baseUri, baseUri],
				[10, 100, 10],
				[[superAdmin.address, 0], [superAdmin.address, 0], [superAdmin.address, 0]]);
		})
	})
});
