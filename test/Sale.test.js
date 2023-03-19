const { ethers } = require("hardhat");
const { expect } = require("chai");
const { blockTimestamp, parseEther, parseEthers, generateMerkleTree, hexProof, genNumbersASC, checkOwnerOfWallets, setTime, ZERO_ADDRESS, skipTime } = require("./utils");
const { multiply, subtract, add, divide } = require("js-big-decimal");
const { PROJECT_STATUS, WEIGHT_DECIMAL, setMerkleRoots, generateInputsFixedWithTokenSingleAvailable, generateInputsFixedWithTokenMultiAvailable, generateInputsDutchWithTokenSingleAvailable, generateInputsFixedWithTokenSingleRoyalty, importContractABIs, getProjectStatus, saleIsClosed, getSaleAmount, generateInputsDutchWithTokenMultiAvailable, buys, generateInputsFixedWithTokenSingleNotAvailable, generateInputsDutchWithTokenSingleNotAvailable, generateInputsDutchWithTokenMultiNotAvailable, generateInputsFixedWithTokenMultiNotAvailable, generateInputsFixedWithTokenMultiRoyalty, getTokenIdsBySaleIds, generateInputsDutchWithTokenSingleRoyalty, generateInputsDutchWithTokenMultiRoyalty } = require("./osb.utils");
const { BigNumber } = require("ethers");
const OSB721JSON = require('../artifacts/contracts/OSB721.sol/OSB721.json');
const OSB1155JSON = require('../artifacts/contracts/OSB1155.sol/OSB1155.json');

const TEN_MINUTES = 600;
const ONE_DAY = 86400;
const createProjectFee = parseEther(0.02);
const opFundLimit = parseEther(2);
const contractUri = "ipfs://";
const saleCreateLimit = 50;
const closeLimit = 100;
const profitShareAdmin = 0;
const profitShareMinimum = 10;

