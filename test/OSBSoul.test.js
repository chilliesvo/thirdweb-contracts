const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("OSBSoul", () => {
	before(async () => {
		//** Get Wallets */
		[deployer, superAdmin, user1, user2, user3, user4, user5, user6] = await ethers.getSigners();

		//** Get Contracts */
		const Setting = await ethers.getContractFactory("Setting");
		const OSBSoul = await ethers.getContractFactory("OSBSoul");

		//** Deploy Contracts with Proxy to upgrade contract in future */
		setting = await upgrades.deployProxy(Setting, [superAdmin.address]);
		osbSoul = await upgrades.deployProxy(OSBSoul, [setting.address, "Soul OSB", "SOUL"]);

		expect(await osbSoul.setting()).to.equal(setting.address);
		expect(await osbSoul.name()).to.equal("Soul OSB");
		expect(await osbSoul.symbol()).to.equal("SOUL");
		expect(await osbSoul.lastId()).to.equal(0);
	});

    describe("mint", async () => {
		it("Should return exception `Caller is not the admin`", async () => {
            const tokenUri = "https://ipfs/1.json";
            expect(await osbSoul.balanceOf(user1.address)).to.equal(0);
			await expect(osbSoul.connect(user1).mint(user1.address, tokenUri)).to.revertedWith("Caller is not the admin");
            await setting.connect(superAdmin).setAdmin(user1.address, true);
            await osbSoul.connect(user1).mint(user1.address, tokenUri);
            expect(await osbSoul.balanceOf(user1.address)).to.equal(1);
            const lastId = await osbSoul.lastId();
			expect(await osbSoul.tokenIds(user1.address)).to.equal(lastId);
            expect(await osbSoul.tokenURI(lastId)).to.equal(tokenUri);
		})

		it("Should return exception `Address already has a token`", async () => {
			const tokenUri = "https://ipfs/2.json";
            expect(await osbSoul.balanceOf(user2.address)).to.equal(0);
			await expect(osbSoul.connect(user1).mint(user1.address, tokenUri)).to.revertedWith("Address already has a token");
            await osbSoul.connect(user1).mint(user2.address, tokenUri);
            expect(await osbSoul.balanceOf(user2.address)).to.equal(1);
            const lastId = await osbSoul.lastId();
			expect(await osbSoul.tokenIds(user2.address)).to.equal(lastId);
            expect(await osbSoul.tokenURI(lastId)).to.equal(tokenUri);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			let tokenUri = "";
            expect(await osbSoul.balanceOf(user3.address)).to.equal(0);
			await expect(osbSoul.connect(user1).mint(user3.address, tokenUri)).to.revertedWith("Invalid tokenUri");
            tokenUri = "https://ipfs/3.json";
            await osbSoul.connect(user1).mint(user3.address, tokenUri);
            expect(await osbSoul.balanceOf(user3.address)).to.equal(1);
            const lastId = await osbSoul.lastId();
			expect(await osbSoul.tokenIds(user3.address)).to.equal(lastId);
            expect(await osbSoul.tokenURI(lastId)).to.equal(tokenUri);
		})
	})

	describe("mintBatch", async () => {
		it("Should return exception `Caller is not the admin`", async () => {
			const wallets = [user1.address, user2.address, user3.address];
            const tokenUris = Array(3).fill("https://ipfs/.json");
			await expect(osbSoul.connect(user2).mintBatch(wallets, tokenUris)).to.revertedWith("Caller is not the admin");
		})

		it("Should return exception `Address already has a token`", async () => {
			const wallets = [user1.address, user2.address, user3.address];
            const tokenUris = Array(3).fill("https://ipfs/.json");
			await expect(osbSoul.connect(user1).mintBatch(wallets, tokenUris)).to.revertedWith("Address already has a token");
		})

		it("Should return exception `Invalid parameters`", async () => {
			const wallets = [user1.address, user3.address];
            const tokenUris = Array(3).fill("https://ipfs/.json");
			await expect(osbSoul.connect(user1).mintBatch(wallets, tokenUris)).to.revertedWith("Invalid parameters");
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			const wallets = [user4.address, user5.address, user6.address];
			const tokenUris = ["https://ipfs/.json", "https://ipfs/.json", ""];
			await expect(osbSoul.connect(user1).mintBatch(wallets, tokenUris)).to.revertedWith("Invalid tokenUri");
		})

		it("Should return exception success", async () => {
			const wallets = [user4.address, user5.address, user6.address];
			const tokenUris = ["https://ipfs/user4.json", "https://ipfs/user5.json", "https://ipfs/user6.json"];
			await osbSoul.connect(user1).mintBatch(wallets, tokenUris);
			const soulUser4 = await osbSoul.tokenIds(user4.address);
			const soulUser5 = await osbSoul.tokenIds(user5.address);
			const soulUser6 = await osbSoul.tokenIds(user6.address);
			expect(await osbSoul.tokenURI(soulUser4)).to.equal(tokenUris[0]);
			expect(await osbSoul.tokenURI(soulUser5)).to.equal(tokenUris[1]);
			expect(await osbSoul.tokenURI(soulUser6)).to.equal(tokenUris[2]);
		})
	})

	describe("setTokenURI", () => {
		it("Should return exception `Caller is not the admin`", async () => {
			const newUri = "https://ipfs/new1.json";
			const soulUser1 = await osbSoul.tokenIds(user1.address);
			await expect(osbSoul.connect(user2).setTokenURI(soulUser1, newUri)).to.revertedWith("Caller is not the admin");
		})

		it("Should return exception `URI set of nonexistent token`", async () => {
			const newUri = "https://ipfs/new1.json";
			const lastId = await osbSoul.lastId();
			await expect(osbSoul.connect(user1).setTokenURI(lastId + 1, newUri)).to.revertedWith("URI set of nonexistent token");
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			const newUri = "";
			const soulUser1 = await osbSoul.tokenIds(user1.address);
			await expect(osbSoul.connect(user1).setTokenURI(soulUser1, newUri)).to.revertedWith("Invalid tokenUri");
		})

		it("Should return exception success", async () => {
			const newUri = "https://ipfs/new1.json";
			const soulUser1 = await osbSoul.tokenIds(user1.address);
			await osbSoul.connect(user1).setTokenURI(soulUser1, newUri);
			expect(await osbSoul.tokenURI(soulUser1)).to.equal(newUri);
		})
	})

    describe("_beforeTokenTransfer", () => {
		it("Should return exception `This a Soulbound token. It cannot be transferred`", async () => {
			await expect(osbSoul.connect(user1).transferFrom(user1.address, user2.address, 1)).to.revertedWith("This a Soulbound token. It cannot be transferred");
		})
	})
});
