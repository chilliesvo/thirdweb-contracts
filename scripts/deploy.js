const { ethers } = require("hardhat");
const { parseEther, blockTimestamp, ZERO_ADDRESS } = require("../test/utils");
require("dotenv").config();
const fs = require("fs");
const saveABIs = require("../utils/saveFrontendFiles");
const { deployProxyAndLogger, deployAndLogger, getCrossmintAddress, contractFactoriesLoader } = require("../utils/utils");
const env = process.env;

async function main() {
	//* Get network */
	const network = await ethers.provider.getNetwork();
	const networkName = network.chainId === 31337 ? "hardhat" : network.name;
	const blockTimeNow = await blockTimestamp();

	//* Loading accounts */
	const accounts = await ethers.getSigners();
	const addresses = accounts.map((item) => item.address);
	const deployer = addresses[0];
	
	//* Deploy param */
	const createProjectFee = parseEther(env.CREATE_PROJECT_FEE);
	const profitShareMinimum = Number(env.PROFIT_SHARE_MINIMUM);
	const opFundLimit = parseEther(env.OP_FUND_LIMIT);
	const saleCreateLimit = Number(env.SALE_CREATE_LIMIT);
	const closeLimit = Number(env.CLOSE_LIMIT);
	const crossmintAddress = await getCrossmintAddress();

	//* Loading contract factory */
	const contractFactories = await contractFactoriesLoader();

	//* Deploy contracts */
	const underline = "=".repeat(93);
	console.log(underline);
	console.log("DEPLOYING CONTRACTS");
	console.log(underline);
	console.log('chainId   :>> ', network.chainId);
	console.log('chainName :>> ', networkName);
	console.log('deployer  :>> ', deployer);
	console.log(underline);

	const verifyArguments = {
		chainId: network.chainId,
		networkName,
		deployer
	};

	const setting = await deployProxyAndLogger(
		contractFactories.Setting,
		[deployer]
	);
	verifyArguments.setting = setting.address;
	verifyArguments.settingVerify = setting.addressVerify;

	const nftChecker = await deployProxyAndLogger(contractFactories.NFTChecker);
	verifyArguments.nftChecker = nftChecker.address;
	verifyArguments.nftCheckerVerify = nftChecker.addressVerify;

	const randomizer = await deployAndLogger(
		contractFactories.Randomizer,
		[setting.address]
	);

	const osb721 = await deployAndLogger(contractFactories.OSB721);
	verifyArguments.osb721 = osb721.address;

	const osb1155 = await deployAndLogger(contractFactories.OSB1155);
	verifyArguments.osb1155 = osb1155.address;

	const osbFactory = await deployProxyAndLogger(
		contractFactories.OSBFactory,
		[setting.address, osb721.address, osb1155.address, crossmintAddress]
	);
	verifyArguments.osbFactory = osbFactory.address;
	verifyArguments.osbFactoryVerify = osbFactory.addressVerify;

	const osbSoul = await deployProxyAndLogger(
		contractFactories.OSBSoul,
		[setting.address, env.SOULBOUND_NAME, env.SOULBOUND_SYMBOL]
	);
	verifyArguments.osbSoul = osbSoul.address;
	verifyArguments.osbSoulVerify = osbSoul.addressVerify;

	const project = await deployProxyAndLogger(
		contractFactories.Project,
		[[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, deployer]]
	);
	verifyArguments.project = project.address;
	verifyArguments.projectVerify = project.addressVerify;

	const sale = await deployProxyAndLogger(
		contractFactories.Sale,
		[setting.address, nftChecker.address, randomizer.address]
	);
	verifyArguments.sale = sale.address;
	verifyArguments.saleVerify = sale.addressVerify;

	const gift = await deployProxyAndLogger(
		contractFactories.Gift,
		[nftChecker.address]
	);
	verifyArguments.gift = gift.address;
	verifyArguments.giftVerify = gift.addressVerify;

	const osb721PublicMint = await deployProxyAndLogger(
		contractFactories.OSB721PublicMint,
		[deployer, "", "Open Sky Blue", "OSB", ZERO_ADDRESS, 0]
	);
	verifyArguments.osb721PublicMint = osb721PublicMint.address;
	verifyArguments.osb721PublicMintVerify = osb721PublicMint.addressVerify;

	const osb1155PublicMint = await deployProxyAndLogger(
		contractFactories.OSB1155PublicMint,
		[deployer, "", "Open Sky Blue", "OSB", ZERO_ADDRESS, 0]
	);
	verifyArguments.osb1155PublicMint = osb1155PublicMint.address;
	verifyArguments.osb1155PublicMintVerify = osb1155PublicMint.addressVerify;

	await contractFactories.Project.attach(project.address).setSaleAddress(sale.address);
	await contractFactories.Sale.attach(sale.address).setProjectAddress(project.address);
	await contractFactories.Randomizer.attach(randomizer.address).setAdmin(sale.address, true);
	// await contractFactories.Setting.attach(setting.address).transferOwnership(env.OWNER_WALLET_ADDRESS);

	console.log(underline);
	console.log("DONE");
	console.log(underline);

	const dir = `./deploy-history/${network.chainId}-${networkName}/`;
	const fileName = network.chainId === 31337 ? "hardhat" : blockTimeNow;
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	await fs.writeFileSync("contracts.json", JSON.stringify(verifyArguments));
	await fs.writeFileSync(`${dir}/${fileName}.json`, JSON.stringify(verifyArguments));
	// saveABIs(verifyArguments);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