describe("Sale", () => {
	const isPack = true;
	const isSingle = true;
	const isFixed = true;
	const isInstantPayment = true;

	beforeEach(async () => {
		//** Get Wallets */
		[deployer, superAdmin, admin, user1, user2, user3, user4, author1, author2, author3, author4, buyer1, buyer2, buyer3, crossmint] = await ethers.getSigners();

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

		setting = await upgrades.deployProxy(Setting, [superAdmin.address]);

		//** Deploy Contracts normal */
		const osb721 = await OSB721.deploy();
		const osb1155 = await OSB1155.deploy();
		randomizer = await Randomizer.deploy(setting.address);

		//** Deploy Contracts with Proxy to upgrade contracts in the future */
		nftChecker = await upgrades.deployProxy(NFTChecker);
		osbFactory = await upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
		osbSoul = await upgrades.deployProxy(OSBSoul, [setting.address, "OSB Soul", "SOUL"])
		project = await upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]]);
		await expect(upgrades.deployProxy(Sale, [ZERO_ADDRESS, nftChecker.address, randomizer.address])).to.revertedWith("Invalid setting");
		await expect(upgrades.deployProxy(Sale, [setting.address, ZERO_ADDRESS, randomizer.address])).to.revertedWith("Invalid nftChecker");
		sale = await upgrades.deployProxy(Sale, [setting.address, nftChecker.address, randomizer.address]);
		importContractABIs(project, sale, osbFactory);

		//** Setting after deployed */
		await project.connect(superAdmin).setSaleAddress(sale.address);
		await sale.connect(superAdmin).setProjectAddress(project.address);
		await setting.connect(superAdmin).setAdmin(admin.address, true);
		await expect(randomizer.connect(user1).setAdmin(sale.address, true)).to.revertedWith("Only supper admin");
		randomizer.connect(superAdmin).setAdmin(sale.address, true);

		//** Check settings after deployed */
		expect(await project.sale()).to.equal(sale.address);
		expect(await sale.project()).to.equal(project.address);
		expect(await sale.nftChecker()).to.equal(nftChecker.address);
		expect(await setting.getSuperAdmin()).to.equal(superAdmin.address);
		expect(await setting.isAdmin(admin.address)).to.equal(true);
		expect(await randomizer.admins(sale.address)).to.equal(true);

		saleStart = (await blockTimestamp()) + TEN_MINUTES;
		saleEnd = saleStart + ONE_DAY;

		let ownerContract = admin.address;
		let controllerContract = ZERO_ADDRESS;
		await osbFactory.connect(admin).create(true, ownerContract, controllerContract, contractUri, "Token Single", "SIN", author1.address, 2000);
		await osbFactory.connect(admin).create(false, ownerContract, controllerContract, contractUri, "Token Multi", "MUL", author1.address, 2000);

		ownerContract = user1.address;
		await osbFactory.connect(user1).create(true, ownerContract, controllerContract, contractUri, "Token Single", "SIN", author2.address, 2000);
		await osbFactory.connect(user1).create(false, ownerContract, controllerContract, contractUri, "Token Multi", "MUL", author2.address, 2000);

		tokenSingleAdmin = (await osbFactory.tokenInfos(1)).token;
		tokenSingleAdminAttach = await OSB721.attach(tokenSingleAdmin);
		await tokenSingleAdminAttach.connect(admin).mintBatch(admin.address, Array(20).fill("ipfs://pic.json"));
		await tokenSingleAdminAttach.connect(admin).setApprovalForAll(sale.address, true);

		tokenMultiAdmin = (await osbFactory.tokenInfos(2)).token;
		tokenMultiAdminAttach = await OSB1155.attach(tokenMultiAdmin);
		await tokenMultiAdminAttach.connect(admin).mintBatch(admin.address, Array(20).fill(200), Array(20).fill("ipfs://pic.json"));
		await tokenMultiAdminAttach.connect(admin).setApprovalForAll(sale.address, true);

		tokenSingleUser = (await osbFactory.tokenInfos(3)).token;
		tokenSingleUserAttach = await OSB721.attach(tokenSingleUser);
		await tokenSingleUserAttach.connect(user1).mintBatch(user1.address, Array(20).fill("ipfs://pic.json"));
		await tokenSingleUserAttach.connect(user1).setApprovalForAll(sale.address, true);

		tokenMultiUser = (await osbFactory.tokenInfos(4)).token;
		tokenMultiUserAttach = await OSB1155.attach(tokenMultiUser);
		await tokenMultiUserAttach.connect(user1).mintBatch(user1.address, Array(20).fill(200), Array(20).fill("ipfs://pic.json"));
		await tokenMultiUserAttach.connect(user1).setApprovalForAll(sale.address, true);
	})

	// ============ OWNER-ONLY ADMIN FUNCTIONS =============

	describe("setProjectAddress", () => {
		it("Should return exception `Caller is not the super admin`", async () => {
			expect(await sale.project()).to.equal(project.address);
			await expect(sale.connect(user1).setProjectAddress(user2.address)).to.revertedWith("Caller is not the super admin");
			await expect(sale.connect(admin).setProjectAddress(user2.address)).to.revertedWith("Caller is not the super admin");
			await sale.connect(superAdmin).setProjectAddress(user1.address);
			expect(await sale.project()).to.equal(user1.address);
		})

		it("Should return exception `Invalid Project address`", async () => {
			expect(await sale.project()).to.equal(project.address);
			await expect(sale.connect(superAdmin).setProjectAddress(ZERO_ADDRESS)).to.revertedWith("Invalid Project address");
			await sale.connect(superAdmin).setProjectAddress(user1.address);
			expect(await sale.project()).to.equal(user1.address);
		})

		it("Should return success", async () => {
			expect(await sale.project()).to.equal(project.address);
			await sale.connect(superAdmin).setProjectAddress(user1.address);
			expect(await sale.project()).to.equal(user1.address);
		})
	})

	describe("setRandomizerAddress", () => {
		it("Should return exception `Caller is not the super admin`", async () => {
			await expect(sale.connect(user1).setRandomizerAddress(user2.address)).to.revertedWith("Caller is not the super admin");
			await expect(sale.connect(admin).setRandomizerAddress(user2.address)).to.revertedWith("Caller is not the super admin");
		});

		it("Should return exception `Invalid randomizer address`", async () => {
			await expect(sale.connect(superAdmin).setRandomizerAddress(ZERO_ADDRESS)).to.revertedWith("Invalid randomizer address");
		});

		it("Should return success", async () => {
			const Randomizer = await ethers.getContractFactory("Randomizer");
			const newRandomizer = await Randomizer.deploy(setting.address);

			await expect(sale.connect(superAdmin).setRandomizerAddress(newRandomizer.address))
				.to.emit(sale, "SetRandomizerAddress")
				.withArgs(randomizer.address, newRandomizer.address);
			expect(await sale.randomizer()).to.equal(newRandomizer.address);
		})
	})

	// ============ PROJECT-ONLY FUNCTIONS =============

	describe("setCloseSale", () => {
		it("Should return exception `Caller is not the Project`", async () => {
			expect(await saleIsClosed(1)).to.equal(false);
			await expect(sale.connect(superAdmin).setCloseSale(1)).to.revertedWith("Caller is not the Project");
			await sale.connect(superAdmin).setProjectAddress(superAdmin.address);
			await sale.connect(superAdmin).setCloseSale(1);
			expect(await saleIsClosed(1)).to.equal(true);
		})

		it("Should return success", async () => {
			expect(await saleIsClosed(1)).to.equal(false);
			await sale.connect(superAdmin).setProjectAddress(superAdmin.address);
			await sale.connect(superAdmin).setCloseSale(1);
			expect(await saleIsClosed(1)).to.equal(true);
		})
	})

	describe("resetAmountSale", () => {
		it("Should return exception `Caller is not the Project`", async () => {
			expect(await getSaleAmount(1)).to.equal(0);
			await expect(sale.connect(superAdmin).resetAmountSale(1)).to.revertedWith("Caller is not the Project");
			await sale.connect(superAdmin).setProjectAddress(superAdmin.address);
			await sale.connect(superAdmin).resetAmountSale(1);
			expect(await getSaleAmount(1)).to.equal(0);
		})

		it("Should return success", async () => {
			expect(await getSaleAmount(1)).to.equal(0);
			await sale.connect(superAdmin).setProjectAddress(superAdmin.address);
			await sale.connect(superAdmin).resetAmountSale(1);
			expect(await getSaleAmount(1)).to.equal(0);
		})
	})

	describe("setMerkleRoot", () => {
		let fixedPrices = Array(20).fill(parseEther(1));
		let merkleTree, rootHash;
		let fixedPricePack = 0;
		let maxPricePack = 0;
		let minPricePack = 0;
		let priceDecrementAmtPack = 0;

		beforeEach(async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 20), fixedPrices),
				{ value: createProjectFee }
			);

			merkleTree = generateMerkleTree([user1.address, user2.address]);
			rootHash = merkleTree.getHexRoot();
		})

		it("Should return exception `Caller is not the opFundReceiver`", async () => {
			await expect(sale.connect(user1).setMerkleRoot(1, rootHash)).to.revertedWith("Caller is not the opFundReceiver");
			await sale.connect(opFundReceiver).setMerkleRoot(1, rootHash);
		})

		it("Should return exception `Invalid sale`", async () => {
			await expect(sale.connect(opFundReceiver).setMerkleRoot(21, rootHash)).to.revertedWith("Invalid sale");
			await sale.connect(opFundReceiver).setMerkleRoot(1, rootHash);
		})

		it("Should return success", async () => {
			for (let i = 1; i <= fixedPrices.length; i++) {
				await sale.connect(opFundReceiver).setMerkleRoot(i, rootHash);
				expect(await sale.merkleRoots(i)).to.equal(rootHash);
			}
		})
	})

	describe("createSale", () => {
		let fixedPricePack = 0;
		let maxPricePack = 0;
		let minPricePack = 0;
		let priceDecrementAmtPack = 0;
		it("Should return exception `Sales is empty`", async () => {
			expect(await sale.lastId()).to.equal(0);

			await expect(project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				[],
				{ value: createProjectFee }
			)).to.revertedWith("Sales is empty");
			
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(parseEther(1))),
				{ value: createProjectFee }
			);

			expect(await sale.lastId()).to.equal(20);
		})

		it("Should return exception `Invalid amount`", async () => {
			expect(await sale.lastId()).to.equal(0);
			await expect(project.connect(admin).publish(
				[tokenMultiAdmin, "", "", contractUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(0), Array(20).fill(parseEther(1))),
				{ value: createProjectFee }
			)).to.revertedWith("Invalid amount");
		
			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", contractUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(10), Array(20).fill(parseEther(1))),
				{ value: createProjectFee }
			);

			expect(await sale.lastId()).to.equal(20);
		})

		it("Should return exception `Invalid price`", async () => {
			expect(await sale.lastId()).to.equal(0);

			await expect(project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(1), Array(20).fill(2), Array(20).fill(1)),
				{ value: createProjectFee }
			)).to.revertedWith("Invalid price");

			await expect(project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(3), Array(20).fill(0), Array(20).fill(1)),
				{ value: createProjectFee }
			)).to.revertedWith("Invalid price");

			await expect(project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(3), Array(20).fill(1), Array(20).fill(5)),
				{ value: createProjectFee }
			)).to.revertedWith("Invalid price");

			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(3), Array(20).fill(1), Array(20).fill(1)),
				{ value: createProjectFee }
			);

			expect(await sale.lastId()).to.equal(20);
		})

		it("Should return success", async () => {
			expect(await sale.lastId()).to.equal(0);

			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(parseEther(1))),
				{ value: createProjectFee }
			);

			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", contractUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(10), Array(20).fill(parseEther(1))),
				{ value: createProjectFee }
			);

			expect(await sale.lastId()).to.equal(40);
		})
	})

	describe("buy", () => {
        let fixedPrices = parseEthers([1, 2, 0]);
        let maxPrices = parseEthers([1, 2, 1]);
        let minPrices = parseEthers([0.1, 0.2, 0.1]);
        let priceDecrementAmts = parseEthers([0.01, 0.02, 0.01]);
        let merkleTree, rootHash;
        let fixedPricePack = 0;
        let maxPricePack = parseEther(1);
        let minPricePack = parseEther(0.1);
        let priceDecrementAmtPack = parseEther(0.01);
        beforeEach(async () => {
            merkleTree = generateMerkleTree([user1.address, user2.address, buyer1.address, buyer2.address]);
            hexProofUser1 = hexProof(merkleTree, user1.address);
            hexProofUser2 = hexProof(merkleTree, user2.address);
            hexProofUser3 = hexProof(merkleTree, user3.address);

            hexProofBuyer1 = hexProof(merkleTree, buyer1.address);
            hexProofBuyer2 = hexProof(merkleTree, buyer2.address);
            rootHash = merkleTree.getHexRoot();

			//add member
			await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

            await project
                .connect(admin)
                .publish(
                    [
                        tokenSingleAdmin,
                        "",
                        "",
                        contractUri,
                        !isPack,
                        isSingle,
                        isFixed,
                        isInstantPayment,
                        ZERO_ADDRESS,
                        0,
                        0,
                        fixedPricePack,
                        maxPricePack,
                        minPricePack,
                        priceDecrementAmtPack,
						profitShareAdmin,
                        saleStart,
                        saleEnd,
                    ],
                    generateInputsFixedWithTokenSingleAvailable([1, 2, 3], fixedPrices),
                    { value: createProjectFee }
                );
            project_singleFixedAdmin_id = await project.lastId();

            await project
                .connect(admin)
                .publish(
                    [
                        tokenSingleAdmin,
                        "",
                        "",
                        contractUri,
                        !isPack,
                        isSingle,
                        !isFixed,
                        isInstantPayment,
                        ZERO_ADDRESS,
                        0,
                        0,
                        fixedPricePack,
                        maxPricePack,
                        minPricePack,
                        priceDecrementAmtPack,
						profitShareAdmin,
                        saleStart,
                        saleEnd,
                    ],
                    generateInputsDutchWithTokenSingleAvailable([4, 5, 6], maxPrices, minPrices, priceDecrementAmts),
                    { value: createProjectFee }
                );
            project_singleAuctionAdmin_id = await project.lastId();

            await project
                .connect(admin)
                .publish(
                    [
                        tokenMultiAdmin,
                        "",
                        "",
                        contractUri,
                        !isPack,
                        !isSingle,
                        isFixed,
                        !isInstantPayment,
                        ZERO_ADDRESS,
                        0,
                        0,
                        fixedPricePack,
                        maxPricePack,
                        minPricePack,
                        priceDecrementAmtPack,
						profitShareAdmin,
                        saleStart,
                        saleEnd,
                    ],
                    generateInputsFixedWithTokenMultiAvailable([1, 2, 3], [100, 100, 100], fixedPrices),
                    { value: createProjectFee }
                );
            project_multiFixedAdmin_id = await project.lastId();

            await project
                .connect(user1)
                .publish(
                    [
                        tokenSingleUser,
                        "",
                        "",
                        contractUri,
                        !isPack,
                        isSingle,
                        isFixed,
                        isInstantPayment,
                        ZERO_ADDRESS,
                        0,
                        0,
                        fixedPricePack,
                        maxPricePack,
                        minPricePack,
                        priceDecrementAmtPack,
						profitShareMinimum,
                        saleStart,
                        saleEnd,
                    ],
                    generateInputsFixedWithTokenSingleAvailable([1, 2, 3], fixedPrices),
                    { value: createProjectFee }
                );
            project_singleFixed_id = await project.lastId();

            await project
                .connect(user1)
                .publish(
                    [
                        tokenMultiUser,
                        "",
                        "",
                        contractUri,
                        !isPack,
                        !isSingle,
                        !isFixed,
                        !isInstantPayment,
                        ZERO_ADDRESS,
                        0,
                        0,
                        fixedPricePack,
                        maxPricePack,
                        minPricePack,
                        priceDecrementAmtPack,
						profitShareMinimum,
                        saleStart,
                        saleEnd,
                    ],
                    generateInputsDutchWithTokenMultiAvailable(genNumbersASC(5, 7), Array(3).fill(100), maxPrices, minPrices, priceDecrementAmts),
                    { value: createProjectFee }
                );
            project_multiAuction_id = await project.lastId();

            await project
                .connect(user1)
                .publish(
                    [
                        ZERO_ADDRESS,
                        "Multi Token",
                        "Mul",
                        contractUri,
                        !isPack,
                        !isSingle,
                        isFixed,
                        isInstantPayment,
                        admin.address,
                        5000,
                        0,
                        fixedPricePack,
                        maxPricePack,
                        minPricePack,
                        priceDecrementAmtPack,
						profitShareMinimum,
                        saleStart,
                        saleEnd,
                    ],
                    generateInputsFixedWithTokenMultiRoyalty([100, 100, 100], Array(3).fill("ipfs://pic.json"), Array(3).fill(admin.address), [6000, 1000, 2000], fixedPrices),
                    { value: createProjectFee }
                );
            project_multiFixed_id = await project.lastId();

            fixedPricePack = parseEther(1);
            await project
                .connect(admin)
                .publish(
                    [
                        ZERO_ADDRESS,
                        "Single",
                        "SIN",
                        contractUri,
                        isPack,
                        isSingle,
                        isFixed,
                        isInstantPayment,
                        admin.address,
                        5000,
                        0,
                        fixedPricePack,
                        maxPricePack,
                        minPricePack,
                        priceDecrementAmtPack,
						profitShareAdmin,
                        saleStart,
                        saleEnd,
                    ],
                    generateInputsFixedWithTokenSingleRoyalty(3, Array(3).fill("ipfs://pic.json"), Array(3).fill(admin.address), [6000, 1000, 2000], [0, 0, 0]),
                    { value: createProjectFee }
                );
            project_packFixedAdmin_id = await project.lastId();

            project_singleAuctionAdmin = await project.getProject(project_singleAuctionAdmin_id);
        });

        it("Should return exception `Project is pack`", async () => {
            await setTime(saleStart);
            const hexProofUser1 = hexProof(merkleTree, user1.address);

            await sale.connect(opFundReceiver).setMerkleRoot(20, rootHash);
            await sale.connect(opFundReceiver).setMerkleRoot(3, rootHash);

            await expect(sale.connect(user1).buy(20, hexProofUser1, 1, { value: parseEther(1) })).to.revertedWith("Project is pack");
            await sale.connect(user1).buy(3, hexProofUser1, 1, { value: 0 });
        });

        it("Should return exception `Invalid winner`", async () => {
            await setTime(saleStart);
            const hexProofUser3 = hexProof(merkleTree, user3.address);
            await expect(sale.connect(user1).buy(1, hexProofUser3, 1, { value: parseEther(1) })).to.revertedWith("Invalid winner");
            await sale.connect(opFundReceiver).setMerkleRoot(1, rootHash);
            await sale.connect(opFundReceiver).setMerkleRoot(3, rootHash);

            const hexProofUser1 = hexProof(merkleTree, user1.address);
            await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
            await sale.connect(user1).buy(3, hexProofUser1, 1, { value: 0 });
        });

        it("Should return exception `Sold out`", async () => {
            await setTime(saleStart);
            await sale.connect(opFundReceiver).setMerkleRoot(1, rootHash);
            await sale.connect(opFundReceiver).setMerkleRoot(3, rootHash);
            await sale.connect(opFundReceiver).setMerkleRoot(7, rootHash);

            const hexProofUser1 = hexProof(merkleTree, user1.address);
            const hexProofUser2 = hexProof(merkleTree, user2.address);
            await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
            await sale.connect(user2).buy(3, hexProofUser2, 1, { value: 0 });
            await sale.connect(user2).buy(7, hexProofUser2, 100, { value: parseEther("1").mul(100) });
            await expect(sale.connect(user2).buy(1, hexProofUser2, 1, { value: parseEther(1) })).to.revertedWith("Sold out");
            await expect(sale.connect(user2).buy(7, hexProofUser2, 1, { value: parseEther(1) })).to.revertedWith("Sold out");
            await expect(sale.connect(user2).buy(3, hexProofUser2, 1, { value: 0 })).to.revertedWith("Sold out");
        });

        it("Should return exception `Invalid amount`", async () => {
            await sale.connect(opFundReceiver).setMerkleRoot(1, rootHash);
            await sale.connect(opFundReceiver).setMerkleRoot(7, rootHash);

            await setTime(saleStart);
            const hexProofUser1 = hexProof(merkleTree, user1.address);
            await expect(sale.connect(user1).buy(7, hexProofUser1, 0, { value: parseEther(1) })).to.revertedWith("Invalid amount");
            await expect(sale.connect(user1).buy(7, hexProofUser1, 101, { value: parseEther(1).mul(101) })).to.revertedWith("Invalid amount");
            await expect(sale.connect(user1).buy(1, hexProofUser1, 0, { value: parseEther(1) })).to.revertedWith("Invalid amount");
            await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
        });

        it("Should return exception `Invalid value`", async () => {
            await sale.connect(opFundReceiver).setMerkleRoot(1, rootHash);
            await setTime(saleStart);

            const hexProofUser1 = hexProof(merkleTree, user1.address);
            await expect(sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(2) })).to.revertedWith("Invalid value");
            await expect(sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(0.1) })).to.revertedWith("Invalid value");
            await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
        });

        it("Should return success with fixed case", async () => {
            await setTime(saleStart);

            // project with single sale and instant payment, created by admin
            // saleIds: [1, 2, 3]
            let saleIds = await sale.getSaleIdsOfProject(project_singleFixedAdmin_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 1, {
                    value: parseEther("1"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [parseEther("1").mul(-1), 0, parseEther("0.8"), parseEther("0.2")]);
            let saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            let currentProject = await project.getProject(project_singleFixedAdmin_id);
            expect(currentProject.sold).to.equal(1);

            let buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(1);

            const provider = ethers.provider;
            let projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address)).to.equal(5);
            expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(1);
            expect(await projectTokenContract.ownerOf(saleInfos.tokenId)).to.equal(buyer1.address);

            await expect(() =>
                sale.connect(buyer2).buy(saleIds[1], hexProofBuyer2, 1, {
                    value: parseEther("2"),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [parseEther("1").mul(-2), 0, parseEther("1.6"), parseEther("0.4")]);
            saleInfos = await sale.sales(saleIds[1]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            currentProject = await project.getProject(project_singleFixedAdmin_id);
            expect(currentProject.sold).to.equal(2);

            buyers = await sale.getBuyers(saleIds[1]);
            expect(buyers.length).to.equal(1);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address)).to.equal(4);
            expect(await projectTokenContract.balanceOf(buyer2.address)).to.equal(1);
            expect(await projectTokenContract.ownerOf(saleInfos.tokenId)).to.equal(buyer2.address);

            // project with multi sale and bill payment, created by admin
            // saleIds [7, 8, 9]
            saleIds = await sale.getSaleIdsOfProject(project_multiFixedAdmin_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

            // Buyer 1
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 10, {
                    value: parseEther("10"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [parseEther("1").mul(-10), 0, 0, 0]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(90);
            expect(saleInfos.isSoldOut).to.be.false;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiFixedAdmin_id);
            expect(currentProject.sold).to.equal(10);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(1);

            let billInfo = await sale.getBill(saleIds[0], buyer1.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(10);
            expect(billInfo.royaltyReceiver).to.equal(author1.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("2"));
            expect(billInfo.superAdminFee).to.equal(parseEther("8"));
            expect(billInfo.sellerFee).to.equal(0);
            expect(billInfo.account).to.equal(buyer1.address);
            expect(await project.getTotalBuyersWaitingDistribution(project_multiFixedAdmin_id)).to.equal(1);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(1);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[0]).to.equal(buyer1.address);

            // Buyer 2
            await expect(() =>
                sale.connect(buyer2).buy(saleIds[0], hexProofBuyer2, 40, {
                    value: parseEther("40"),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [parseEther("1").mul(-40), 0, 0, 0]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(50);
            expect(saleInfos.isSoldOut).to.be.false;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiFixedAdmin_id);
            expect(currentProject.sold).to.equal(50);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(2);

            billInfo = await sale.getBill(saleIds[0], buyer2.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(40);
            expect(billInfo.royaltyReceiver).to.equal(author1.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("8"));
            expect(billInfo.superAdminFee).to.equal(parseEther("32"));
            expect(billInfo.sellerFee).to.equal(0);
            expect(billInfo.account).to.equal(buyer2.address);
            expect(await project.getTotalBuyersWaitingDistribution(project_multiFixedAdmin_id)).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[1]).to.equal(buyer2.address);

            // Buyer 1
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 50, {
                    value: parseEther("50"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [parseEther("1").mul(-50), 0, 0, 0]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiFixedAdmin_id);
            expect(currentProject.sold).to.equal(100);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(2);

            billInfo = await sale.getBill(saleIds[0], buyer1.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(60);
            expect(billInfo.royaltyReceiver).to.equal(author1.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("12"));
            expect(billInfo.superAdminFee).to.equal(parseEther("48"));
            expect(billInfo.sellerFee).to.equal(0);
            expect(billInfo.account).to.equal(buyer1.address);
            expect(await project.getTotalBuyersWaitingDistribution(project_multiFixedAdmin_id)).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[0]).to.equal(buyer1.address);

            // project with single and instant payment created by user
            // saleIds [13, 14, 15]
            saleIds = await sale.getSaleIdsOfProject(project_singleFixed_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }
            // Buyer 1
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 1, {
                    value: parseEther("1"),
                })
            ).to.changeEtherBalances([buyer1, superAdmin, author1, author2, user1], [parseEther("1").mul(-1), parseEther("0.1"), 0, parseEther("0.2"), parseEther("0.7")]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            currentProject = await project.getProject(project_singleFixed_id);
            expect(currentProject.sold).to.equal(1);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(1);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address)).to.equal(2);
            expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(1);
            expect(await projectTokenContract.ownerOf(saleInfos.tokenId)).to.equal(buyer1.address);

            await expect(() =>
                sale.connect(buyer2).buy(saleIds[1], hexProofBuyer2, 1, {
                    value: parseEther("2"),
                })
            ).to.changeEtherBalances([buyer2, superAdmin, author2, user1], [parseEther("1").mul(-2), parseEther("0.2"), parseEther("0.4"), parseEther("1.4")]);
            saleInfos = await sale.sales(saleIds[1]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            currentProject = await project.getProject(project_singleFixedAdmin_id);
            expect(currentProject.sold).to.equal(2);

            buyers = await sale.getBuyers(saleIds[1]);
            expect(buyers.length).to.equal(1);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address)).to.equal(4);
            expect(await projectTokenContract.balanceOf(buyer2.address)).to.equal(1);
            expect(await projectTokenContract.ownerOf(saleInfos.tokenId)).to.equal(buyer2.address);

            // project with multi sales and instant payment
            // [13, 14, 15]
            saleIds = await sale.getSaleIdsOfProject(project_multiFixed_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }
            // Buyer 1
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 10, {
                    value: parseEther("10"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, user1], [parseEther("1").mul(-10), parseEther("6"), parseEther("1"), parseEther("3")]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(90);
            expect(saleInfos.isSoldOut).to.be.false;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiFixed_id);
            expect(currentProject.sold).to.equal(10);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(1);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB1155JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(90);
            expect(await projectTokenContract.balanceOf(buyer1.address, saleInfos.tokenId)).to.equal(10);

            // Buyer 2
            await expect(() =>
                sale.connect(buyer2).buy(saleIds[0], hexProofBuyer2, 60, {
                    value: parseEther("60"),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, user1], [parseEther("1").mul(-60), parseEther("36"), parseEther("6"), parseEther("18")]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(30);
            expect(saleInfos.isSoldOut).to.be.false;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiFixed_id);
            expect(currentProject.sold).to.equal(70);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(2);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB1155JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(30);
            expect(await projectTokenContract.balanceOf(buyer2.address, saleInfos.tokenId)).to.equal(60);

            // Buyer 1
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 30, {
                    value: parseEther("30"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, user1], [parseEther("1").mul(-30), parseEther("18"), parseEther("3"), parseEther("9")]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            currentProject = await project.getProject(project_multiFixed_id);
            expect(currentProject.sold).to.equal(100);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(2);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB1155JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(0);
            expect(await projectTokenContract.balanceOf(buyer1.address, saleInfos.tokenId)).to.equal(40);

            // Sale 2
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[1], hexProofBuyer1, 100, {
                    value: parseEther("200"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, user1], [parseEther("1").mul(-200), parseEther("20"), parseEther("20"), parseEther("160")]);
            saleInfos = await sale.sales(saleIds[1]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            currentProject = await project.getProject(project_multiFixed_id);
            expect(currentProject.sold).to.equal(200);

            buyers = await sale.getBuyers(saleIds[1]);
            expect(buyers.length).to.equal(1);

            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(0);
            expect(await projectTokenContract.balanceOf(buyer1.address, saleInfos.tokenId)).to.equal(100);

            // Sale 3
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[2], hexProofBuyer1, 100, {
                    value: parseEther("0"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, user1], [0, 0, 0, 0]);
            saleInfos = await sale.sales(saleIds[2]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            currentProject = await project.getProject(project_multiFixed_id);
            expect(currentProject.sold).to.equal(300);
            expect(currentProject.status).to.equal(PROJECT_STATUS.ENDED);

            buyers = await sale.getBuyers(saleIds[2]);
            expect(buyers.length).to.equal(1);

            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(0);
            expect(await projectTokenContract.balanceOf(buyer1.address, saleInfos.tokenId)).to.equal(100);
        });

        it("Should return success with auction case", async () => {
            await setTime(saleStart);

            // First sale has price 1 ETH
            // Dutch auction case
            // auctionDecrement = (1e18 - 1e17) / 1e16 = 90
            // timeToDecrementPrice = (1672998451 - 1672912051) / 90 = 960 second
            // requiredPrice = 1e18 - 1e16 = 0.99 ETH for the first sale, 1.98 for the second sale, 0 for the third sale

            const auctionDecrement = maxPricePack.sub(minPricePack).div(priceDecrementAmtPack);
            const timeToDecrementPrice = project_singleAuctionAdmin.saleEnd.sub(project_singleAuctionAdmin.saleStart).div(auctionDecrement);
            let requiredPrice = maxPricePack.sub(priceDecrementAmtPack);
            await skipTime(timeToDecrementPrice.toNumber());

            // project with single auction and instant payment, created by admin
            // saleIds: [1, 2, 3]
            let saleIds = await sale.getSaleIdsOfProject(project_singleAuctionAdmin_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 1, {
                    value: requiredPrice,
                })
            ).to.changeEtherBalances([buyer1, superAdmin, author1], [requiredPrice.mul(-1), parseEther("0.792"), parseEther("0.198")]);

            let saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            let currentProject = await project.getProject(project_singleAuctionAdmin_id);
            expect(currentProject.sold).to.equal(1);

            let buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(1);

            const provider = ethers.provider;
            let projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(1);
            expect(await projectTokenContract.ownerOf(saleInfos.tokenId)).to.equal(buyer1.address);

            await expect(() =>
                sale.connect(buyer2).buy(saleIds[1], hexProofBuyer2, 1, {
                    value: parseEther("2"),
                })
            ).to.changeEtherBalances([buyer2, superAdmin, author1], [parseEther("1.98").mul(-1), parseEther("1.584"), parseEther("0.396")]);
            saleInfos = await sale.sales(saleIds[1]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.true;

            currentProject = await project.getProject(project_singleAuctionAdmin_id);
            expect(currentProject.sold).to.equal(2);

            buyers = await sale.getBuyers(saleIds[1]);
            expect(buyers.length).to.equal(1);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(buyer2.address)).to.equal(1);
            expect(await projectTokenContract.ownerOf(saleInfos.tokenId)).to.equal(buyer2.address);

            // project with multi-sale and bill payment, created by user
            saleIds = await sale.getSaleIdsOfProject(project_multiAuction_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

            // Buyer 1
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 10, {
                    value: requiredPrice.mul(10),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-10), 0, 0, 0]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(90);
            expect(saleInfos.isSoldOut).to.be.false;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiAuction_id);
            expect(currentProject.sold).to.equal(10);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(1);

            billInfo = await sale.getBill(saleIds[0], buyer1.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(10);
            expect(billInfo.royaltyReceiver).to.equal(author2.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("1.98"));
            expect(billInfo.superAdminFee).to.equal(parseEther(0.99));
            expect(billInfo.sellerFee).to.equal(parseEther("6.93"));
            expect(billInfo.account).to.equal(buyer1.address);
            expect(await project.getTotalBuyersWaitingDistribution(project_multiAuction_id)).to.equal(1);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(1);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[0]).to.equal(buyer1.address);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB1155JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(100);
            expect(await projectTokenContract.balanceOf(buyer1.address, saleInfos.tokenId)).to.equal(0);

            // Buyer 2
            requiredPrice = requiredPrice.sub(priceDecrementAmtPack);
            await skipTime(timeToDecrementPrice.toNumber());

            await expect(() =>
                sale.connect(buyer2).buy(saleIds[0], hexProofBuyer2, 60, {
                    value: requiredPrice.mul(60),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, user1], [requiredPrice.mul(-60), 0, 0, 0]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(30);
            expect(saleInfos.isSoldOut).to.be.false;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiAuction_id);
            expect(currentProject.sold).to.equal(70);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(2);

            billInfo = await sale.getBill(saleIds[0], buyer2.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(60);
            expect(billInfo.royaltyReceiver).to.equal(author2.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("11.76"));
            expect(billInfo.superAdminFee).to.equal(parseEther("5.88"));
            expect(billInfo.sellerFee).to.equal(parseEther("41.16"));
            expect(billInfo.account).to.equal(buyer2.address);
            expect(await project.getTotalBuyersWaitingDistribution(project_multiAuction_id)).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[1]).to.equal(buyer2.address);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB1155JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(100);
            expect(await projectTokenContract.balanceOf(buyer2.address, saleInfos.tokenId)).to.equal(0);

            // Buyer 1
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 30, {
                    value: requiredPrice.mul(30),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-30), 0, 0, 0]);
            saleInfos = await sale.sales(saleIds[0]);
            expect(saleInfos.amount).to.equal(0);
            expect(saleInfos.isSoldOut).to.be.true;
            expect(saleInfos.isClose).to.be.false;

            currentProject = await project.getProject(project_multiAuction_id);
            expect(currentProject.sold).to.equal(100);

            buyers = await sale.getBuyers(saleIds[0]);
            expect(buyers.length).to.equal(2);

            billInfo = await sale.getBill(saleIds[0], buyer1.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(40);
            expect(billInfo.royaltyReceiver).to.equal(author2.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("7.86"));
            expect(billInfo.superAdminFee).to.equal(parseEther("3.93"));
            expect(billInfo.sellerFee).to.equal(parseEther("27.51"));
            expect(billInfo.account).to.equal(buyer1.address);
            expect(await project.getTotalBuyersWaitingDistribution(project_multiAuction_id)).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[0]).to.equal(buyer1.address);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB1155JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address, saleInfos.tokenId)).to.equal(100);
            expect(await projectTokenContract.balanceOf(buyer1.address, saleInfos.tokenId)).to.equal(0);
        });
    });

	describe("buyPack", () => {
		let merkleTree, rootHash;

		let fixedPrices = parseEthers([1, 2, 0]);
		let fixedPricePack = parseEther(1);
		let maxPricePack = parseEther(1);
		let minPricePack = parseEther(0.1);
		let priceDecrementAmtPack = parseEther(0.01);
		beforeEach(async () => {
			merkleTree = generateMerkleTree([user1.address, user2.address, buyer1.address, buyer2.address]);
			hexProofUser1 = hexProof(merkleTree, user1.address);
			hexProofUser2 = hexProof(merkleTree, user2.address);
			hexProofUser3 = hexProof(merkleTree, user3.address);

			hexProofBuyer1 = hexProof(merkleTree, buyer1.address);
			hexProofBuyer2 = hexProof(merkleTree, buyer2.address);
			rootHash = merkleTree.getHexRoot();

			//add member
			await osbSoul.connect(admin).mint(user1.address, "https://ipfs");  

			// pack project with fixed price and instant payment
			await project.connect(user1).publish(
				[ZERO_ADDRESS, "Single", "SIN", contractUri, isPack, isSingle, isFixed, isInstantPayment, admin.address, 5000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(2000), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackFixed_id = await project.lastId();

			// normal project with fixed price and instant payment and created by admin
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable([1, 2, 3], fixedPrices),
				{ value: createProjectFee }
			);

			// pack project with fixed price and bill payment
			await project.connect(user1).publish(
				[ZERO_ADDRESS, "Single", "SIN", contractUri, isPack, isSingle, isFixed, !isInstantPayment, admin.address, 5000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(2000), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackFixedBill_id = await project.lastId();

			// pack project with fixed price and instant payment, created by admin
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "Single", "SIN", contractUri, isPack, isSingle, isFixed, isInstantPayment, admin.address, 5000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(10000), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackFixedAdmin_id = await project.lastId();

			// pack project with auction price and instant payment
			await project.connect(user1).publish(
				[ZERO_ADDRESS, "Single Pack Auction", "SIN_PACK_AUCTION", contractUri, isPack, isSingle, !isFixed, isInstantPayment, admin.address, 5000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(9500), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackAuction_id = await project.lastId();

			// pack project with auction price and bill payment
			await project.connect(user1).publish(
				[ZERO_ADDRESS, "Single Pack Auction", "SIN_PACK_AUCTION", contractUri, isPack, isSingle, !isFixed, !isInstantPayment, admin.address, 5000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(2000), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackAuctionBill_id = await project.lastId();

			// pack project with auction price and instant payment, created by admin
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "Single Pack Auction", "SIN_PACK_AUCTION", contractUri, isPack, isSingle, !isFixed, isInstantPayment, admin.address, 5000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(0), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackAuctionAdmin_id = await project.lastId();

			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackAuction_id, rootHash);
			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackFixed_id, rootHash);
			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackFixedAdmin_id, rootHash);
			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackFixedBill_id, rootHash);
			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackAuctionBill_id, rootHash);
			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackAuctionAdmin_id, rootHash);

			project_singlePackAuction = await project.getProject(project_singlePackAuction_id);
		})

		it("Should return exception `Invalid winner`", async () => {
			await project.connect(opFundReceiver).setMerkleRoot(1, rootHash);
			await setTime(saleStart);
			await expect(sale.connect(user1).buyPack(1, hexProofUser3, 1, { value: parseEther(1) })).to.revertedWith("Invalid winner");
		})
		
		it("Should return exception `Project is not pack`", async () => {
			await project.connect(opFundReceiver).setMerkleRoot(2, rootHash);
			await setTime(saleStart);
			await expect(sale.connect(user1).buyPack(2, hexProofUser1, 1, { value: parseEther(1) })).to.revertedWith("Project is not pack");
		})

		it("Should return exception `Sold out`", async () => {
			await project.connect(opFundReceiver).setMerkleRoot(3, rootHash);
			await setTime(saleStart);

			await sale.connect(user1).buyPack(3, hexProofUser1, 6, { value: parseEther(6) });
			await expect(sale.connect(user2).buyPack(3, hexProofUser2, 1, { value: parseEther(1) })).to.revertedWith("Sold out");
		})

		it("Should return exception `Invalid amount`", async () => {
			await project.connect(opFundReceiver).setMerkleRoot(3, rootHash);
			await setTime(saleStart);

			await expect(sale.connect(user2).buyPack(3, hexProofUser2, 0, { value: parseEther(1) })).to.revertedWith("Invalid amount");
			await expect(sale.connect(user2).buyPack(3, hexProofUser2, 7, { value: parseEther(1) })).to.revertedWith("Invalid amount");
		})

		it("Should return exception `Invalid value`", async () => {
			await project.connect(opFundReceiver).setMerkleRoot(3, rootHash);
			await setTime(saleStart);

			// Fixed price case
			await expect(
				sale.connect(user2).buyPack(3, hexProofUser2, 3, { value: parseEther(3).sub(1) })
			).to.revertedWith("Invalid value");

			// Dutch auction case
			// auctionDecrement = (1e18 - 1e17) / 1e16 = 90
			// timeToDecrementPrice = (1672998451 - 1672912051) / 90 = 960 second
			// requiredPrice = 1e18 - 1e16 = 99e17

			const auctionDecrement = (maxPricePack.sub(minPricePack)).div(priceDecrementAmtPack);
			const timeToDecrementPrice = (project_singlePackAuction.saleEnd.sub(project_singlePackAuction.saleStart)).div(auctionDecrement);
			const requiredPrice = maxPricePack.sub(priceDecrementAmtPack);
			await skipTime(timeToDecrementPrice.toNumber());
			await expect(
				sale.connect(user2).buyPack(project_singlePackAuction.id, hexProofUser2, 6, { value: requiredPrice.mul(6).sub(1) })
			).to.revertedWith("Invalid value");
		})

		it("Should return success with fixed case", async () => {
			expect((await sale.currentSalesInPack(project_singlePackFixed_id)).length).to.equal(6);
			expect((await sale.currentSalesInPack(project_singlePackFixedBill_id)).length).to.equal(6);
			expect((await sale.currentSalesInPack(project_singlePackAuction.id)).length).to.equal(6);

			// Fixed price case
			await expect(() => sale.connect(buyer1).buyPack(project_singlePackFixed_id, hexProofBuyer1, 4, { value: parseEther(1).mul(4) }))
				.to.changeEtherBalances([admin, superAdmin, user1, buyer1, sale], [parseEther('0.8'), parseEther('0.4'), parseEther('2.8'), parseEther('4').mul(-1), 0])
			expect((await sale.currentSalesInPack(project_singlePackFixed_id)).length).to.equal(2);

			let currentProject = await project.getProject(project_singlePackFixed_id);
			expect(currentProject.sold).to.equal(4);

			const provider = ethers.provider;
			let projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
			expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(4);
			expect(await projectTokenContract.balanceOf(sale.address)).to.equal(2);

			let saleIds = await sale.currentSalesInPack(project_singlePackFixedBill_id);

			await expect(() => sale.connect(buyer2).buyPack(project_singlePackFixedBill_id, hexProofBuyer2, 6, { value: parseEther(1).mul(6) }))
				.to.changeEtherBalances([admin, superAdmin, buyer2, sale], [0, 0, parseEther('6').mul(-1), parseEther('6')]);

			currentProject = await project.getProject(project_singlePackFixedBill_id);
			expect(currentProject.sold).to.equal(6);
			projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
			expect(await projectTokenContract.balanceOf(sale.address)).to.equal(6);

			for(let i = 0; i < saleIds.length; i++ ) {
				const billInfoTokenId = await sale.getBill(saleIds[i], buyer2.address);
				expect(billInfoTokenId.saleId).to.equal(saleIds[i]);
				expect(billInfoTokenId.amount).to.equal(1);
				expect(billInfoTokenId.royaltyReceiver).to.equal(admin.address);
				expect(billInfoTokenId.royaltyFee).to.equal(parseEther('0.2'));
				expect(billInfoTokenId.superAdminFee).to.equal(parseEther('0.1'));
				expect(billInfoTokenId.sellerFee).to.equal(parseEther('0.7'));
				expect(billInfoTokenId.account).to.equal(buyer2.address);
				expect((await sale.getBuyersWaitingDistribution(saleIds[i])).length).to.equal(1);
				expect((await sale.getBuyersWaitingDistribution(saleIds[i]))[0]).to.equal(buyer2.address);

				const sellInfo = await sale.sales(billInfoTokenId.saleId);
				expect(sellInfo.amount).to.equal(0);
				expect(sellInfo.isSoldOut).to.be.true;
			}

			expect(await project.getTotalBuyersWaitingDistribution(project_singlePackFixedBill_id)).to.equal(6);

			expect((await sale.currentSalesInPack(project_singlePackFixed_id)).length).to.equal(2);
			expect((await sale.currentSalesInPack(project_singlePackFixedBill_id)).length).to.equal(0);

			// project_singlePackFixedAdmin_id
			saleIds = await sale.currentSalesInPack(project_singlePackFixedAdmin_id);
			
			// auction with instant payment
			await expect(() => sale.connect(buyer1).buyPack(project_singlePackFixedAdmin_id, hexProofBuyer1, 6, { value: parseEther('6') }))
				.to.changeEtherBalances([admin, superAdmin, user1, buyer1, sale], [parseEther('6'), 0, 0, parseEther('1').mul(-6), 0])
			expect((await sale.currentSalesInPack(project_singlePackFixedAdmin_id)).length).to.equal(0);
			currentProject = await project.getProject(project_singlePackFixedAdmin_id);
			expect(currentProject.sold).to.equal(6);
			expect(currentProject.status).to.equal(PROJECT_STATUS.ENDED);

			projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
			expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(6);
			expect(await projectTokenContract.balanceOf(sale.address)).to.equal(0);

			for(let i = 0; i < saleIds.length; i++ ) {
				const sellInfo = await sale.sales(saleIds[i]);
				expect(sellInfo.amount).to.equal(0);
				expect(sellInfo.isSoldOut).to.be.true;
				expect(sellInfo.isClose).to.be.true;

				expect(await projectTokenContract.ownerOf(sellInfo.tokenId)).to.equal(buyer1.address);
			}
		});

		it("Should return success with auction case", async () => {
			await setTime(saleStart);

			expect((await sale.currentSalesInPack(project_singlePackAuction_id)).length).to.equal(6);
			expect((await sale.currentSalesInPack(project_singlePackAuctionBill_id)).length).to.equal(6);
            expect((await sale.currentSalesInPack(project_singlePackAuctionAdmin_id)).length).to.equal(6);

			// Dutch auction case
			// auctionDecrement = (1e18 - 1e17) / 1e16 = 90
			// timeToDecrementPrice = (1672998451 - 1672912051) / 90 = 960 second
			// requiredPrice = 1e18 - 1e16 = 0.99 ETH

			const auctionDecrement = (maxPricePack.sub(minPricePack)).div(priceDecrementAmtPack);
			const timeToDecrementPrice = (project_singlePackAuction.saleEnd.sub(project_singlePackAuction.saleStart)).div(auctionDecrement);
			const requiredPrice = maxPricePack.sub(priceDecrementAmtPack);
			await skipTime(timeToDecrementPrice.toNumber());

			let saleIds = await sale.currentSalesInPack(project_singlePackAuction_id);
			
			// auction with instant payment
			await expect(() => sale.connect(buyer1).buyPack(project_singlePackAuction_id, hexProofBuyer1, 6, { value: requiredPrice.mul(6) }))
				.to.changeEtherBalances([admin, superAdmin, user1, buyer1, sale], [parseEther('5.346'), parseEther('0.594'), 0, requiredPrice.mul(-6), 0])
			expect((await sale.currentSalesInPack(project_singlePackAuction_id)).length).to.equal(0);
			let currentProject = await project.getProject(project_singlePackAuction_id);
			expect(currentProject.sold).to.equal(6);
			expect(currentProject.status).to.equal(PROJECT_STATUS.ENDED);

			const provider = ethers.provider;
			let projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
			expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(6);
			expect(await projectTokenContract.balanceOf(sale.address)).to.equal(0);

			for(let i = 0; i < saleIds.length; i++ ) {
				const sellInfo = await sale.sales(saleIds[i]);
				expect(sellInfo.amount).to.equal(0);
				expect(sellInfo.isSoldOut).to.be.true;
				expect(sellInfo.isClose).to.be.true;

				expect(await projectTokenContract.ownerOf(sellInfo.tokenId)).to.equal(buyer1.address);
			}

			// Auction with bill
			saleIds = await sale.currentSalesInPack(project_singlePackAuctionBill_id);

			await expect(() => sale.connect(buyer2).buyPack(project_singlePackAuctionBill_id, hexProofBuyer2, 6, { value: requiredPrice.mul(6) }))
				.to.changeEtherBalances([admin, superAdmin, user1, buyer2, sale], [0, 0, 0, requiredPrice.mul(-6), requiredPrice.mul(6)]);

			currentProject = await project.getProject(project_singlePackAuctionBill_id);
			expect(currentProject.sold).to.equal(6);

			projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
			expect(await projectTokenContract.balanceOf(buyer2.address)).to.equal(0);
			expect(await projectTokenContract.balanceOf(sale.address)).to.equal(6);

			for(let i = 0; i < saleIds.length; i++ ) {
				const billInfoTokenId = await sale.getBill(saleIds[i], buyer2.address);
				expect(billInfoTokenId.saleId).to.equal(saleIds[i]);
				expect(billInfoTokenId.amount).to.equal(1);
				expect(billInfoTokenId.royaltyReceiver).to.equal(admin.address);
				expect(billInfoTokenId.royaltyFee).to.equal(parseEther('0.198'));
				expect(billInfoTokenId.superAdminFee).to.equal(parseEther('0.099'));
				expect(billInfoTokenId.sellerFee).to.equal(parseEther('0.693'));
				expect(billInfoTokenId.account).to.equal(buyer2.address);
				expect((await sale.getBuyersWaitingDistribution(saleIds[i])).length).to.equal(1);
				expect((await sale.getBuyersWaitingDistribution(saleIds[i]))[0]).to.equal(buyer2.address);

				const sellInfo = await sale.sales(billInfoTokenId.saleId);
				expect(sellInfo.amount).to.equal(0);
				expect(sellInfo.isSoldOut).to.be.true;
			}

			expect(await project.getTotalBuyersWaitingDistribution(project_singlePackAuctionBill_id)).to.equal(6);

			expect((await sale.currentSalesInPack(project_singlePackAuction_id)).length).to.equal(0);
			expect((await sale.currentSalesInPack(project_singlePackAuctionBill_id)).length).to.equal(0);

			// pack project created by admin with auction and instant payment
			saleIds = await sale.currentSalesInPack(project_singlePackAuctionAdmin_id);
            await expect(() => sale.connect(buyer1).buyPack(project_singlePackAuctionAdmin_id, hexProofBuyer1, 6, { value: requiredPrice.mul(7) })).to.changeEtherBalances(
                [admin, superAdmin, buyer1, sale],
                [0, requiredPrice.mul(6), requiredPrice.mul(-6), 0]
            );
            expect((await sale.currentSalesInPack(project_singlePackAuctionAdmin_id)).length).to.equal(0);
            currentProject = await project.getProject(project_singlePackAuctionAdmin_id);
            expect(currentProject.sold).to.equal(6);
            expect(currentProject.status).to.equal(PROJECT_STATUS.ENDED);

            projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
            expect(await projectTokenContract.balanceOf(sale.address)).to.equal(0);
            expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(6);

            for (let i = 0; i < saleIds.length; i++) {
                const sellInfo = await sale.sales(saleIds[i]);
                expect(sellInfo.amount).to.equal(0);
                expect(sellInfo.isSoldOut).to.be.true;
                expect(sellInfo.isClose).to.be.true;

                expect(await projectTokenContract.ownerOf(sellInfo.tokenId)).to.equal(buyer1.address);
            }
		});
	})

	describe("close with token available", () => {
		let fixedPrices = parseEthers([1, 1, 1, 1]);
		let maxPrices = parseEthers([1, 1, 1, 1]);
		let minPrices = parseEthers(Array(4).fill(0.01));
		let priceDecrementAmts = parseEthers(Array(4).fill(0.01));
		let merkleTree;
		let hexProofUser1, hexProofUser2;
		let fixedPricePack = parseEther(1);
		let maxPricePack = parseEther(1);
		let minPricePack = parseEther(0.1);
		let priceDecrementAmtPack = parseEther(0.01);

		beforeEach(async () => {
			//add member
			await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

			await project.connect(user1).publish(
				[tokenSingleUser, "", "", contractUri, !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 4), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(1)).length).to.equal(4);

			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, !isFixed, isInstantPayment, admin.address, 1000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleAvailable(genNumbersASC(5, 8), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(2)).length).to.equal(4);

			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(9, 12), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(3)).length).to.equal(4);

			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, !isFixed, !isInstantPayment, admin.address, 1000, 1, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleAvailable(genNumbersASC(13, 16), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(4)).length).to.equal(4);
			project_singleAuctionAdmin_id = await project.lastId();

			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", contractUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 4), Array(4).fill(50), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(5)).length).to.equal(4);

			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", contractUri, !isPack, !isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenMultiAvailable(genNumbersASC(5, 8), Array(4).fill(50), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(6)).length).to.equal(4);

			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", contractUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 20, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiAvailable(genNumbersASC(9, 12), Array(4).fill(50), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(7)).length).to.equal(4);
			project_multiFixedAdmin_id = await project.lastId();

			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", contractUri, !isPack, !isSingle, !isFixed, !isInstantPayment, admin.address, 1000, 10, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenMultiAvailable(genNumbersASC(13, 16), Array(4).fill(50), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(8)).length).to.equal(4);
			project_multiAuctionAdmin_id = await project.lastId();

			expect(await sale.getSaleIdNotCloseByIndex(1, 1)).to.equal(2);
			expect(await sale.getTotalRoyalFee(0, genNumbersASC(1, 4), fixedPrices)).to.equal(0);
			expect(await sale.getTotalRoyalFee(1, genNumbersASC(1, 4), fixedPrices)).to.equal(parseEther(0.8));

			const royaltyInfo = await sale.getRoyaltyInfo(100, 2, parseEther(1));
			expect(royaltyInfo[0]).to.equal(ZERO_ADDRESS);
			expect(royaltyInfo[1]).to.equal(0);

			merkleTree = generateMerkleTree([user1.address, user2.address, user3.address, user4.address, buyer1.address, buyer2.address]);
			
			rootHash = merkleTree.getHexRoot();
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 32), Array(32).fill(rootHash));
			hexProofUser1 = hexProof(merkleTree, user1.address);
			hexProofUser2 = hexProof(merkleTree, user2.address);
			hexProofBuyer1 = hexProof(merkleTree, buyer1.address);
            hexProofBuyer2 = hexProof(merkleTree, buyer2.address);
		})

		it("Should return exception `Caller is not the manager`", async () => {
			await setTime(saleStart);
			await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
			await sale.connect(user2).buy(17, hexProofUser2, 10, { value: parseEther(1).mul(10) });

			await setTime(saleEnd);
			await expect(project.connect(admin).closeProject(1, [2, 3, 4], false)).to.revertedWith("Caller is not the manager");
			await expect(project.connect(user1).closeProject(5, [17, 18, 19, 20], false)).to.revertedWith("Caller is not the manager");
			await project.connect(user1).closeProject(1, [2, 3, 4], false);
			await project.connect(admin).closeProject(5, [17, 18, 19, 20], false);
		})

		it("Should return exception `Invalid softCap`", async () => {
			await setTime(saleStart);
			await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
			await sale.connect(user2).buy(17, hexProofUser2, 10, { value: parseEther(1).mul(10) });

			await setTime(saleEnd);
			await expect(project.connect(user1).closeProject(1, [2, 3, 4], true)).to.revertedWith("Invalid softCap");
			await expect(project.connect(admin).closeProject(5, [17, 18, 19, 20], true)).to.revertedWith("Invalid softCap");
			await project.connect(user1).closeProject(1, [2, 3, 4], false);
			await project.connect(admin).closeProject(5, [17, 18, 19, 20], false);
		})

		it("Should return exception `Caller is not the Project`", async () => {
			await setTime(saleStart);
			await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
			await sale.connect(user2).buy(17, hexProofUser2, 10, { value: parseEther(1).mul(10) });

			expect(await sale.project()).to.equal(project.address);

			const closeLimit = await project.closeLimit();
			const projectInfo1 = await project.getProject(1);
			const projectInfo5 = await project.getProject(5);
			const saleInfo2 = await sale.sales(2);
			const saleInfo17 = await sale.sales(17);

			await setTime(saleEnd);
			await expect(sale.connect(admin).close(closeLimit, projectInfo1, saleInfo2, 0, false)).to.revertedWith("Caller is not the Project");
			await expect(sale.connect(admin).close(closeLimit, projectInfo5, saleInfo17, 0, false)).to.revertedWith("Caller is not the Project");

			await sale.connect(superAdmin).setProjectAddress(admin.address);
			expect(await sale.project()).to.equal(admin.address);

			sale.connect(admin).close(closeLimit, projectInfo1, saleInfo2, 0, false)
			sale.connect(admin).close(closeLimit, projectInfo5, saleInfo17, 0, false)
		})

		it("Check Dutch auction", async () => {
			const projectInfo2 = await project.getProject(8);
			const saleIdsOfProject2 = await sale.getSaleIdsOfProject(projectInfo2.id);
			const saleInfo = await sale.sales(saleIdsOfProject2[0]);
			const saleStartTime = projectInfo2.saleStart;
			const saleEndTime = projectInfo2.saleEnd;
			const saleMaxPrice = saleInfo.dutchMaxPrice;
			const saleMinPrice = saleInfo.dutchMinPrice;
			const priceDecrementAmt = saleInfo.priceDecrementAmt;
			const decrement = saleMaxPrice.sub(saleMinPrice).div(priceDecrementAmt);
			const timeToDecrementPrice = saleEndTime.sub(saleStartTime).div(decrement);

			const dutchParam = [projectInfo2.saleStart, projectInfo2.saleEnd, saleInfo.dutchMaxPrice, saleInfo.dutchMinPrice, saleInfo.priceDecrementAmt];
			expect(await sale.getCurrentDutchPrice(...dutchParam)).to.equal(saleMaxPrice);
			await setTime(saleStart);
			expect(await sale.getCurrentDutchPrice(...dutchParam)).to.equal(saleMaxPrice);

			for (let j = 0; j < decrement; j++) {
				await skipTime(Number(timeToDecrementPrice));
			    const currentTime = BigNumber.from(await blockTimestamp());
				const numDecrements = currentTime.sub(saleStartTime).div(timeToDecrementPrice);
				const currentDutchPrice = await sale.getCurrentDutchPrice(...dutchParam);
				const decrementAmt = priceDecrementAmt.mul(numDecrements);
				expect(currentDutchPrice).to.equal(saleMaxPrice.sub(decrementAmt));
				if (j == 0) {
					await sale.connect(user1).buy(saleInfo.id, hexProofUser1, 1, { value: saleMaxPrice });
				} else if (j < 4) {
					await sale.connect(user1).buy(saleInfo.id, hexProofUser1, 1, { value: saleMaxPrice.sub(decrementAmt) });
				}
			}
		})

		it("Should return success", async () => {
			await setTime(saleStart);
			await buys([1, 2, 3], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([5, 6, 7], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([9, 10, 11], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([13, 14, 15], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([17, 18, 19], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			await buys([21, 22, 23], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			await buys([25, 26, 27], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			await buys([29, 30, 31], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			
			await setTime(saleEnd);
			await project.connect(user1).closeProject(1, [4], false);
			await project.connect(admin).closeProject(2, [8], false);
			await project.connect(admin).closeProject(3, [9, 10, 11, 12], true);
			await project.connect(admin).closeProject(4, [13, 14, 15, 16], false);
			await project.connect(admin).closeProject(5, [17, 18, 19, 20], false);
			await project.connect(admin).closeProject(6, [21, 22, 23, 24], false);
			await project.connect(admin).closeProject(7, [25, 26, 27, 28], true);
			await project.connect(admin).closeProject(8, [29, 30, 31, 32], false);
		})

		it("Should distribute NFTs of single auction project created by admin success", async () => {
			await setTime(saleStart);

			// Dutch auction case
			// auctionDecrement = (1e18 - 1e17) / 1e16 = 90
			// timeToDecrementPrice = (1672998451 - 1672912051) / 90 = 960 second
			// requiredPrice = 1e18 - 1e16 = 0.99 ETH
			const project_singleAuctionAdmin = await project.getProject(project_singleAuctionAdmin_id)

			const auctionDecrement = (maxPricePack.sub(minPricePack)).div(priceDecrementAmtPack);
			const timeToDecrementPrice = (project_singleAuctionAdmin.saleEnd.sub(project_singleAuctionAdmin.saleStart)).div(auctionDecrement);
			const requiredPrice = maxPricePack.sub(priceDecrementAmtPack);
			await skipTime(timeToDecrementPrice.toNumber());

			// Project Single and dutch auction, bill payment and created by admin
			// [13, 14, 15, 16]
			saleIds = await sale.getSaleIdsOfProject(project_singleAuctionAdmin_id);
			for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

            // Buyer 1 buy saleIds 13, 14, 15
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 1, {
                    value: requiredPrice,
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-1), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer1).buy(saleIds[1], hexProofBuyer1, 1, {
                    value: requiredPrice,
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-1), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer1).buy(saleIds[2], hexProofBuyer1, 1, {
                    value: requiredPrice,
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-1), 0, 0, 0]);

			// Buyer 2 buy saleId 16
			await expect(() =>
                sale.connect(buyer2).buy(saleIds[3], hexProofBuyer2, 1, {
                    value: requiredPrice,
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [requiredPrice.mul(-1), 0, 0, 0]);
			
			currentProject = await project.getProject(project_singleAuctionAdmin_id);
			expect(currentProject.sold).to.equal(4);
			expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
			expect(await project.getTotalBuyersWaitingDistribution(project_singleAuctionAdmin_id)).to.equal(4);

			for (let i = 0; i < saleIds.length - 1; i++) {
                const billInfoTokenId = await sale.getBill(saleIds[i], buyer1.address);
				expect(billInfoTokenId.saleId).to.equal(saleIds[i]);
				expect(billInfoTokenId.amount).to.equal(1);
				expect(billInfoTokenId.royaltyReceiver).to.equal(author1.address);
				expect(billInfoTokenId.royaltyFee).to.equal(parseEther("0.198"));
				expect(billInfoTokenId.superAdminFee).to.equal(parseEther("0.792"));
				expect(billInfoTokenId.sellerFee).to.equal(0);
				expect(billInfoTokenId.account).to.equal(buyer1.address);
				expect((await sale.getBuyersWaitingDistribution(saleIds[i])).length).to.equal(1);
				expect((await sale.getBuyersWaitingDistribution(saleIds[i]))[0]).to.equal(buyer1.address);

				const sellInfo = await sale.sales(billInfoTokenId.saleId);
				expect(sellInfo.amount).to.equal(0);
				expect(sellInfo.isSoldOut).to.be.true;
            }

			await skipTime(saleEnd);

			await expect(() => project.connect(admin).closeProject(project_singleAuctionAdmin_id, saleIds.slice(0, 3), true))
				.to.changeEtherBalances([buyer1, buyer2, superAdmin, author1, admin], [requiredPrice.mul(3), 0, 0, 0, 0]);

			expect(await project.getTotalBuyersWaitingDistribution(project_singleAuctionAdmin_id)).to.equal(1);

			const provider = ethers.provider;
			let projectTokenContract = new ethers.Contract(currentProject.token, OSB721JSON.abi, provider);
			for (let i = 0; i < saleIds.length - 1; i++) {
				const sellInfo = await sale.sales(saleIds[i]);
				expect(sellInfo.isClose).to.be.true;

				expect((await sale.getBuyersWaitingDistribution(saleIds[i])).length).to.equal(0);
				expect(await projectTokenContract.ownerOf(sellInfo.tokenId)).to.equal(buyer1.address);
            }

			expect(await projectTokenContract.balanceOf(buyer1.address)).to.equal(3);
			expect((await sale.getBuyersWaitingDistribution(saleIds[3])).length).to.equal(1);

			await expect(() => project.connect(admin).closeProject(project_singleAuctionAdmin_id, saleIds.slice(3), false))
				.to.changeEtherBalances([buyer1, buyer2, superAdmin, author1, admin], [0, 0, parseEther('0.792'), parseEther('0.198'), 0]);
			
			const sellInfo = await sale.sales(saleIds[3]);
			expect(sellInfo.isClose).to.be.true;
			expect((await sale.getBuyersWaitingDistribution(saleIds[3])).length).to.equal(0);
			expect(await projectTokenContract.ownerOf(sellInfo.tokenId)).to.equal(buyer2.address);

			expect(await projectTokenContract.balanceOf(buyer2.address)).to.equal(1);
			expect(await project.getTotalBuyersWaitingDistribution(project_singleAuctionAdmin_id)).to.equal(0);

			currentProject = await project.getProject(project_singleAuctionAdmin_id);
			expect(currentProject.status).to.equal(PROJECT_STATUS.ENDED);
		});

		it("Should close success with case multiple fixed price and created by admin", async () => {
			// Project with multiple and fixed price, created by admin
			await setTime(saleStart);

			saleIds = await sale.getSaleIdsOfProject(project_multiFixedAdmin_id);
			for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

			await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 10, {
                    value: parseEther('10'),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [parseEther('1').mul(-10), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer1).buy(saleIds[1], hexProofBuyer1, 5, {
                    value: parseEther('5'),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [parseEther('1').mul(-5), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer2).buy(saleIds[0], hexProofBuyer2, 40, {
                    value: parseEther('40'),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [parseEther('1').mul(-40), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer2).buy(saleIds[2], hexProofBuyer2, 10, {
                    value: parseEther('10'),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [parseEther('1').mul(-10), 0, 0, 0]);

			currentProject = await project.getProject(project_multiFixedAdmin_id);
			expect(currentProject.sold).to.equal(65);
			expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
			expect(await project.getTotalBuyersWaitingDistribution(project_multiFixedAdmin_id)).to.equal(4);

			let billInfo = await sale.getBill(saleIds[0], buyer1.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(10);
            expect(billInfo.royaltyReceiver).to.equal(author1.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("2"));
            expect(billInfo.superAdminFee).to.equal(parseEther("8"));
            expect(billInfo.sellerFee).to.equal(0);
            expect(billInfo.account).to.equal(buyer1.address);

			billInfo = await sale.getBill(saleIds[0], buyer2.address);
            expect(billInfo.saleId).to.equal(saleIds[0]);
            expect(billInfo.amount).to.equal(40);
            expect(billInfo.royaltyReceiver).to.equal(author1.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("8"));
            expect(billInfo.superAdminFee).to.equal(parseEther("32"));
            expect(billInfo.sellerFee).to.equal(0);
            expect(billInfo.account).to.equal(buyer2.address);

			expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(2);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[0]).to.equal(buyer1.address);
            expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[1]).to.equal(buyer2.address);

            let sellInfo = await sale.sales(billInfo.saleId);
            expect(sellInfo.amount).to.equal(0);
            expect(sellInfo.isSoldOut).to.be.true;

			billInfo = await sale.getBill(saleIds[1], buyer1.address);
            expect(billInfo.saleId).to.equal(saleIds[1]);
            expect(billInfo.amount).to.equal(5);
            expect(billInfo.royaltyReceiver).to.equal(author1.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("1"));
            expect(billInfo.superAdminFee).to.equal(parseEther("4"));
            expect(billInfo.sellerFee).to.equal(0);
            expect(billInfo.account).to.equal(buyer1.address);

			expect((await sale.getBuyersWaitingDistribution(saleIds[1])).length).to.equal(1);
            expect((await sale.getBuyersWaitingDistribution(saleIds[1]))[0]).to.equal(buyer1.address);

            sellInfo = await sale.sales(billInfo.saleId);
            expect(sellInfo.amount).to.equal(45);
            expect(sellInfo.isSoldOut).to.be.false;

			billInfo = await sale.getBill(saleIds[2], buyer2.address);
            expect(billInfo.saleId).to.equal(saleIds[2]);
            expect(billInfo.amount).to.equal(10);
            expect(billInfo.royaltyReceiver).to.equal(author1.address);
            expect(billInfo.royaltyFee).to.equal(parseEther("2"));
            expect(billInfo.superAdminFee).to.equal(parseEther("8"));
            expect(billInfo.sellerFee).to.equal(0);
            expect(billInfo.account).to.equal(buyer2.address);

			expect((await sale.getBuyersWaitingDistribution(saleIds[2])).length).to.equal(1);
            expect((await sale.getBuyersWaitingDistribution(saleIds[2]))[0]).to.equal(buyer2.address);

            sellInfo = await sale.sales(billInfo.saleId);
            expect(sellInfo.amount).to.equal(40);
            expect(sellInfo.isSoldOut).to.be.false;

			await skipTime(saleEnd);
			expect(await project.getTotalBuyersWaitingDistribution(project_multiFixedAdmin_id)).to.equal(4);
			await expect(() => project.connect(admin).closeProject(project_multiFixedAdmin_id, [saleIds[1]], true))
				.to.changeEtherBalances([buyer1, buyer2, superAdmin, author1, admin], [parseEther('5'), 0, 0, 0, 0]);
			
			expect(await project.getTotalBuyersWaitingDistribution(project_multiFixedAdmin_id)).to.equal(3);

			const provider = ethers.provider;
			let projectTokenContract = new ethers.Contract(currentProject.token, OSB1155JSON.abi, provider);			
			sellInfo = await sale.sales(saleIds[1]);
			expect(sellInfo.isClose).to.be.true;

			expect((await sale.getBuyersWaitingDistribution(saleIds[1])).length).to.equal(0);
			expect(await projectTokenContract.balanceOf(buyer1.address, sellInfo.tokenId)).to.equal(5);
			expect(await projectTokenContract.balanceOf(admin.address, sellInfo.tokenId)).to.equal(195);

			await expect(() => project.connect(admin).closeProject(project_multiFixedAdmin_id, [saleIds[0], saleIds[2]], false))
				.to.changeEtherBalances([buyer1, buyer2, superAdmin, author1, admin], [0, 0, parseEther('48'), parseEther('12'), 0]);
			
			expect(await project.getTotalBuyersWaitingDistribution(project_multiFixedAdmin_id)).to.equal(0);
			sellInfo = await sale.sales(saleIds[0]);
			expect(sellInfo.isClose).to.be.true;

			expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(0);
			expect(await projectTokenContract.balanceOf(buyer1.address, sellInfo.tokenId)).to.equal(10);
			expect(await projectTokenContract.balanceOf(buyer2.address, sellInfo.tokenId)).to.equal(40);

			sellInfo = await sale.sales(saleIds[2]);
			expect(sellInfo.isClose).to.be.true;

			expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(0);
			expect(await projectTokenContract.balanceOf(buyer1.address, sellInfo.tokenId)).to.equal(0);
			expect(await projectTokenContract.balanceOf(buyer2.address, sellInfo.tokenId)).to.equal(10);
		})

		it("Should close success with case multiple dutch auction price and created by admin", async () => {
			await setTime(saleStart);

            // Dutch auction case
            // auctionDecrement = (1e18 - 1e17) / 1e16 = 90
            // timeToDecrementPrice = (1672998451 - 1672912051) / 90 = 960 second
            // requiredPrice = 1e18 - 1e16 = 0.99 ETH
            const project_multiAuctionAdmin = await project.getProject(project_multiAuctionAdmin_id);

            const auctionDecrement = maxPricePack.sub(minPricePack).div(priceDecrementAmtPack);
            const timeToDecrementPrice = project_multiAuctionAdmin.saleEnd.sub(project_multiAuctionAdmin.saleStart).div(auctionDecrement);
            let requiredPrice = maxPricePack.sub(priceDecrementAmtPack);
            await skipTime(timeToDecrementPrice.toNumber());

            // [29, 30, 31, 32]
            saleIds = await sale.getSaleIdsOfProject(project_multiAuctionAdmin_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

			// price: 0.99 ETH
            await expect(() =>
                sale.connect(buyer1).buy(saleIds[0], hexProofBuyer1, 50, {
                    value: parseEther("50"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-50), 0, 0, 0]);

            await expect(() =>
                sale.connect(buyer1).buy(saleIds[1], hexProofBuyer1, 20, {
                    value: requiredPrice.mul(20),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-20), 0, 0, 0]);

            // skipTime
            await skipTime(timeToDecrementPrice.toNumber());
            requiredPrice = requiredPrice.sub(priceDecrementAmtPack);

			// price: 0.98 ETH
            await expect(() =>
                sale.connect(buyer2).buy(saleIds[1], hexProofBuyer2, 30, {
                    value: requiredPrice.mul(30),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [requiredPrice.mul(-30), 0, 0, 0]);

            // skipTime
            await skipTime(timeToDecrementPrice.mul(2).toNumber());
            requiredPrice = requiredPrice.sub(priceDecrementAmtPack).sub(priceDecrementAmtPack);
			
			// price: 0.96 ETH
			await expect(() =>
                sale.connect(buyer2).buy(saleIds[2], hexProofBuyer2, 50, {
                    value: requiredPrice.mul(50),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [requiredPrice.mul(-50), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer1).buy(saleIds[3], hexProofBuyer1, 4, {
                    value: requiredPrice.mul(4),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-4), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer2).buy(saleIds[3], hexProofBuyer2, 4, {
                    value: requiredPrice.mul(4),
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [requiredPrice.mul(-4), 0, 0, 0]);

			currentProject = await project.getProject(project_multiAuctionAdmin_id);
			expect(currentProject.sold).to.equal(158);
			expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
			expect(await project.getTotalBuyersWaitingDistribution(project_multiAuctionAdmin_id)).to.equal(6);
			expect((await sale.getBuyersWaitingDistribution(saleIds[0])).length).to.equal(1);
			expect((await sale.getBuyersWaitingDistribution(saleIds[0]))[0]).to.equal(buyer1.address);

			expect((await sale.getBuyersWaitingDistribution(saleIds[1])).length).to.equal(2);
			expect((await sale.getBuyersWaitingDistribution(saleIds[1]))[0]).to.equal(buyer1.address);
			expect((await sale.getBuyersWaitingDistribution(saleIds[1]))[1]).to.equal(buyer2.address);
			
			expect((await sale.getBuyersWaitingDistribution(saleIds[2])).length).to.equal(1);
			expect((await sale.getBuyersWaitingDistribution(saleIds[2]))[0]).to.equal(buyer2.address);

			expect((await sale.getBuyersWaitingDistribution(saleIds[3])).length).to.equal(2);
			expect((await sale.getBuyersWaitingDistribution(saleIds[3]))[0]).to.equal(buyer1.address);
			expect((await sale.getBuyersWaitingDistribution(saleIds[3]))[1]).to.equal(buyer2.address);
			await skipTime(saleEnd);
			
			await expect(() => project.connect(admin).closeProject(project_multiAuctionAdmin_id, saleIds.slice(0, 3), false))
				.to.changeEtherBalances([buyer1, buyer2, superAdmin, author1, admin], [0, 0, parseEther('117.36'), parseEther('29.34'), 0]);

            let sellInfo = await sale.sales(saleIds[0]);
            expect(sellInfo.amount).to.equal(0);
            expect(sellInfo.isSoldOut).to.be.true;
            expect(sellInfo.isClose).to.be.true;

			sellInfo = await sale.sales(saleIds[1]);
            expect(sellInfo.amount).to.equal(0);
            expect(sellInfo.isSoldOut).to.be.true;
            expect(sellInfo.isClose).to.be.true;

			sellInfo = await sale.sales(saleIds[2]);
            expect(sellInfo.amount).to.equal(0);
            expect(sellInfo.isSoldOut).to.be.true;
            expect(sellInfo.isClose).to.be.true;

			sellInfo = await sale.sales(saleIds[3]);
            expect(sellInfo.amount).to.equal(42);
            expect(sellInfo.isSoldOut).to.be.false;
            expect(sellInfo.isClose).to.be.false;

			await expect(() => project.connect(admin).closeProject(project_multiAuctionAdmin_id, [saleIds[3]], true))
				.to.changeEtherBalances([buyer1, buyer2, superAdmin, author1, admin], [requiredPrice.mul(4), requiredPrice.mul(4), 0, 0, 0]);

		})
	})

	describe("close with token not available", () => {
		let fixedPrices = parseEthers([1, 1, 1, 1]);
		let maxPrices = parseEthers([1, 1, 1, 1]);
		let minPrices = parseEthers(Array(4).fill(0.01));
		let priceDecrementAmts = parseEthers(Array(4).fill(0.01));
		let merkleTree;
		let hexProofUser1, hexProofUser2;
		let fixedPricePack = parseEther(1);
		let maxPricePack = parseEther(1);
		let minPricePack = parseEther(0.1);
		let priceDecrementAmtPack = parseEther(0.01);

		beforeEach(async () => {
			//add member
			await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenSingle1", "SIN", contractUri, !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(4, Array(4).fill("ipfs://pic.json"), Array(4).fill(admin.address), Array(4).fill(0), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(1)).length).to.equal(4);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenSingle2", "SIN", contractUri, !isPack, isSingle, !isFixed, isInstantPayment, admin.address, 1000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleRoyalty(4, Array(4).fill("ipfs://pic.json"), Array(4).fill(admin.address), Array(4).fill(1000), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(2)).length).to.equal(4);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenSingle3", "SIN", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(4, Array(4).fill("ipfs://pic.json"), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(3)).length).to.equal(4);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenSingle4", "SIN", contractUri, !isPack, isSingle, !isFixed, !isInstantPayment, admin.address, 1000, 1, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleRoyalty(4, Array(4).fill("ipfs://pic.json"), Array(4).fill(admin.address), Array(4).fill(1000), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(4)).length).to.equal(4);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenMulti1", "MUL", contractUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiNotAvailable(Array(4).fill(50), Array(4).fill("ipfs://pic.json"), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(5)).length).to.equal(4);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenMulti2", "MUL", contractUri, !isPack, !isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenMultiNotAvailable(Array(4).fill(50), Array(4).fill("ipfs://pic.json"), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(6)).length).to.equal(4);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenMulti3", "MUL", contractUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiNotAvailable(Array(4).fill(50), Array(4).fill("ipfs://pic.json"), fixedPrices),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(7)).length).to.equal(4);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "TokenMulti4", "MUL", contractUri, !isPack, !isSingle, !isFixed, !isInstantPayment, admin.address, 1000, 1, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenMultiRoyalty(Array(4).fill(50), Array(4).fill("ipfs://pic.json"), Array(4).fill(admin.address), Array(4).fill(1000), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect((await sale.getSalesProject(8)).length).to.equal(4);

			expect(await sale.getSaleIdNotCloseByIndex(1, 1)).to.equal(2);

			// pack project with fixed price and bill payment
			await project.connect(user1).publish(
				[ZERO_ADDRESS, "Single", "SIN", contractUri, isPack, isSingle, isFixed, !isInstantPayment, admin.address, 5000, 4, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(2000), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackFixed_id = await project.lastId();
			
			// pack project with auction price and bill payment
			await project.connect(user1).publish(
				[ZERO_ADDRESS, "Single Pack Auction", "SIN_PACK_AUCTION", contractUri, isPack, isSingle, !isFixed, !isInstantPayment, admin.address, 5000, 4, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(admin.address), Array(6).fill(2000), Array(6).fill(0)),
				{ value: createProjectFee }
			);
			project_singlePackAuctionBill_id = await project.lastId();

			const royaltyInfo = await sale.getRoyaltyInfo(100, 2, parseEther(1));
			expect(royaltyInfo[0]).to.equal(ZERO_ADDRESS);
			expect(royaltyInfo[1]).to.equal(0);

			merkleTree = generateMerkleTree([user1.address, user2.address, user3.address, user4.address, buyer1.address, buyer2.address]);
			
			rootHash = merkleTree.getHexRoot();
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 32), Array(32).fill(rootHash));
			hexProofUser1 = hexProof(merkleTree, user1.address);
			hexProofUser2 = hexProof(merkleTree, user2.address);
			hexProofBuyer1 = hexProof(merkleTree, buyer1.address);
            hexProofBuyer2 = hexProof(merkleTree, buyer2.address);

			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackFixed_id, rootHash);
			await project.connect(opFundReceiver).setMerkleRoot(project_singlePackAuctionBill_id, rootHash);
		})

		it("Should return exception `Caller is not the manager`", async () => {
			await setTime(saleStart);
			await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
			await sale.connect(user2).buy(17, hexProofUser2, 10, { value: parseEther(1).mul(10) });

			await setTime(saleEnd);
			await expect(project.connect(user1).closeProject(1, [2, 3, 4], false)).to.revertedWith("Caller is not the manager");
			await expect(project.connect(user1).closeProject(5, [17, 18, 19, 20], false)).to.revertedWith("Caller is not the manager");
			await project.connect(admin).closeProject(1, [2, 3, 4], false);
			await project.connect(admin).closeProject(5, [17, 18, 19, 20], false);
		})

		it("Should return exception `Invalid softCap`", async () => {
			await setTime(saleStart);
			await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
			await sale.connect(user2).buy(17, hexProofUser2, 10, { value: parseEther(1).mul(10) });

			await setTime(saleEnd);
			await expect(project.connect(admin).closeProject(1, [2, 3, 4], true)).to.revertedWith("Invalid softCap");
			await expect(project.connect(admin).closeProject(5, [17, 18, 19, 20], true)).to.revertedWith("Invalid softCap");
			await project.connect(admin).closeProject(1, [2, 3, 4], false);
			await project.connect(admin).closeProject(5, [17, 18, 19, 20], false);
		})

		it("Should return exception `Caller is not the Project`", async () => {
			await setTime(saleStart);
			await sale.connect(user1).buy(1, hexProofUser1, 1, { value: parseEther(1) });
			await sale.connect(user2).buy(17, hexProofUser2, 10, { value: parseEther(1).mul(10) });

			expect(await sale.project()).to.equal(project.address);

			const closeLimit = await project.closeLimit();
			const projectInfo1 = await project.getProject(1);
			const projectInfo5 = await project.getProject(5);
			const saleInfo2 = await sale.sales(2);
			const saleInfo17 = await sale.sales(17);

			await setTime(saleEnd);
			await expect(sale.connect(admin).close(closeLimit, projectInfo1, saleInfo2, 0, false)).to.revertedWith("Caller is not the Project");
			await expect(sale.connect(admin).close(closeLimit, projectInfo5, saleInfo17, 0, false)).to.revertedWith("Caller is not the Project");

			await sale.connect(superAdmin).setProjectAddress(admin.address);
			expect(await sale.project()).to.equal(admin.address);

			sale.connect(admin).close(closeLimit, projectInfo1, saleInfo2, 0, false)
			sale.connect(admin).close(closeLimit, projectInfo5, saleInfo17, 0, false)
		})

		it("Should return exception `Invalid sale id`", async () => {
			await setTime(saleStart);
			saleIds = await sale.getSaleIdsOfProject(project_singlePackFixed_id);

            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }
            await skipTime(saleEnd);
			await expect(project.connect(user1).closeProject(project_singlePackFixed_id, [32], false)).to.revertedWith("Invalid sale id");
		});

		it("Should return exception `Invalid project`", async () => {
			await setTime(saleStart);
			saleIds = await sale.getSaleIdsOfProject(project_singlePackFixed_id);

            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }
			await expect(project.connect(user1).closeProject(project_singlePackFixed_id, saleIds, false)).to.revertedWith("Invalid project");

            await skipTime(saleEnd);
			await project.connect(user1).closeProject(project_singlePackFixed_id, saleIds, false);
			await expect(project.connect(user1).closeProject(project_singlePackFixed_id, saleIds, false)).to.revertedWith("Invalid project");

		})

		it("Check Dutch auction", async () => {
			const projectInfo2 = await project.getProject(2);
			const saleIdsOfProject2 = await sale.getSaleIdsOfProject(projectInfo2.id);
			const saleInfo = await sale.sales(saleIdsOfProject2[0]);
			const saleStartTime = projectInfo2.saleStart;
			const saleEndTime = projectInfo2.saleEnd;
			const saleMaxPrice = saleInfo.dutchMaxPrice;
			const saleMinPrice = saleInfo.dutchMinPrice;
			const priceDecrementAmt = saleInfo.priceDecrementAmt;
			const decrement = saleMaxPrice.sub(saleMinPrice).div(priceDecrementAmt);
			const timeToDecrementPrice = saleEndTime.sub(saleStartTime).div(decrement);

			const dutchParam = [projectInfo2.saleStart, projectInfo2.saleEnd, saleInfo.dutchMaxPrice, saleInfo.dutchMinPrice, saleInfo.priceDecrementAmt];
			expect(await sale.getCurrentDutchPrice(...dutchParam)).to.equal(saleMaxPrice);
			await setTime(saleStart);
			expect(await sale.getCurrentDutchPrice(...dutchParam)).to.equal(saleMaxPrice);

			for (let j = 0; j < decrement; j++) {
				await skipTime(Number(timeToDecrementPrice));
			    const currentTime = BigNumber.from(await blockTimestamp());
				const numDecrements = currentTime.sub(saleStartTime).div(timeToDecrementPrice);
				const currentDutchPrice = await sale.getCurrentDutchPrice(...dutchParam);
				const decrementAmt = priceDecrementAmt.mul(numDecrements);
				expect(currentDutchPrice).to.equal(saleMaxPrice.sub(decrementAmt));
			}
		})

		it("Should return success", async () => {
			await setTime(saleStart);
			await buys([1, 2, 3], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([5, 6, 7], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([9, 10, 11], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([13, 14, 15], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1)), Array(3).fill(1));
			await buys([17, 18, 19], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			await buys([21, 22, 23], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			await buys([25, 26, 27], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			await buys([29, 30, 31], [user1, user2, user3], Array(3).fill(merkleTree), Array(3).fill(parseEther(1).mul(10)), Array(3).fill(10));
			
			await setTime(saleEnd);
			await project.connect(admin).closeProject(1, [4], false);
			await project.connect(admin).closeProject(2, [8], false);
			await project.connect(admin).closeProject(3, [9, 10, 11, 12], true);
			await project.connect(admin).closeProject(4, [13, 14, 15, 16], false);
			await project.connect(admin).closeProject(5, [17, 18, 19, 20], false);
			await project.connect(admin).closeProject(6, [21, 22, 23, 24], false);
			await project.connect(admin).closeProject(7, [25, 26, 27, 28], true);
			await project.connect(admin).closeProject(8, [29, 30, 31, 32], false);
		})
		

		it("should close success with pack project and fixed price", async () => {
			await setTime(saleStart);

			await project.connect(admin).setCloseLimit(3);
            // [33, 34, 35, 36, 37]
            saleIds = await sale.getSaleIdsOfProject(project_singlePackFixed_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

            for (let i = 0; i < saleIds.length; i++) {
                const buyer = i % 2 == 0 ? buyer1 : buyer2;
                const hexProofBuyer = i % 2 == 0 ? hexProofBuyer1 : hexProofBuyer2;
                await expect(() =>
                    sale.connect(buyer).buyPack(project_singlePackFixed_id, hexProofBuyer, 1, {
                        value: parseEther("1"),
                    })
                ).to.changeEtherBalances([buyer, admin, superAdmin, author1], [parseEther("1").mul(-1), 0, 0, 0]);
            }

            currentProject = await project.getProject(project_singlePackFixed_id);
            expect(currentProject.sold).to.equal(6);
            expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
            expect(await project.getTotalBuyersWaitingDistribution(project_singlePackFixed_id)).to.equal(6);
            for (let i = 0; i < saleIds.length; i++) {
                expect((await sale.getBuyersWaitingDistribution(saleIds[i])).length).to.equal(1);
            }

            await skipTime(saleEnd);

            await expect(() => project.connect(user1).closeProject(project_singlePackFixed_id, saleIds, false)).to.changeEtherBalances(
                [buyer1, buyer2, superAdmin, admin, user1],
                [0, 0, parseEther("0.3"), parseEther("0.6"), parseEther("2.1")]
            );

			await expect(() => project.connect(user1).closeProject(project_singlePackFixed_id, saleIds.slice(-3), false)).to.changeEtherBalances(
                [buyer1, buyer2, superAdmin, admin, user1],
                [0, 0, parseEther("0.3"), parseEther("0.6"), parseEther("2.1")]
            );

            for (let i = 0; i < saleIds.length; i++) {
                let sellInfo = await sale.sales(saleIds[i]);
                expect(sellInfo.amount).to.equal(0);
                expect(sellInfo.isSoldOut).to.be.true;
                expect(sellInfo.isClose).to.be.true;
            }
		})

		it("should close success with pack project and dutch auction price", async () => {
			await setTime(saleStart);

			// Dutch auction case
            // auctionDecrement = (1e18 - 1e17) / 1e16 = 90
            // timeToDecrementPrice = (1672998451 - 1672912051) / 90 = 960 second
            // requiredPrice = 1e18 - 1e16 * 5 = 0.95 ETH
            const project_singlePackAuction = await project.getProject(project_singlePackAuctionBill_id);

            const auctionDecrement = maxPricePack.sub(minPricePack).div(priceDecrementAmtPack);
            const timeToDecrementPrice = project_singlePackAuction.saleEnd.sub(project_singlePackAuction.saleStart).div(auctionDecrement);
            let requiredPrice = maxPricePack.sub(priceDecrementAmtPack.mul(5));
            await skipTime(timeToDecrementPrice.mul(5).toNumber());

			// [39, 40, 41, 42, 43, 44]
			saleIds = await sale.getSaleIdsOfProject(project_singlePackAuctionBill_id);
            for (let i = 0; i < saleIds.length; i++) {
                await sale.connect(opFundReceiver).setMerkleRoot(saleIds[i], rootHash);
            }

			await expect(() =>
                sale.connect(buyer1).buyPack(project_singlePackAuctionBill_id, hexProofBuyer1, 1, {
                    value: parseEther("1"),
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-1), 0, 0, 0]);

			// price: 0.9 ETH
            await skipTime(timeToDecrementPrice.mul(5).toNumber());
			requiredPrice = requiredPrice.sub(priceDecrementAmtPack.mul(5));

			await expect(() =>
                sale.connect(buyer2).buyPack(project_singlePackAuctionBill_id, hexProofBuyer2, 1, {
                    value: requiredPrice,
                })
            ).to.changeEtherBalances([buyer2, admin, superAdmin, author1], [requiredPrice.mul(-1), 0, 0, 0]);

			await expect(() =>
                sale.connect(buyer1).buyPack(project_singlePackAuctionBill_id, hexProofBuyer1, 1, {
                    value: requiredPrice,
                })
            ).to.changeEtherBalances([buyer1, admin, superAdmin, author1], [requiredPrice.mul(-1), 0, 0, 0]);

			currentProject = await project.getProject(project_singlePackAuctionBill_id);
            expect(currentProject.sold).to.equal(3);
            expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
            expect(await project.getTotalBuyersWaitingDistribution(project_singlePackAuctionBill_id)).to.equal(3);

			await skipTime(saleEnd);

            await expect(() => project.connect(user1).closeProject(project_singlePackAuctionBill_id, saleIds, false)).to.changeEtherBalances(
                [buyer1, buyer2, superAdmin, admin, user1],
                [parseEther('1.85'), parseEther("0.9"), 0, 0, 0]
            );
		})
	})

	describe("profit share", () => {
		const maxPrices = Array(6).fill(parseEther(1));
		const minPrices = Array(6).fill(parseEther(0.01));
		const priceDecrementAmts = Array(6).fill(parseEther(0.01));
		let fixedPrices = parseEthers(genNumbersASC(1, 6));
		let merkleTree;
		let fixedPricePack = 0;
		let maxPricePack = 0;
		let minPricePack = 0;
		let priceDecrementAmtPack = 0;

		beforeEach(async () => {
			merkleTree = generateMerkleTree([user1.address, user2.address, user3.address]);
			hexRoot = merkleTree.getHexRoot();
		})

		it("1.Project admin off soft cap & InstantPayment: single token with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "Token Single", "SIN", contractUri, !isPack, isSingle, isFixed, isInstantPayment, author1.address, 2000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(author1.address), Array(6).fill(2000), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "Token Single", "SIN", contractUri, !isPack, isSingle, !isFixed, isInstantPayment, author1.address, 2000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(author1.address), Array(6).fill(2000), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);

			fixedPricePack = parseEther(1);
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "Token Single", "SIN", contractUri, isPack, isSingle, isFixed, isInstantPayment, author1.address, 2000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(author1.address), Array(6).fill(2000), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

			maxPricePack = parseEther(1);
			minPricePack = parseEther(0.01);
			priceDecrementAmtPack = parseEther(0.01);
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "Token Single", "SIN", contractUri, isPack, isSingle, !isFixed, isInstantPayment, author1.address, 2000, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleRoyalty(6, Array(6).fill("ipfs://pic.json"), Array(6).fill(author1.address), Array(6).fill(2000), maxPrices, minPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);

			const token1 = (await osbFactory.tokenInfos(5)).token;
			const token2 = (await osbFactory.tokenInfos(6)).token;
			const token3 = (await osbFactory.tokenInfos(7)).token;
			const token4 = (await osbFactory.tokenInfos(8)).token;
			
			const tokenAttach1 = await OSB721.attach(token1);
			const tokenAttach2 = await OSB721.attach(token2);
			const tokenAttach3 = await OSB721.attach(token3);
			const tokenAttach4 = await OSB721.attach(token4);

			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 14), Array(14).fill(hexRoot));
			await project.connect(opFundReceiver).setMerkleRoot(3, hexRoot);
			await project.connect(opFundReceiver).setMerkleRoot(4, hexRoot);
			await setTime(saleStart);
			await checkOwnerOfWallets(tokenAttach1, genNumbersASC(1, 6), Array(6).fill(sale.address));
			await checkOwnerOfWallets(tokenAttach2, genNumbersASC(1, 6), Array(6).fill(sale.address));
			await checkOwnerOfWallets(tokenAttach3, genNumbersASC(1, 6), Array(6).fill(sale.address));
			await checkOwnerOfWallets(tokenAttach4, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenAttach1.balanceOf(admin.address)).to.equal(0);
			expect(await tokenAttach2.balanceOf(admin.address)).to.equal(0);
			expect(await tokenAttach3.balanceOf(admin.address)).to.equal(0);
			expect(await tokenAttach4.balanceOf(admin.address)).to.equal(0);

			const salePrice1 = parseEther(1);
			const salePrice2 = parseEther(2);
			const salePrice3 = parseEther(3);
			const feeRoyalty1 = calculateValuePercent(salePrice1, 20);
			const feeRoyalty2 = calculateValuePercent(salePrice2, 20);
			const feeRoyalty3 = calculateValuePercent(salePrice3, 20);

			await expect(() => sale.connect(user1).buy(1, hexProof(merkleTree, user1.address), 1, { value: salePrice1 })).to.changeEtherBalances(
				[user1, superAdmin, author1],
				[salePrice1.mul(-1), salePrice1.sub(feeRoyalty1), feeRoyalty1]
			);

			await expect(() => sale.connect(user2).buy(2, hexProof(merkleTree, user2.address), 1, { value: salePrice2 })).to.changeEtherBalances(
				[user2, superAdmin, author1],
				[salePrice2.mul(-1), salePrice2.sub(feeRoyalty2), feeRoyalty2]
			);

			const projectInfo2 = await project.getProject(2);
			const saleIdsOfProject2 = await sale.getSaleIdsOfProject(projectInfo2.id);

			for (let i = 0; i < saleIdsOfProject2.length; i++) {
				const saleInfo = await sale.sales(saleIdsOfProject2[i]);
				const maxPrice = saleInfo.dutchMaxPrice;
				const minPrice = saleInfo.dutchMinPrice;
				const priceDecrementAmt = saleInfo.priceDecrementAmt;
				const decrement = maxPrice.sub(minPrice).div(priceDecrementAmt);
				const timeToDecrementPrice = projectInfo2.saleEnd.sub(projectInfo2.saleStart).div(decrement);
				const dutchParam = [projectInfo2.saleStart, projectInfo2.saleEnd, saleInfo.dutchMaxPrice, saleInfo.dutchMinPrice, saleInfo.priceDecrementAmt];
				
				await skipTime(Number(timeToDecrementPrice));
			    const currentTime = BigNumber.from(await blockTimestamp());
				const numDecrements = currentTime.sub(projectInfo2.saleStart).div(timeToDecrementPrice);
				const currentDutchPrice = await sale.getCurrentDutchPrice(...dutchParam);
				const decrementAmt = saleInfo.priceDecrementAmt.mul(numDecrements);
				expect(currentDutchPrice).to.equal(saleInfo.dutchMaxPrice.sub(decrementAmt));

				if (i == 0) {
					const price = saleInfo.dutchMaxPrice;
					await sale.connect(user3).buy(saleIdsOfProject2[i], hexProof(merkleTree, user3.address), 1, { value: price });
				} else {
					const price = saleInfo.dutchMaxPrice.sub(decrementAmt);
					await sale.connect(user3).buy(saleIdsOfProject2[i], hexProof(merkleTree, user3.address), 1, { value: price });
				}
			}

			await expect(() => sale.connect(user3).buy(3, hexProof(merkleTree, user3.address), 1, { value: salePrice3 })).to.changeEtherBalances(
				[user3, superAdmin, author1],
				[salePrice3.mul(-1), salePrice3.sub(feeRoyalty3), feeRoyalty3]
			);
			
			await expect(() => sale.connect(user3).buyPack(3, hexProof(merkleTree, user3.address), 3, { value: fixedPricePack.mul(3) })).to.changeEtherBalances(
				[user3, superAdmin, author1],
				[salePrice3.mul(-1), salePrice3.sub(feeRoyalty3), feeRoyalty3]
			);
			
			const projectInfo4 = await project.getProject(4);
			const saleIdsOfProject4 = await sale.getSaleIdsOfProject(4);
			const saleInfo = await sale.sales(saleIdsOfProject4[0]);
			const dutchParam = [projectInfo4.saleStart, projectInfo4.saleEnd, saleInfo.dutchMaxPrice, saleInfo.dutchMinPrice, saleInfo.priceDecrementAmt];
			const decrement = saleInfo.dutchMaxPrice.sub(saleInfo.dutchMinPrice).div(saleInfo.priceDecrementAmt);
			const timeToDecrementPrice = projectInfo4.saleEnd.sub(projectInfo4.saleStart).div(decrement);

			for (let j = 0; j < 3; j++) {
				await skipTime(Number(timeToDecrementPrice));
			    const currentTime = BigNumber.from(await blockTimestamp());
				const numDecrements = currentTime.sub(projectInfo4.saleStart).div(timeToDecrementPrice);
				const currentDutchPrice = await sale.getCurrentDutchPrice(...dutchParam);
				const decrementAmt = saleInfo.priceDecrementAmt.mul(numDecrements);
				expect(currentDutchPrice).to.equal(saleInfo.dutchMaxPrice.sub(decrementAmt));
				if (j == 0) {
					const price = saleInfo.dutchMaxPrice.mul(2);
					await sale.connect(user3).buyPack(4, hexProof(merkleTree, user3.address), 2, { value: price });
				} else {
					const price = saleInfo.dutchMaxPrice.sub(decrementAmt).mul(2);
					await sale.connect(user3).buyPack(4, hexProof(merkleTree, user3.address), 2, { value: price });
				}
			}
				
			const tokenProjectAttach1 = await OSB721.attach((await osbFactory.tokenInfos(5)).token);
			const tokenProjectAttach2 = await OSB721.attach((await osbFactory.tokenInfos(6)).token);
			const tokenProjectAttach3 = await OSB721.attach((await osbFactory.tokenInfos(7)).token);
			const tokenProjectAttach4 = await OSB721.attach((await osbFactory.tokenInfos(8)).token);

			await checkOwnerOfWallets(tokenProjectAttach1, genNumbersASC(1, 3), [user1.address, user2.address, user3.address]);
			await checkOwnerOfWallets(tokenProjectAttach1, genNumbersASC(4, 6), Array(3).fill(sale.address));
			await checkOwnerOfWallets(tokenProjectAttach2, genNumbersASC(1, 6), Array(6).fill(user3.address));

			expect(await tokenProjectAttach3.balanceOf(user3.address)).to.equal(3);
			expect(await tokenProjectAttach3.balanceOf(sale.address)).to.equal(3);

			await checkOwnerOfWallets(tokenProjectAttach4, await getTokenIdsBySaleIds(genNumbersASC(19, 24)), Array(6).fill(user3.address));

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.ENDED);
			expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);
			expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.ENDED);

			await setTime(saleEnd);
			await project.connect(admin).closeProject(1, [4, 5, 6], false);
			await project.connect(admin).closeProject(3, await sale.currentSalesInPack(3), false);
			expect(await tokenProjectAttach1.balanceOf(admin.address)).to.equal(3);
			expect(await tokenProjectAttach3.balanceOf(admin.address)).to.equal(3);

			await checkOwnerOfWallets(tokenProjectAttach1, genNumbersASC(4, 6), Array(3).fill(admin.address));
			await checkOwnerOfWallets(tokenProjectAttach3, await getTokenIdsBySaleIds(await sale.currentSalesInPack(3)), Array(3).fill(admin.address));

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
			expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("2.Project admin off soft cap & InstantPayment & buy all: single token with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(sale.address)).to.equal(6);

			const saleIds = genNumbersASC(1, 6);
			const feeRoyalties = fixedPrices.map(a => calculateValuePercent(a, 20));

			for (let i = 0; i < saleIds.length - 3; i++) {
				await expect(() => sale.connect(user1).buy(saleIds[i], hexProof(merkleTree, user1.address), 1, { value: fixedPrices[i] })).to.changeEtherBalances(
					[user1, superAdmin, author1],
					[fixedPrices[i].mul(-1), fixedPrices[i].sub(feeRoyalties[i]), feeRoyalties[i]]
				);
			}

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 3), Array(3).fill(user1.address));

			expect(await tokenSingleAdminAttach.balanceOf(sale.address)).to.equal(3);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

			await setTime(saleEnd);
			await project.connect(admin).closeProject(1, [4, 5, 6], false);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("3.Project admin off soft cap & no InstantPayment & no give: single token  with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);
			expect(await tokenSingleAdminAttach.balanceOf(sale.address)).to.equal(6);
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(0);

			const [salePrice1, salePrice2, salePrice3] = parseEthers([1, 2, 3]);
			const salePriceTotal = add(add(salePrice1, salePrice2), salePrice3);
			const [feeRoyalty1, feeRoyalty2, feeRoyalty3] = [calculateValuePercent(salePrice1, 20), calculateValuePercent(salePrice2, 20), calculateValuePercent(salePrice3, 20)];
			const feeRoyaltyTotal = add(add(feeRoyalty1, feeRoyalty2), feeRoyalty3);

			await sale.connect(user1).buy(1, hexProof(merkleTree, user1.address), 1, { value: salePrice1 });
			await sale.connect(user2).buy(2, hexProof(merkleTree, user2.address), 1, { value: salePrice2 });
			await sale.connect(user3).buy(3, hexProof(merkleTree, user3.address), 1, { value: salePrice3 });

			expect(await sale.getBuyersWaitingDistribution(1)).to.eql([user1.address]);
			expect(await sale.getBuyersWaitingDistribution(2)).to.eql([user2.address]);
			expect(await sale.getBuyersWaitingDistribution(3)).to.eql([user3.address]);

			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(3);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			await setTime(saleEnd);

			await expect(() => project.connect(admin).closeProject(1, genNumbersASC(1, 6), false)).to.changeEtherBalances(
				[superAdmin, author1],
				[subtract(salePriceTotal, feeRoyaltyTotal), feeRoyaltyTotal]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(17);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 3), [user1.address, user2.address, user3.address]);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(4, 6), Array(3).fill(admin.address));

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("4.Project admin off soft cap & no InstantPayment & no give & buy all: single token  with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(sale.address)).to.equal(6);

			const saleIds = genNumbersASC(1, 6);
			const salePriceTotal = fixedPrices.reduce((a, b) => add(a, b), 0);
			const feeRoyalties = fixedPrices.map(a => calculateValuePercent(a, 20));
			const feeRoyaltyTotal = feeRoyalties.reduce((a, b) => add(a, b), 0);

			for (let i = 0; i < saleIds.length; i++) {
				await sale.connect(user1).buy(saleIds[i], hexProof(merkleTree, user1.address), 1, { value: fixedPrices[i] });
			}

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, saleIds, false)).to.changeEtherBalances(
				[superAdmin, author1],
				[subtract(salePriceTotal, feeRoyaltyTotal), feeRoyaltyTotal]
			);
			expect(await tokenSingleAdminAttach.balanceOf(sale.address)).to.equal(0);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(user1.address));
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("5.Project admin off soft cap & no InstantPayment & give: single token  with royalty percent 20%", async () => {
			const saleIds = genNumbersASC(1, 6);
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(saleIds, fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, saleIds, Array(6).fill(hexRoot));

			await setTime(saleStart);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);

			const salePrice1 = parseEther(1);
			const salePrice2 = parseEther(2);
			const salePrice3 = parseEther(3);

			await sale.connect(user1).buy(1, hexProof(merkleTree, user1.address), 1, { value: salePrice1 });
			await sale.connect(user2).buy(2, hexProof(merkleTree, user2.address), 1, { value: salePrice2 });
			await sale.connect(user3).buy(3, hexProof(merkleTree, user3.address), 1, { value: salePrice3 });

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			await setTime(saleEnd);

			await expect(() => project.connect(admin).closeProject(1, saleIds, true)).to.changeEtherBalances(
				[user1, user2, user3, superAdmin, author1],
				[salePrice1, salePrice2, salePrice3, 0, 0]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(17);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 3), [user1.address, user2.address, user3.address]);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(4, 6), Array(3).fill(admin.address));

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("6.Project admin off soft cap & no InstantPayment & give & buy all: single token  with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(sale.address)).to.equal(6);

			const saleIds = genNumbersASC(1, 6);
			const salePriceTotal = fixedPrices.reduce((a, b) => add(a, b), 0);
			for (let i = 0; i < saleIds.length; i++) {
				await sale.connect(user1).buy(saleIds[i], hexProof(merkleTree, user1.address), 1, { value: fixedPrices[i] });
			}

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, saleIds, true)).to.changeEtherBalances(
				[user1, superAdmin, author1],
				[salePriceTotal, 0, 0]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(user1.address));
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("7.Project admin on soft cap success & no give: single token  with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 3, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);

			const salePrice1 = parseEther(1);
			const salePrice2 = parseEther(2);
			const salePrice3 = parseEther(3);
			const salePriceTotal = add(add(salePrice1, salePrice2), salePrice3);
			const feeRoyalty1 = calculateValuePercent(salePrice1, 20);
			const feeRoyalty2 = calculateValuePercent(salePrice2, 20);
			const feeRoyalty3 = calculateValuePercent(salePrice3, 20);
			const feeRoyaltyTotal = add(add(feeRoyalty1, feeRoyalty2), feeRoyalty3);

			await sale.connect(user1).buy(1, hexProof(merkleTree, user1.address), 1, { value: salePrice1 });
			await sale.connect(user2).buy(2, hexProof(merkleTree, user2.address), 1, { value: salePrice2 });
			await sale.connect(user3).buy(3, hexProof(merkleTree, user3.address), 1, { value: salePrice3 });

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);

			await expect(() => project.connect(admin).closeProject(1, genNumbersASC(1, 6), false)).to.changeEtherBalances(
				[superAdmin, author1],
				[subtract(salePriceTotal, feeRoyaltyTotal), feeRoyaltyTotal]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(17);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 3), [user1.address, user2.address, user3.address]);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("8.Project admin on soft cap success & no give & buy all: single token  with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 3, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);

			const salePriceTotal = fixedPrices.reduce((a, b) => add(a, b), 0);
			const feeRoyalties = fixedPrices.map(a => calculateValuePercent(a, 20));
			const feeRoyaltyTotal = feeRoyalties.reduce((a, b) => add(a, b), 0);

			const saleIds = genNumbersASC(1, 6);
			for (let i = 0; i < saleIds.length; i++) {
				await sale.connect(user1).buy(saleIds[i], hexProof(merkleTree, user1.address), 1, { value: fixedPrices[i] });
			}

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, saleIds, false)).to.changeEtherBalances(
				[superAdmin, author1],
				[subtract(salePriceTotal, feeRoyaltyTotal), feeRoyaltyTotal]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(user1.address));
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("9.Project admin on soft cap success & give: single token  with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 3, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);

			await sale.connect(user1).buy(1, hexProof(merkleTree, user1.address), 1, { value: fixedPrices[0] });
			await sale.connect(user2).buy(2, hexProof(merkleTree, user2.address), 1, { value: fixedPrices[1] });
			await sale.connect(user3).buy(3, hexProof(merkleTree, user3.address), 1, { value: fixedPrices[2] });

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, genNumbersASC(1, 6), true)).to.changeEtherBalances(
				[user1, user2, user3, superAdmin, author1],
				[fixedPrices[0], fixedPrices[1], fixedPrices[2], 0, 0]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(17);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 3), [user1.address, user2.address, user3.address]);

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("10.Project admin on soft cap success & give & buy all: single token  with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 3, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);

			const saleIds = genNumbersASC(1, 6);
			const salePriceTotal = fixedPrices.reduce((a, b) => add(a, b), 0);
			for (let i = 0; i < saleIds.length; i++) {
				await sale.connect(user1).buy(saleIds[i], hexProof(merkleTree, user1.address), 1, { value: fixedPrices[i] });
			}

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, saleIds, true)).to.changeEtherBalances(
				[user1, superAdmin, author1],
				[salePriceTotal, 0, 0]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(user1.address));
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("11.Project admin on soft cap fail & no give: single token with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 3, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			await sale.connect(user1).buy(1, hexProof(merkleTree, user1.address), 1, { value: fixedPrices[0] });
			await sale.connect(user2).buy(2, hexProof(merkleTree, user2.address), 1, { value: fixedPrices[1] });

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, genNumbersASC(1, 6), false)).to.changeEtherBalances(
				[user1, user2, superAdmin, author1],
				[fixedPrices[0], fixedPrices[1], 0, 0]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(20);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(admin.address));

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("12.Project admin on soft cap fail & give: single token with royalty percent 20%", async () => {
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 3, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(14);

			await sale.connect(user1).buy(1, hexProof(merkleTree, user1.address), 1, { value: fixedPrices[0] });
			await sale.connect(user2).buy(2, hexProof(merkleTree, user2.address), 1, { value: fixedPrices[1] });

			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, genNumbersASC(1, 6), true)).to.changeEtherBalances(
				[user1, user2, superAdmin, author1],
				[fixedPrices[0], fixedPrices[1], 0, 0]
			);

			expect(await tokenSingleAdminAttach.balanceOf(admin.address)).to.equal(18);
			await checkOwnerOfWallets(tokenSingleAdminAttach, [1, 2], [user1.address, user2.address]);
			await checkOwnerOfWallets(tokenSingleAdminAttach, genNumbersASC(3, 6), Array(4).fill(admin.address));

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("13.Project admin on soft cap success & no give & buy all: single token with royalty percent per token", async () => {
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "Single", "SIN", contractUri, !isPack, isSingle, isFixed, !isInstantPayment, author1.address, 1000, 3, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(
					6,
					Array(6).fill("ipfs://pic.json"),
					[author2.address, author3.address, author4.address, author1.address, author1.address, author1.address],
					[3000, 10000, 5000, 3000, 3000, 0],
					fixedPrices
				),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 6), Array(6).fill(hexRoot));

			await setTime(saleStart);

			const lastIdFactory = await osbFactory.lastId();
			const token = (await osbFactory.tokenInfos(lastIdFactory)).token;
			const tokenAttach = await OSB721.attach(token);

			await checkOwnerOfWallets(tokenAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));
			expect(await tokenAttach.balanceOf(admin.address)).to.equal(0);

			const salePriceTotal = fixedPrices.reduce((a, b) => add(a, b), 0);
			const feeRoyalty1 = calculateValuePercent(fixedPrices[0], 30);
			const feeRoyalty2 = calculateValuePercent(fixedPrices[1], 100);
			const feeRoyalty3 = calculateValuePercent(fixedPrices[2], 50);
			const feeRoyalty4 = calculateValuePercent(fixedPrices[3], 30);
			const feeRoyalty5 = calculateValuePercent(fixedPrices[4], 30);
			const feeRoyalty6 = calculateValuePercent(fixedPrices[5], 0);

			const feeRoyaltyTotalDefault = [feeRoyalty4, feeRoyalty5, feeRoyalty6].reduce((a, b) => add(a, b), 0);
			const feeRoyaltyTotal = [feeRoyalty1, feeRoyalty2, feeRoyalty3, feeRoyalty4, feeRoyalty5, feeRoyalty6].reduce((a, b) => add(a, b), 0);

			const saleIds = genNumbersASC(1, 6);
			for (let i = 0; i < saleIds.length; i++) {
				await sale.connect(user1).buy(saleIds[i], hexProof(merkleTree, user1.address), 1, { value: fixedPrices[i] });
			}

			await checkOwnerOfWallets(tokenAttach, genNumbersASC(1, 6), Array(6).fill(sale.address));

			await setTime(saleEnd);
			await expect(() => project.connect(admin).closeProject(1, saleIds, false)).to.changeEtherBalances(
				[author2, author3, author4, author1, superAdmin],
				[feeRoyalty1, feeRoyalty2, feeRoyalty3, feeRoyaltyTotalDefault, subtract(salePriceTotal, feeRoyaltyTotal)]
			);

			expect(await tokenAttach.balanceOf(admin.address)).to.equal(0);
			await checkOwnerOfWallets(tokenAttach, genNumbersASC(1, 6), Array(6).fill(user1.address));
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})
	})
})

const calculateValuePercent = (value, percent) => {
	return divide(multiply(value, percent), 100, 0);
}