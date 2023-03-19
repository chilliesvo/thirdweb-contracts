const { ethers } = require("hardhat");
const { expect } = require("chai");
const { blockTimestamp, generateMerkleTree, hexProof, genNumbersASC, parseEthers, parseEther, ZERO_ADDRESS, setTime } = require("../utils");
const { multiply } = require("js-big-decimal");
const { setMerkleRoots, getProfitSuperAdmin, importContractABIs, generateInputsFixedWithTokenSingleNotAvailable, WEIGHT_DECIMAL } = require("../osb.utils");

const TEN_MINUTES = 600;
const ONE_DAY = 86400;
const createProjectFee = parseEther(0.2);
const profitShareMinimum = 10;
const profitShareAdmin = 0;
const opFundLimit = parseEther(3);
const saleCreateLimit = 50;
const closeLimit = 100;

describe("End-User Create Project Case", async () => {
	beforeEach(async () => {
    //** Get Wallets */
	[deployer, superAdmin, admin, user1, user2, user3, user4, author, crossmint] = await ethers.getSigners();

    //** Get Contracts */
	const NFTChecker = await ethers.getContractFactory("NFTChecker");
	const Setting = await ethers.getContractFactory("Setting");
	const OSBFactory = await ethers.getContractFactory("OSBFactory");
	const Project = await ethers.getContractFactory("Project");
	const Sale = await ethers.getContractFactory("Sale");
	const Randomizer = await ethers.getContractFactory("Randomizer");
	const OSBSoul = await ethers.getContractFactory("OSBSoul");
	OSB721 = await ethers.getContractFactory("OSB721");
	OSB1155 = await ethers.getContractFactory("OSB1155");

	//** Deploy params */
	opFundReceiver = deployer;
    
    //** Deploy Contracts normal */
    const osb721  = await OSB721.deploy();
    const osb1155 = await OSB1155.deploy();

    //** Deploy Contracts with Proxy to upgrade contract in future */
	nftChecker = await upgrades.deployProxy(NFTChecker);
	setting = await upgrades.deployProxy(Setting, [superAdmin.address]);
	randomizer = await Randomizer.deploy(setting.address);
	osbFactory = await upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
	osbSoul = await upgrades.deployProxy(OSBSoul,[setting.address, "OSB Soul", "SOUL"]);
	project = await upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]]);
	sale = await upgrades.deployProxy(Sale, [setting.address, nftChecker.address, randomizer.address]);
	importContractABIs(project, sale, osbFactory);

 	//** Setting after deployed */
    await project.connect(superAdmin).setSaleAddress(sale.address);
    await sale.connect(superAdmin).setProjectAddress(project.address);
 	await setting.connect(superAdmin).setAdmin(admin.address, true);

 	//** Check settings after deployed */
 	expect(await project.sale()).to.equal(sale.address);
 	expect(await sale.project()).to.equal(project.address);
 	expect(await setting.getSuperAdmin()).to.equal(superAdmin.address);
 	expect(await setting.isAdmin(admin.address)).to.equal(true);
	})

it("Create project without token available", async () => {
	//** Project data input */
	const token = ZERO_ADDRESS;
	const name = "SingleToken";
	const symbol = "SIN";
	const baseUri = "ipfs://{CID}/.json";
	const isPack = true;
	const isSingle = true;
	const isFixed = true;
	const isInstantPayment = true;
	const royaltyReceiver = ZERO_ADDRESS;
	const royaltyFeeNumerator = 0;
	const minSales = 0;
	let fixedPricePack = 0;
	let maxPricePack = 0;
	let minPricePack = 0;
	let priceDecrementAmtPack = 0;
		
    //** IDO input */
	const saleStart = (await blockTimestamp()) + TEN_MINUTES;
	const saleEnd   = saleStart + ONE_DAY;

	//** Sale inputs */
	const saleAmount  = 5;
	const raisePrices = parseEthers(Array(saleAmount).fill(0.5));
	const saleInputs  = generateInputsFixedWithTokenSingleNotAvailable(saleAmount, Array(saleAmount).fill(baseUri), raisePrices);

	//** add member */
	await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

	//** Publish Project with data inputs */ 
	await project.connect(user1).publish(
		[token, name, symbol, baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, minSales, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
		saleInputs,
		{ value: createProjectFee }
	);
		
    //** Add winners */
    const merkleTree = generateMerkleTree([user2.address, user3.address, user4.address]);
    const rootHash   = merkleTree.getHexRoot();
    await setMerkleRoots(opFundReceiver, genNumbersASC(1, 5), Array(5).fill(rootHash));
		
    //** Skip to start Sale */
    await setTime(saleStart);

    //** Buy Nfts with winners */
    await expect(() => sale.connect(user2).buy(1, hexProof(merkleTree, user2.address), 1, { value: raisePrices[0] })).to.changeEtherBalances(
		[superAdmin, user1, author],
		[...getProfitSuperAdmin(raisePrices[0], profitShareMinimum, WEIGHT_DECIMAL), 0]
	);

    await expect(() => sale.connect(user3).buy(2, hexProof(merkleTree, user3.address), 1, { value: raisePrices[1] })).to.changeEtherBalances(
		[superAdmin, user1, author],
		[...getProfitSuperAdmin(raisePrices[1], profitShareMinimum, WEIGHT_DECIMAL), 0]
	);

    await expect(() => sale.connect(user4).buy(3, hexProof(merkleTree, user4.address), 1, { value: raisePrices[2] })).to.changeEtherBalances(
		[superAdmin, user1, author],
		[...getProfitSuperAdmin(raisePrices[2], profitShareMinimum, WEIGHT_DECIMAL), 0]
	);
 
	const tokenSingle = await OSB721.attach((await project.getProject(1)).token);
		
    expect(await tokenSingle.ownerOf(1)).to.equal(user2.address);
    expect(await tokenSingle.ownerOf(2)).to.equal(user3.address);
    expect(await tokenSingle.ownerOf(3)).to.equal(user4.address);
		
    //** Close sale and get Nfts expire to manager account */
    await setTime(saleEnd);
	await project.connect(user1).closeProject(1, [4, 5], false);
    expect(await tokenSingle.ownerOf(4)).to.equal(user1.address);
    expect(await tokenSingle.ownerOf(5)).to.equal(user1.address);
  })
})