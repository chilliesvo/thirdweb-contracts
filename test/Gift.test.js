const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { checkOwnerOfWallets, checkBalanceOfWallets, genNumbersASC } = require("./utils");
const { contractFactoriesLoader, deploy, deployProxy } = require("../utils/utils");

const tokenUri = "ipfs//:pic.json";

describe("Gift", () => {
  before(async () => {
    //** Get Wallets */
    [deployer, superAdmin, admin, opFundReceiver, settingController, user2, user3, user4, user5, user6, crossmint] = await ethers.getSigners();

    //** Load Contract Factories */
    const contractFactories = await contractFactoriesLoader();
    const { NFTChecker, Setting, OSBFactory, Gift } = contractFactories;
    var { OSB721, OSB1155 } = contractFactories;

		//** Deploy Contracts normal */
    const osb721 = await deploy(OSB721);
    const osb1155 = await deploy(OSB1155);

		//** Deploy Contracts with Proxy to upgrade contract in future */
		nftChecker = await deployProxy(NFTChecker);
		setting = await deployProxy(Setting, [superAdmin.address]);
		osbFactory = await deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
    await expect(deployProxy(Gift, [ZERO_ADDRESS])).to.revertedWith("Invalid nftChecker");
    gift = await deployProxy(Gift, [nftChecker.address]);

		//** Setting after deployed */
		await setting.connect(superAdmin).setAdmin(admin.address, true);
		await setting.connect(superAdmin).setController(settingController.address, true);

		//** Check settings after deployed */
		expect(await gift.nftChecker()).to.equal(nftChecker.address);
		expect(await setting.getSuperAdmin()).to.equal(superAdmin.address);
		expect(await setting.isAdmin(admin.address)).to.equal(true);
		expect(await setting.isController(settingController.address)).to.equal(true);

    //** Collection Input */
    const isSingle = true;
    const contractUri = "ipfs://{CID}/contractUri.json";
    const owner = superAdmin.address;
    const controller = ZERO_ADDRESS;
    const defaultReceiverRoyalty = ZERO_ADDRESS;
    const defaultPercentageRoyalty = 0;
    const maxTotalSupply = 0;

    await osbFactory.connect(superAdmin).create(
      isSingle, owner, controller,
      [contractUri, "Single Token", "SIN", defaultReceiverRoyalty, defaultPercentageRoyalty, maxTotalSupply]);

    await osbFactory.connect(superAdmin).create(
      !isSingle, owner, controller,
      [contractUri, "Multi Token", "MUL", defaultReceiverRoyalty, defaultPercentageRoyalty, maxTotalSupply]);

    tokenSingle = await OSB721.attach((await osbFactory.tokenInfos(1)).token);
    tokenMulti = await OSB1155.attach((await osbFactory.tokenInfos(2)).token);
    await tokenSingle.connect(superAdmin).mintBatch(superAdmin.address, Array(50).fill(tokenUri));
    await tokenMulti.connect(superAdmin).mintBatch(superAdmin.address, Array(50).fill(100), Array(50).fill(tokenUri));
    await tokenSingle.connect(superAdmin).setApprovalForAll(gift.address, true);
    await tokenMulti.connect(superAdmin).setApprovalForAll(gift.address, true);
  });

  describe("gifting", () => {
    it("Should exception `Invalid token`", async () => {
      const ids = genNumbersASC(1, 5);
      const wallets = [user2, user3, user4, user5, user6].map((signer) => signer.address);

      await checkOwnerOfWallets(tokenSingle, ids, Array(5).fill(superAdmin.address));
      await checkBalanceOfWallets(tokenMulti, wallets, ids, Array(5).fill(0));

      await expect(gift.connect(superAdmin).gifting(ZERO_ADDRESS, ids, wallets)).to.revertedWith("Invalid token");
      await expect(gift.connect(superAdmin).gifting(nftChecker.address, ids, wallets)).to.revertedWith("Invalid token");
      await expect(gift.connect(superAdmin).gifting(user3.address, ids, wallets)).to.revertedWith("Invalid token");
    })

    it("Should exception `tokenIds and accounts length mismatch`", async () => {
      let ids = genNumbersASC(1, 5);
      let wallets = [user2, user3, user4, user5, user6].map((signer) => signer.address);

      await checkOwnerOfWallets(tokenSingle, ids, Array(5).fill(superAdmin.address));
      await checkBalanceOfWallets(tokenMulti, wallets, ids, Array(5).fill(0));

      ids = genNumbersASC(1, 4);
      await expect(gift.connect(superAdmin).gifting(tokenSingle.address, ids, wallets)).to.revertedWith("tokenIds and accounts length mismatch");
      await expect(gift.connect(superAdmin).gifting(tokenMulti.address, ids, wallets)).to.revertedWith("tokenIds and accounts length mismatch");
    })

    it("Should success", async () => {
      const ids = genNumbersASC(1, 5);
      const wallets = [user2, user3, user4, user5, user6].map((signer) => signer.address);
      await gift.connect(superAdmin).gifting(tokenSingle.address, ids, wallets);
      await gift.connect(superAdmin).gifting(tokenMulti.address, ids, wallets);

      await checkOwnerOfWallets(tokenSingle, ids, wallets);
      await checkBalanceOfWallets(tokenMulti, wallets, ids, Array(5).fill(1));
    })
  })
});