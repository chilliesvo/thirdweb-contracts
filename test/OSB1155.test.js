const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("./utils");
const { contractFactoriesLoader } = require("../utils/utils");

const contractUri = "ipfs://";

describe("OSB1155", () => {
	beforeEach(async () => {
		//** Get Wallets */
		[deployer, superAdmin, user1, user2, user3, crossmint] = await ethers.getSigners();

		//** Get Contracts */
		const { OSBFactory, Setting, OSB721, OSB1155 } = await contractFactoriesLoader();

		//** Deploy Contracts normal */
		const osb721 = await OSB721.deploy();
		const osb1155 = await OSB1155.deploy();

		//** Deploy Contracts with Proxy to upgrade contract in future */
		const setting = await upgrades.deployProxy(Setting, [superAdmin.address]);
		const osbFactory = await upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
		
		const ownerContract = superAdmin.address;
		const controllerContract = ZERO_ADDRESS;
		await osbFactory.connect(superAdmin).create(false, ownerContract, controllerContract, [contractUri, "Multi Token", "MUL", superAdmin.address, 1000, 20]);
		await osbFactory.connect(superAdmin).create(false, ownerContract, controllerContract, [contractUri, "Multi Token", "MUL", superAdmin.address, 0, 0]);
		token = await OSB1155.attach((await osbFactory.tokenInfos(1)).token);

		const defaultRoyaltyInfo = await token.defaultRoyaltyInfo();
		expect(await defaultRoyaltyInfo.receiver).to.equal(superAdmin.address);
		expect(await defaultRoyaltyInfo.royaltyFraction).to.equal(1000);

		expect(await token.factory()).to.equal(osbFactory.address);
		expect(await token.contractURI()).to.equal(contractUri);
		expect(await token.name()).to.equal("Multi Token");
		expect(await token.symbol()).to.equal("MUL");
		expect(await token.lastId()).to.equal(0);
	});

	describe("setController", () => {
		it("Should return exception `Ownable: caller is not the owner`", async () => {
			expect(await token.controllers(user1.address)).to.equal(false);
			await expect(token.connect(user1).setController(user1.address, true)).to.revertedWith("Ownable: caller is not the owner");
			await token.connect(superAdmin).setController(user1.address, true);
			expect(await token.controllers(user1.address)).to.equal(true);
		})

		it("Should return exception `Invalid account`", async () => {
			expect(await token.controllers(user1.address)).to.equal(false);
			await expect(token.connect(superAdmin).setController(ZERO_ADDRESS, true)).to.revertedWith("Invalid account");
			await token.connect(superAdmin).setController(user1.address, true);
			expect(await token.controllers(user1.address)).to.equal(true);
		})

		it("Should return exception `Duplicate setting`", async () => {
			expect(await token.controllers(user1.address)).to.equal(false);
			await token.connect(superAdmin).setController(user1.address, true);
			await expect(token.connect(superAdmin).setController(user1.address, true)).to.revertedWith("Duplicate setting");
			await token.connect(superAdmin).setController(user3.address, true);
			expect(await token.controllers(user3.address)).to.equal(true);
		})

		it("Should return success", async () => {
			expect(await token.controllers(user1.address)).to.equal(false);
			await token.connect(superAdmin).setController(user1.address, true);
			expect(await token.controllers(user1.address)).to.equal(true);
		})
	})

	describe("setContractURI", () => {
		it("Should return exception `Ownable: caller is not the owner`", async () => {
			expect(await token.contractURI()).to.equal(contractUri);
			await expect(token.connect(user1).setContractURI("ipfs://.json")).to.revertedWith("Ownable: caller is not the owner");
			await token.connect(superAdmin).setContractURI("ipfs://.json");
			expect(await token.contractURI()).to.equal("ipfs://.json");
		})

		it("Should return exception `Invalid newUri`", async () => {
			expect(await token.contractURI()).to.equal(contractUri);
			await expect(token.connect(superAdmin).setContractURI("")).to.revertedWith("Invalid newUri");
			await token.connect(superAdmin).setContractURI("ipfs://.json");
			expect(await token.contractURI()).to.equal("ipfs://.json");
		})

		it("Should return success", async () => {
			expect(await token.contractURI()).to.equal(contractUri);
			await token.connect(superAdmin).setContractURI("ipfs://.json");
			expect(await token.contractURI()).to.equal("ipfs://.json");
		})
	})

	describe("setTokenURI", () => {
		it("Should return exception `Ownable: caller is not the owner`", async () => {
			let tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			const lastId = await token.lastId();
			expect(await token.uri(lastId)).to.equal(tokenUri);

			tokenUri = "ipfs://pic123.json";
			await expect(token.connect(user1).setTokenURI(lastId, tokenUri)).to.revertedWith("Ownable: caller is not the owner");
			await token.connect(superAdmin).setTokenURI(lastId, tokenUri);
			expect(await token.uri(lastId)).to.equal(tokenUri);
		})

		it("Should return exception `URI set of nonexistent token`", async () => {
			let tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			const lastId = await token.lastId();
			expect(await token.uri(lastId)).to.equal(tokenUri);

			tokenUri = "ipfs://pic123.json";
			await expect(token.connect(superAdmin).setTokenURI(0, tokenUri)).to.revertedWith("URI set of nonexistent token");
			await expect(token.connect(superAdmin).setTokenURI(lastId + 1, tokenUri)).to.revertedWith("URI set of nonexistent token");

			await token.connect(superAdmin).setTokenURI(lastId, tokenUri);
			expect(await token.uri(lastId)).to.equal(tokenUri);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			let tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			const lastId = await token.lastId();
			expect(await token.uri(lastId)).to.equal(tokenUri);

			tokenUri = "";
			await expect(token.connect(superAdmin).setTokenURI(lastId, tokenUri)).to.revertedWith("Invalid tokenUri");

			tokenUri = "ipfs://pic123.json";
			await token.connect(superAdmin).setTokenURI(lastId, tokenUri);
			expect(await token.uri(lastId)).to.equal(tokenUri);
		})

		it("Should return success", async () => {
			let tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			const lastId = await token.lastId();
			expect(await token.uri(lastId)).to.equal(tokenUri);

			tokenUri = "ipfs://pic123.json";
			await token.connect(superAdmin).setTokenURI(lastId, tokenUri);
			expect(await token.uri(lastId)).to.equal(tokenUri);
		})
	})

	describe("mint", () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(user1).mint(user1.address, 100, tokenUri)).to.revertedWith("Caller not owner or controller");
			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			await token.connect(user1).mint(user1.address, 200, tokenUri);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.uri(1)).to.equal(tokenUri);
			expect(await token.balanceOf(user1.address, 2)).to.equal(200);
			expect(await token.uri(2)).to.equal(tokenUri);
		})

		it("Should return exception `Invalid amount`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mint(superAdmin.address, 0, tokenUri)).to.revertedWith("Invalid amount");
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.uri(1)).to.equal(tokenUri);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			let tokenUri = "";
			await expect(token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri)).to.revertedWith("Invalid tokenUri");

			tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.uri(1)).to.equal(tokenUri);
		})

		it("Should return exception `ERC1155: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mint(ZERO_ADDRESS, 100, tokenUri)).to.revertedWith("ERC1155: mint to the zero address");

			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.uri(1)).to.equal(tokenUri);
		})

		it("Should return `Exceeded maximum total supply`", async () => {
			const tokenUri = "ipfs://pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let lastId = await token.lastId();

			expect(lastId).to.equal(0);
			expect(maxTotalSupply).to.equal(20);

			for (let i = 0; i < maxTotalSupply; i++) {
				await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			}

			lastId = await token.lastId();
			expect(lastId).to.equal(20);

			await expect(token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri)).to.revertedWith("Exceeded maximum total supply");
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(superAdmin).mint(superAdmin.address, 100, tokenUri);
			await token.connect(user1).mint(user1.address, 200, tokenUri);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.uri(1)).to.equal(tokenUri);
			expect(await token.balanceOf(user1.address, 2)).to.equal(200);
			expect(await token.uri(2)).to.equal(tokenUri);
		})
	})

	describe("mintBatch", () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(0);
			expect(await token.balanceOf(user1.address, 3)).to.equal(0);
			expect(await token.balanceOf(user1.address, 4)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(user1).mintBatch(user1.address, [100, 200], [tokenUri, tokenUri])).to.revertedWith("Caller not owner or controller");

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri, tokenUri]);
			await token.connect(user1).mintBatch(user1.address, [300, 400], [tokenUri, tokenUri]);

			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(200);
			expect(await token.balanceOf(user1.address, 3)).to.equal(300);
			expect(await token.balanceOf(user1.address, 4)).to.equal(400);
		})

		it("Should return exception `Invalid parameters`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri])).to.revertedWith("Invalid parameters");
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [100], [tokenUri, tokenUri])).to.revertedWith("Invalid parameters");
			await token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri, tokenUri]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(200);
		})

		it("Should return exception `Invalid amount`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [0], [tokenUri])).to.revertedWith("Invalid amount");
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [100, 0], [tokenUri, tokenUri])).to.revertedWith("Invalid amount");
			await token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri, tokenUri]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(200);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(0);

			const tokenUri1 = "";
			const tokenUri2 = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [100], [tokenUri1])).to.revertedWith("Invalid tokenUri");
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri1, tokenUri2])).to.revertedWith("Invalid tokenUri");

			await token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri2, tokenUri2]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(200);
		})

		it("Should return exception `ERC1155: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatch(ZERO_ADDRESS, [100, 200], [tokenUri, tokenUri])).to.revertedWith("ERC1155: mint to the zero address");

			await token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri, tokenUri]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(200);
		})

		it("Should return `Exceeded maximum total supply`", async () => {
			const tokenUri = "ipfs://pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let lastId = await token.lastId();

			expect(lastId).to.equal(0);
			expect(maxTotalSupply).to.equal(20);

			await token.connect(superAdmin).mintBatch(superAdmin.address, Array(20).fill(100), Array(20).fill(tokenUri));

			lastId = await token.lastId();
			expect(lastId).to.equal(20);

			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [100], [tokenUri])).to.revertedWith("Exceeded maximum total supply");
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";

			await token.connect(superAdmin).mintBatch(superAdmin.address, [100, 200], [tokenUri, tokenUri]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.uri(1)).to.equal(tokenUri);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(200);
			expect(await token.uri(2)).to.equal(tokenUri);
		})
	})

	describe("mintWithRoyalty", () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(user1).mintWithRoyalty(user1.address, 100, tokenUri, user1.address, 1000)).to.revertedWith("Caller not owner or controller");
			
			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, superAdmin.address, 1000);
			await token.connect(superAdmin).mintWithRoyalty(user1.address, 100, tokenUri, user1.address, 0);
			await expect(token.connect(superAdmin).mintWithRoyalty(user1.address, 200, tokenUri, ZERO_ADDRESS, 2000)).to.revertedWith("ERC2981: Invalid parameters");

			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(user1.address, 2)).to.equal(100);
		})

		it("Should return exception `Invalid amount`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 0, tokenUri, superAdmin.address, 1000)).to.revertedWith("Invalid amount");
			
			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, superAdmin.address, 1000);
			await token.connect(user1).mintWithRoyalty(user1.address, 200, tokenUri, user1.address, 0);
			await expect(token.connect(superAdmin).mintWithRoyalty(user1.address, 200, tokenUri, ZERO_ADDRESS, 2000)).to.revertedWith("ERC2981: Invalid parameters");

			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(user1.address, 2)).to.equal(200);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			let tokenUri = "";
			await expect(token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, user1.address, 1000)).to.revertedWith("Invalid tokenUri");
			
			tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, superAdmin.address, 1000);

			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
		})

		it("Should return exception `ERC1155: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintWithRoyalty(ZERO_ADDRESS, 100, tokenUri, user1.address, 1000)).to.revertedWith("ERC1155: mint to the zero address");
			
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, superAdmin.address, 1000);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
		})

		it("Should return `Exceeded maximum total supply`", async () => {
			const tokenUri = "ipfs://pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let lastId = await token.lastId();

			expect(lastId).to.equal(0);
			expect(maxTotalSupply).to.equal(20);

			for (let i = 0; i < maxTotalSupply; i++) {
				await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, user1.address, 1000);
			}

			lastId = await token.lastId();
			expect(lastId).to.equal(20);

			await expect(token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, user1.address, 1000)).to.revertedWith("Exceeded maximum total supply");
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, 100, tokenUri, superAdmin.address, 1000);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
		})
	})

	describe("mintBatchWithRoyalty", () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);
			expect(await token.balanceOf(user1.address, 2)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(user1).mintBatchWithRoyalty(user1.address, [100, 100], [tokenUri, tokenUri], [[user3.address, 1000], [user3.address, 1000]])).to.revertedWith("Caller not owner or controller");
			
			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 100, 100], [tokenUri, tokenUri, tokenUri], [[superAdmin.address, 1000], [superAdmin.address, 0], [superAdmin.address, 1000]]);
			await token.connect(user1).mintBatchWithRoyalty(user1.address, [200, 200, 200], [tokenUri, tokenUri, tokenUri], Array(3).fill([user1.address, 2000]));
			
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 3)).to.equal(100);
			expect(await token.balanceOf(user1.address, 4)).to.equal(200);
			expect(await token.balanceOf(user1.address, 5)).to.equal(200);
			expect(await token.balanceOf(user1.address, 6)).to.equal(200);
		})

		it("Should return exception `Invalid parameters`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 100], [tokenUri, tokenUri], [[superAdmin.address, 1000], [superAdmin.address, 0], [superAdmin.address, 1000]])).to.revertedWith("Invalid parameters");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 100, 100], [tokenUri, tokenUri, tokenUri], [[superAdmin.address, 1000], [superAdmin.address, 0], [superAdmin.address, 1000]]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 3)).to.equal(100);
		})

		it("Should return exception `Invalid amount`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 0], [tokenUri, tokenUri], [[superAdmin.address, 0], [superAdmin.address, 1000]])).to.revertedWith("Invalid amount");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 100], [tokenUri, tokenUri], [[superAdmin.address, 0], [superAdmin.address, 1000]]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(100);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);

			const tokenUri1 = "";
			const tokenUri2 = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 0], [tokenUri1, tokenUri2], [[superAdmin.address, 0], [superAdmin.address, 1000]])).to.revertedWith("Invalid tokenUri");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 100], [tokenUri2, tokenUri2], [[superAdmin.address, 0], [superAdmin.address, 1000]]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(100);
		})

		it("Should return exception `ERC1155: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(ZERO_ADDRESS, [100, 0], [tokenUri, tokenUri], [[superAdmin.address, 0], [superAdmin.address, 1000]])).to.revertedWith("ERC1155: mint to the zero address");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 100], [tokenUri, tokenUri], [[superAdmin.address, 0], [superAdmin.address, 1000]]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(100);
		})

		it("Should return `Exceeded maximum total supply`", async () => {
			const tokenUri = "ipfs://pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let lastId = await token.lastId();

			expect(lastId).to.equal(0);
			expect(maxTotalSupply).to.equal(20);

			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, Array(20).fill(100), Array(20).fill(tokenUri), Array(20).fill([superAdmin.address, 1000]));

			lastId = await token.lastId();
			expect(lastId).to.equal(20);

			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100], [tokenUri], [[superAdmin.address, 1000]])).to.revertedWith("Exceeded maximum total supply");
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(0);

			const tokenUri = "ipfs://pic.json";
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [100, 100], [tokenUri, tokenUri], [[superAdmin.address, 0], [superAdmin.address, 1000]]);
			expect(await token.balanceOf(superAdmin.address, 1)).to.equal(100);
			expect(await token.uri(1)).to.equal(tokenUri);
			expect(await token.balanceOf(superAdmin.address, 2)).to.equal(100);
			expect(await token.uri(2)).to.equal(tokenUri);
		})
	})
});
