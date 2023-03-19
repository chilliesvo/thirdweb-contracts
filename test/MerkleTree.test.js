const { ethers } = require("hardhat");
const { expect } = require("chai");
const { blockTimestamp, parseEthers, generateMerkleTree, hexProof, parseEther, setTime, ZERO_ADDRESS } = require("./utils");
const { generateInputsFixedWithTokenSingleNotAvailable, generateInputsFixedWithTokenMultiNotAvailable } = require("./osb.utils");
const { contractFactoriesLoader, deploy, deployProxy } = require("../utils/utils");
require("dotenv").config();

const env = process.env;
const TEN_MINUTES = 600;
const ONE_DAY = 86400;
const BaseUri = "ipfs://";
const createProjectFee = parseEther(0.2);
const opFundLimit = parseEther(3);
const saleCreateLimit = 50;
const closeLimit = 100;
const profitShareAdmin = 0;
const profitShareMinimum = 10;

describe("MerkleTree", () => {
	before(async () => {
		//** Get Wallets */
		[deployer, superAdmin, admin, controller, user1, user2, user3, user4, crossmint] = await ethers.getSigners();

		//** Load Contract Factories */
		const contractFactories = await contractFactoriesLoader();
		const { NFTChecker, Setting, OSBFactory, Project, Sale, Randomizer, OSBSoul } = contractFactories;
		var { OSB721, OSB1155 } = contractFactories;

		//** Deploy params */
		opFundReceiver = deployer;

		//** Deploy Contracts normal */
		const osb721 = await deploy(OSB721);
    	const osb1155 = await deploy(OSB1155);
		
		//** Deploy Contracts with Proxy to upgrade contract in future */
		nftChecker = await deployProxy(NFTChecker);
		setting = await deployProxy(Setting, [superAdmin.address]);
		randomizer = await deploy(Randomizer, [setting.address]);
		osbFactory = await deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
		osbSoul = await deployProxy(OSBSoul, [setting.address, env.SOULBOUND_NAME, env.SOULBOUND_SYMBOL]);
		project = await deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]]);
		sale = await deployProxy(Sale, [setting.address, nftChecker.address, randomizer.address]);

		//** Setting after deployed */
		await project.connect(superAdmin).setSaleAddress(sale.address);
		await sale.connect(superAdmin).setProjectAddress(project.address);
		await setting.connect(superAdmin).setAdmin(admin.address, true);
		await randomizer.connect(superAdmin).setAdmin(sale.address, true);

		//** Check settings after deployed */
		expect(await project.sale()).to.equal(sale.address);
		expect(await sale.project()).to.equal(project.address);
		expect(await setting.getSuperAdmin()).to.equal(superAdmin.address);
		expect(await setting.isAdmin(admin.address)).to.equal(true);

		//** Project data input */
		const token = ZERO_ADDRESS;
		const name = "SingleToken";
		const symbol = "SIN";
		const isPack = true;
		const isSingle = true;
		const isFixed = true;
		const isFlashSale = true;
		const isInstantPayment = true;
		const defaultReceiverRoyalty = ZERO_ADDRESS;
		const defaultPercentageRoyalty = 0;
		const maxTotalSupply = 0;
		const minSales = 0;
		let fixedPricePack = 0;
		let maxPricePack = 0;
		let minPricePack = 0;
		let priceDecrementAmtPack = 0;
		
		//** IDO input */
		const saleStart = (await blockTimestamp()) + TEN_MINUTES;
		const saleEnd = saleStart + ONE_DAY;
		const saleInputs = generateInputsFixedWithTokenSingleNotAvailable(3, Array(3).fill(BaseUri), parseEthers([1, 2, 3]));
		const saleInputs2 = generateInputsFixedWithTokenMultiNotAvailable(Array(10).fill(100), Array(10).fill("baseUri"), Array(10).fill(parseEther(10)));
		await project.connect(admin).publish(
			[token, name, symbol, BaseUri, !isPack, isSingle, isFixed, !isFlashSale, isInstantPayment, defaultReceiverRoyalty, defaultPercentageRoyalty, minSales, maxTotalSupply, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
			saleInputs,
			{ value: createProjectFee }
		);

		fixedPricePack = parseEther(1);
		await project.connect(admin).publish(
			[token, name, symbol, BaseUri, isPack, isSingle, isFixed, isFlashSale, isInstantPayment, defaultReceiverRoyalty, defaultPercentageRoyalty, minSales, maxTotalSupply, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
			saleInputs,
			{ value: createProjectFee }
		);

		await setTime(saleStart);
	})

	it("add winners", async () => {
		const whiteList1 = [user1.address, user2.address];
		const whiteList2 = [user3.address, user4.address];

		const merkleTree1 = generateMerkleTree(whiteList1);
		const merkleTree2 = generateMerkleTree(whiteList2);

		const rootHash1 = merkleTree1.getHexRoot();
		const rootHash2 = merkleTree2.getHexRoot();

		await sale.connect(opFundReceiver).setMerkleRoot(1, rootHash1);
		await sale.connect(opFundReceiver).setMerkleRoot(2, rootHash2);
		await sale.connect(opFundReceiver).setMerkleRoot(3, rootHash2);

		const hexProofUser1 = hexProof(merkleTree1, user1.address);
		const hexProofUser3 = hexProof(merkleTree2, user3.address);

		await sale.connect(user1).buy(user1.address, 1, hexProofUser1, 1, { value: parseEther(1) });
		await sale.connect(user3).buy(user3.address, 2, hexProofUser3, 1, { value: parseEther(2) });
		await sale.connect(user3).buy(user3.address, 3, hexProofUser3, 1, { value: parseEther(3) });

		await sale.connect(user3).buyPack(user3.address, 2, hexProofUser3, 1, { value: parseEther(1) });
		await sale.connect(user3).buyPack(user3.address, 2, hexProofUser3, 1, { value: parseEther(1) });
		await sale.connect(user3).buyPack(user3.address, 2, hexProofUser3, 1, { value: parseEther(1) });

	})
})

