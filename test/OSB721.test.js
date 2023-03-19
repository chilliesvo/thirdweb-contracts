const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZERO_ADDRESS, genNumbersASC, checkOwnerOfWallets, checkTokenURIs } = require("./utils");
const { contractFactoriesLoader, deploy, deployProxy } = require("../utils/utils");

const contractUri = "ipfs://";

describe("OSB721", () => {
	before(async () => {
		//** Get Wallets */
		[deployer, superAdmin, user1, user2, user3, crossmint] = await ethers.getSigners();

		//** Load Contract Factories */
		const { OSBFactory, Setting, OSB721, OSB1155 } = await contractFactoriesLoader()
		
		//** Deploy Contracts normal */
		const osb721 = await deploy(OSB721);
    	const osb1155 = await deploy(OSB1155);

		//** Deploy Contracts with Proxy to upgrade contract in future */
		const setting = await deployProxy(Setting, [superAdmin.address]);
		const osbFactory = await deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);

		//** Collection Input */
		const isSingle = true;
		const owner = superAdmin.address;
		const controller = ZERO_ADDRESS;
		let defaultReceiverRoyalty;
    	let defaultPercentageRoyalty;
    	let maxTotalSupply;
		
		defaultReceiverRoyalty = superAdmin.address;
		defaultPercentageRoyalty = 1000;
		maxTotalSupply = 20;
		await osbFactory.connect(superAdmin).create(
			isSingle, owner, controller,
			[contractUri, "Single Token", "SIN", defaultReceiverRoyalty, defaultPercentageRoyalty, maxTotalSupply]
		);

		defaultReceiverRoyalty = ZERO_ADDRESS;
		defaultPercentageRoyalty = 0;
		maxTotalSupply = 0;
		await osbFactory.connect(superAdmin).create(
			isSingle, owner, controller,
			[contractUri, "Single Token", "SIN", defaultReceiverRoyalty, defaultPercentageRoyalty, maxTotalSupply]
		);
		token = await OSB721.attach((await osbFactory.tokenInfos(1)).token);

		const defaultRoyaltyInfo = await token.defaultRoyaltyInfo();
		expect(await defaultRoyaltyInfo.receiver).to.equal(superAdmin.address);
		expect(await defaultRoyaltyInfo.royaltyFraction).to.equal(1000);

		expect(await token.factory()).to.equal(osbFactory.address);
		expect(await token.contractURI()).to.equal(contractUri);
		expect(await token.name()).to.equal("Single Token");
		expect(await token.symbol()).to.equal("SIN");
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
			let tokenUri = "ipfs//:pic.json";

			await token.connect(superAdmin).mint(user1.address, tokenUri);
			let tokenId = await token.lastId();

			expect(await token.ownerOf(tokenId)).to.equal(user1.address);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);

			tokenUri = "ipfs//:newpic.json";
			await expect(token.connect(user1).setTokenURI(tokenId, tokenUri)).to.revertedWith("Ownable: caller is not the owner");
			await token.connect(superAdmin).setTokenURI(tokenId, tokenUri);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);
		})

		it("Should return exception `URI set of nonexistent token`", async () => {
			let tokenUri = "ipfs//:pic.json";
			let tokenId = await token.lastId();
			await expect(token.connect(superAdmin).setTokenURI(tokenId, tokenUri)).to.revertedWith("URI set of nonexistent token");

			await token.connect(superAdmin).mint(user1.address, tokenUri);
			tokenId = await token.lastId();

			expect(await token.ownerOf(tokenId)).to.equal(user1.address);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);

			await token.connect(superAdmin).setTokenURI(tokenId, tokenUri);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			let tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mint(user1.address, tokenUri);
			tokenId = await token.lastId();
			expect(await token.ownerOf(tokenId)).to.equal(user1.address);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);

			tokenUri = "";
			await expect(token.connect(superAdmin).setTokenURI(tokenId, tokenUri)).to.revertedWith("Invalid tokenUri");

			tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).setTokenURI(tokenId, tokenUri);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);
		})

		it("Should return success", async () => {
			let tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mint(user1.address, tokenUri);
			tokenId = await token.lastId();

			expect(await token.ownerOf(tokenId)).to.equal(user1.address);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);

			await token.connect(superAdmin).setTokenURI(tokenId, tokenUri);
			expect(await token.tokenURI(tokenId)).to.equal(tokenUri);
		})
	})

	describe("mint", async () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			expect(await token.balanceOf(user1.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await expect(token.connect(user1).mint(user1.address, tokenUri)).to.revertedWith("Caller not owner or controller");
			await token.connect(superAdmin).mint(superAdmin.address, tokenUri);
			expect(await token.balanceOf(superAdmin.address)).to.equal(1);
			expect(await token.ownerOf(await token.lastId())).to.equal(superAdmin.address);
			expect(await token.tokenURI(await token.lastId())).to.equal(tokenUri);

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(user1).mint(user1.address, tokenUri);
			expect(await token.balanceOf(user1.address)).to.equal(1);
			expect(await token.ownerOf(await token.lastId())).to.equal(user1.address);
			expect(await token.tokenURI(await token.lastId())).to.equal(tokenUri);
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			let tokenUri = "";
			await expect(token.connect(superAdmin).mint(superAdmin.address, tokenUri)).to.revertedWith("Invalid tokenUri");

			tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mint(superAdmin.address, tokenUri);
			expect(await token.balanceOf(superAdmin.address)).to.equal(1);
			expect(await token.ownerOf(await token.lastId())).to.equal(superAdmin.address);
			expect(await token.tokenURI(await token.lastId())).to.equal(tokenUri);
		})

		it("Should return exception `ERC721: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await expect(token.connect(superAdmin).mint(ZERO_ADDRESS, tokenUri)).to.revertedWith("ERC721: mint to the zero address");

			await token.connect(superAdmin).mint(superAdmin.address, tokenUri);
			expect(await token.balanceOf(superAdmin.address)).to.equal(1);
			expect(await token.ownerOf(await token.lastId())).to.equal(superAdmin.address);
			expect(await token.tokenURI(await token.lastId())).to.equal(tokenUri);
		})

		it("Should return `Exceeded maximum total supply`" , async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			const tokenUri = "ipfs//:pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let totalSupply = await token.totalSupply();
			
			expect(maxTotalSupply).to.equal(20);
			expect(totalSupply).to.equal(0);
			
			for (let i = 0; i < maxTotalSupply; i++) {
				await token.connect(superAdmin).mint(superAdmin.address, tokenUri);
			}

			totalSupply = await token.totalSupply();
			expect(totalSupply).to.equal(20);
			expect(await token.balanceOf(superAdmin.address)).to.equal(20);

			await expect(token.connect(superAdmin).mint(superAdmin.address, tokenUri)).to.revertedWith("Exceeded maximum total supply");	
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			expect(await token.balanceOf(user1.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mint(superAdmin.address, tokenUri);
			expect(await token.balanceOf(superAdmin.address)).to.equal(1);
			expect(await token.ownerOf(await token.lastId())).to.equal(superAdmin.address);
			expect(await token.tokenURI(await token.lastId())).to.equal(tokenUri);

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(user1).mint(user1.address, tokenUri);
			expect(await token.balanceOf(user1.address)).to.equal(1);
			expect(await token.ownerOf(await token.lastId())).to.equal(user1.address);
			expect(await token.tokenURI(await token.lastId())).to.equal(tokenUri);
		})
	})

	describe("mintBatch", async () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			expect(await token.balanceOf(user1.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await expect(token.connect(user1).mintBatch(user1.address, Array(5).fill(tokenUri))).to.revertedWith("Caller not owner or controller");
			await token.connect(superAdmin).mintBatch(superAdmin.address, Array(5).fill(tokenUri));
			expect(await token.balanceOf(superAdmin.address)).to.equal(5);
			await checkOwnerOfWallets(token, genNumbersASC(1, 5), Array(5).fill(superAdmin.address));
			await checkTokenURIs(token, genNumbersASC(1, 5), Array(5).fill(tokenUri));

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(user1).mintBatch(user1.address, Array(10).fill(tokenUri));
			expect(await token.balanceOf(user1.address)).to.equal(10);
			await checkOwnerOfWallets(token, genNumbersASC(6, 15), Array(10).fill(user1.address));
			await checkTokenURIs(token, genNumbersASC(6, 15), Array(10).fill(tokenUri));
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			const tokenUri1 = "";
			const tokenUri2 = "ipfs//:pic.json";
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [tokenUri1, tokenUri2])).to.revertedWith("Invalid tokenUri");
			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [tokenUri1, tokenUri1])).to.revertedWith("Invalid tokenUri");
			await token.connect(superAdmin).mintBatch(superAdmin.address, Array(5).fill(tokenUri2));
			expect(await token.balanceOf(superAdmin.address)).to.equal(5);
			await checkOwnerOfWallets(token, genNumbersASC(1, 5), Array(5).fill(superAdmin.address));
			await checkTokenURIs(token, genNumbersASC(1, 5), Array(5).fill(tokenUri2));
		})

		it("Should return exception `ERC721: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			const tokenUri = "ipfs//:pic.json";
			await expect(token.connect(superAdmin).mintBatch(ZERO_ADDRESS, [tokenUri, tokenUri])).to.revertedWith("ERC721: mint to the zero address");
			await token.connect(superAdmin).mintBatch(superAdmin.address, Array(5).fill(tokenUri));
			expect(await token.balanceOf(superAdmin.address)).to.equal(5);
			await checkOwnerOfWallets(token, genNumbersASC(1, 5), Array(5).fill(superAdmin.address));
			await checkTokenURIs(token, genNumbersASC(1, 5), Array(5).fill(tokenUri));
		})

		it("Should return `Exceeded maximum total supply`" , async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			const tokenUri = "ipfs//:pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let totalSupply = await token.totalSupply();
			
			expect(maxTotalSupply).to.equal(20);
			expect(totalSupply).to.equal(0);

			await token.connect(superAdmin).mintBatch(superAdmin.address, Array(20).fill(tokenUri));

			totalSupply = await token.totalSupply();
			expect(totalSupply).to.equal(20);
			expect(await token.balanceOf(superAdmin.address)).to.equal(20);

			await expect(token.connect(superAdmin).mintBatch(superAdmin.address, [tokenUri])).to.revertedWith("Exceeded maximum total supply");
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			expect(await token.balanceOf(user1.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mintBatch(superAdmin.address, Array(5).fill(tokenUri));
			expect(await token.balanceOf(superAdmin.address)).to.equal(5);
			await checkOwnerOfWallets(token, genNumbersASC(1, 5), Array(5).fill(superAdmin.address));
			await checkTokenURIs(token, genNumbersASC(1, 5), Array(5).fill(tokenUri));

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(user1).mintBatch(user1.address, Array(10).fill(tokenUri));
			expect(await token.balanceOf(user1.address)).to.equal(10);
			await checkOwnerOfWallets(token, genNumbersASC(6, 15), Array(10).fill(user1.address));
			await checkTokenURIs(token, genNumbersASC(6, 15), Array(10).fill(tokenUri));
		})
	})

	describe("mintWithRoyalty", async () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			expect(await token.balanceOf(user1.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await expect(token.connect(user1).mintWithRoyalty(user1.address, tokenUri, user1.address, 1000)).to.revertedWith("Caller not owner or controller");
			await expect(token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, ZERO_ADDRESS, 1000)).to.revertedWith("ERC2981: Invalid parameters");
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(user1).mintWithRoyalty(user1.address, tokenUri, user1.address, 1000);
			await token.connect(user1).mintWithRoyalty(user1.address, tokenUri, user1.address, 1000);
			expect(await token.balanceOf(user1.address)).to.equal(2);
			await checkOwnerOfWallets(token, [3, 4], Array(2).fill(user1.address));
			await checkTokenURIs(token, [3, 4], Array(2).fill(tokenUri));
		})
 
		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			let tokenUri = "";
			await expect(token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, user1.address, 1000)).to.revertedWith("Invalid tokenUri");

			tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);

			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));
		})

		it("Should return exception `ERC721: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await expect(token.connect(superAdmin).mintWithRoyalty(ZERO_ADDRESS, tokenUri, user1.address, 1000)).to.revertedWith("ERC721: mint to the zero address");

			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));
		})

		it("Should return `Exceeded maximum total supply`" , async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			const tokenUri = "ipfs//:pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let totalSupply = await token.totalSupply();
			
			expect(maxTotalSupply).to.equal(20);
			expect(totalSupply).to.equal(0);
			
			for (let i = 0; i < maxTotalSupply; i++) {
				await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			}

			totalSupply = await token.totalSupply();
			expect(totalSupply).to.equal(20);
			expect(await token.balanceOf(superAdmin.address)).to.equal(20);

			await expect(token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000)).to.revertedWith("Exceeded maximum total supply");	
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			expect(await token.balanceOf(user1.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			await token.connect(superAdmin).mintWithRoyalty(superAdmin.address, tokenUri, superAdmin.address, 1000);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(user1).mintWithRoyalty(user1.address, tokenUri, user1.address, 1000);
			await token.connect(user1).mintWithRoyalty(user1.address, tokenUri, user1.address, 1000);
			expect(await token.balanceOf(user1.address)).to.equal(2);
			await checkOwnerOfWallets(token, [3, 4], Array(2).fill(user1.address));
			await checkTokenURIs(token, [3, 4], Array(2).fill(tokenUri));
		})
	})

	describe("mintBatchWithRoyalty", async () => {
		it("Should return exception `Caller not owner or controller`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			expect(await token.balanceOf(user1.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await expect(token.connect(user1).mintBatchWithRoyalty(user1.address, [tokenUri, tokenUri], [[user1.address, 1000], [user1.address, 2000]])).to.revertedWith("Caller not owner or controller");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri, tokenUri], [[superAdmin.address, 1000], [superAdmin.address, 2000]]);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));

			await token.connect(superAdmin).setController(user1.address, true);
			await token.connect(user1).mintBatchWithRoyalty(user1.address, [tokenUri, tokenUri], [[user1.address, 1000], [user1.address, 2000]]);
			expect(await token.balanceOf(user1.address)).to.equal(2);
			await checkOwnerOfWallets(token, [3, 4], Array(2).fill(user1.address));
			await checkTokenURIs(token, [3, 4], Array(2).fill(tokenUri));
		})

		it("Should return exception `Invalid parameters`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			let tokenUri = "ipfs//:pic.json";
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri, tokenUri], [[user1.address, 1000]])).to.revertedWith("Invalid parameters");
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [], [], [])).to.revertedWith("Invalid parameters");
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [], [[user1.address, 1000]])).to.revertedWith("Invalid parameters");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri, tokenUri], [[superAdmin.address, 1000], [superAdmin.address, 2000]]);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));
		})

		it("Should return exception `Invalid tokenUri`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			const tokenUri1 = "";
			const tokenUri2 = "ipfs//:pic.json";
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri1, tokenUri2], [[user1.address, 1000], [user1.address, 2000]])).to.revertedWith("Invalid tokenUri");
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri1, tokenUri1], [[user1.address, 1000], [user1.address, 2000]])).to.revertedWith("Invalid tokenUri");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri2, tokenUri2], [[user1.address, 1000], [user1.address, 2000]]);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri2));
		})


		it("Should return exception `ERC721: mint to the zero address`", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			const tokenUri = "ipfs//:pic.json";
			await expect(token.connect(superAdmin).mintBatchWithRoyalty(ZERO_ADDRESS, [tokenUri, tokenUri], [[user1.address, 1000], [user1.address, 2000]])).to.revertedWith("ERC721: mint to the zero address");
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri, tokenUri], [[user1.address, 1000], [user1.address, 2000]]);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));
		})

		it("Should return `Exceeded maximum total supply`" , async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);
			const tokenUri = "ipfs//:pic.json";
			const maxTotalSupply = await token.maxTotalSupply();
			let totalSupply = await token.totalSupply();
			
			expect(maxTotalSupply).to.equal(20);
			expect(totalSupply).to.equal(0);

			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, Array(20).fill(tokenUri), Array(20).fill([user1.address, 1000]));

			totalSupply = await token.totalSupply();
			expect(totalSupply).to.equal(20);
			expect(await token.balanceOf(superAdmin.address)).to.equal(20);

			await expect(token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri], [[user1.address, 2000]])).to.revertedWith("Exceeded maximum total supply");
		})

		it("Should return success", async () => {
			expect(await token.balanceOf(superAdmin.address)).to.equal(0);

			const tokenUri = "ipfs//:pic.json";
			await token.connect(superAdmin).mintBatchWithRoyalty(superAdmin.address, [tokenUri, tokenUri], [[superAdmin.address, 1000], [superAdmin.address, 2000]]);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));

			await token.connect(superAdmin).mintBatchWithRoyalty(user1.address, [tokenUri, tokenUri], [[superAdmin.address, 0], [superAdmin.address, 2000]]);
			expect(await token.balanceOf(superAdmin.address)).to.equal(2);
			await checkOwnerOfWallets(token, [1, 2], Array(2).fill(superAdmin.address));
			await checkTokenURIs(token, [1, 2], Array(2).fill(tokenUri));
		})
	})
});
