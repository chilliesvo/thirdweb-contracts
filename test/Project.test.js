const { ethers } = require("hardhat");
const { expect } = require("chai");
const { blockTimestamp, genNumbersASC, parseEther, ZERO_ADDRESS, generateMerkleTree, setTime, hexProof, checkBalanceOfWallets, parseEthers, getBalance, sendNativeCoinFrom, formatEther } = require("./utils");
const { generateInputsFixedWithTokenSingleAvailable, generateInputsFixedWithTokenMultiAvailable, setMerkleRoots, PROJECT_STATUS, importContractABIs, getProjectStatus, generateInputsFixedWithTokenSingleNotAvailable, generateInputsFixedWithTokenMultiNotAvailable, getSaleTimeStart, getSaleTimeEnd, generateInputsDutchWithTokenSingleAvailable, generateInputsDutchWithTokenMultiAvailable, generateInputsDutchWithTokenSingleNotAvailable, generateInputsDutchWithTokenMultiNotAvailable, getSoldAmountFromProject, buys, generateInputsFixedWithTokenSingleRoyalty } = require("./osb.utils");

const TEN_MINUTES = 600;
const ONE_DAY = 86400;
const baseUri = "ipfs://";
const createProjectFee = parseEther(3);
const profitShareMinimum = 10;
const opFundLimit = parseEther(2);
const saleCreateLimit = 50;
const closeLimit = 100;
const profitShareAdmin = 0;

describe("Project", () => {
	const isPack = true;
	const isSingle = true;
	const isFixed = true;
	const isInstantPayment = true;
	beforeEach(async () => {
		//** Get Wallets */
		[deployer, superAdmin, admin, opFundReceiver, controller, user1, user2, user3, user4, user5, user6, user7, user8, user9, user10, manager1, manager2, crossmint] = await ethers.getSigners();

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

		//** Deploy Contracts normal */
        const osb721  = await OSB721.deploy();
        const osb1155 = await OSB1155.deploy();

        //** Deploy Contracts with Proxy to upgrade contract in future */
		nftChecker = await upgrades.deployProxy(NFTChecker);
		setting    = await upgrades.deployProxy(Setting, [superAdmin.address]);
		osbFactory = await upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
		osbSoul    = await upgrades.deployProxy(OSBSoul, [setting.address, "OSB Soul", "SOUL"]);
		const randomizer = await Randomizer.deploy(setting.address);

        await expect(upgrades.deployProxy(Project, [[ZERO_ADDRESS, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]])).to.revertedWith("Invalid setting");
        await expect(upgrades.deployProxy(Project, [[setting.address, ZERO_ADDRESS, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]])).to.revertedWith("Invalid nftChecker");
        await expect(upgrades.deployProxy(Project, [[setting.address, nftChecker.address, ZERO_ADDRESS, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]])).to.revertedWith("Invalid osbFactory");
        await expect(upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, ZERO_ADDRESS, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]])).to.revertedWith("Invalid osbSoul");
        await expect(upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, ZERO_ADDRESS]])).to.revertedWith("Invalid opFundReceiver");
        await expect(upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, 0, closeLimit, opFundLimit, opFundReceiver.address]])).to.revertedWith("Invalid saleCreateLimit");
        await expect(upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, 0, opFundLimit, opFundReceiver.address]])).to.revertedWith("Invalid closeLimit");
        project = await upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]]);
		
		sale = await upgrades.deployProxy(Sale, [setting.address, nftChecker.address, randomizer.address]);
		importContractABIs(project, sale, osbFactory);

		//** Setting after deployed */
		await expect(project.connect(user1).setSaleAddress(user1.address)).to.revertedWith("Caller is not the super admin");
		await expect(project.connect(superAdmin).setSaleAddress(ZERO_ADDRESS)).to.revertedWith("Invalid Sale address");
        await project.connect(superAdmin).setSaleAddress(sale.address);

        await sale.connect(superAdmin).setProjectAddress(project.address);
        await setting.connect(superAdmin).setController(controller.address, true);

		//** Check settings after deployed */
		expect(await project.sale()).to.equal(sale.address);
		expect(await project.nftChecker()).to.equal(nftChecker.address);
		expect(await project.osbFactory()).to.equal(osbFactory.address);
		expect(await project.osbSoul()).to.equal(osbSoul.address);
		expect(await project.createProjectFee()).to.equal(createProjectFee);
		expect(await project.profitShareMinimum()).to.equal(profitShareMinimum);
		expect(await project.saleCreateLimit()).to.equal(50);
		expect(await project.closeLimit()).to.equal(closeLimit);
		expect(await project.opFundReceiver()).to.equal(opFundReceiver.address);
		expect(await sale.project()).to.equal(project.address);
		expect(await sale.setting()).to.equal(setting.address);
		expect(await sale.nftChecker()).to.equal(nftChecker.address);
		expect(await sale.randomizer()).to.equal(randomizer.address);
		expect(await setting.getSuperAdmin()).to.equal(superAdmin.address);
		expect(await setting.isController(controller.address)).to.equal(true);

		saleStart = (await blockTimestamp()) + TEN_MINUTES;
		saleEnd   = saleStart + ONE_DAY;
	});

	describe("setSaleAddress", () => {
		it("Should return exception `Caller is not the super admin`", async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await project.sale()).to.equal(sale.address);
			await expect(project.connect(user1).setSaleAddress(user2.address)).to.revertedWith("Caller is not the super admin");
			await expect(project.connect(admin).setSaleAddress(user2.address)).to.revertedWith("Caller is not the super admin");
			await project.connect(superAdmin).setSaleAddress(user1.address);
			expect(await project.sale()).to.equal(user1.address);
		})

		it("Should return exception `Invalid Sale address`", async () => {
			expect(await project.sale()).to.equal(sale.address);
			await expect(project.connect(superAdmin).setSaleAddress(ZERO_ADDRESS)).to.revertedWith("Invalid Sale address");
			await project.connect(superAdmin).setSaleAddress(user1.address);
			expect(await project.sale()).to.equal(user1.address);
		})

		it("Should return success", async () => {
			expect(await project.sale()).to.equal(sale.address);
			await project.connect(superAdmin).setSaleAddress(user1.address);
			expect(await project.sale()).to.equal(user1.address);
		})
	})

	describe("setServiceFundReceiver", () => {
		beforeEach(async () => {
			expect(await setting.isAdmin(admin.address)).to.equal(false);
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await setting.isAdmin(admin.address)).to.equal(true);
			expect(await project.serviceFundReceiver()).to.equal(superAdmin.address);
		})

		it("Should return exception `Caller is not the super admin`", async () => {
			await expect(project.connect(user1).setServiceFundReceiver(user1.address)).to.revertedWith("Caller is not the super admin");
			await expect(project.connect(admin).setServiceFundReceiver(user1.address)).to.revertedWith("Caller is not the super admin");
			await project.connect(superAdmin).setServiceFundReceiver(user1.address);
			expect(await project.serviceFundReceiver()).to.equal(user1.address);
		})

		it("Should return exception `Invalid account`", async () => {
			await expect(project.connect(superAdmin).setServiceFundReceiver(ZERO_ADDRESS)).to.revertedWith("Invalid account");
			await project.connect(superAdmin).setServiceFundReceiver(user1.address);
			expect(await project.serviceFundReceiver()).to.equal(user1.address);
		})

		it("Should return success", async () => {
			await project.connect(superAdmin).setServiceFundReceiver(user1.address);
			expect(await project.serviceFundReceiver()).to.equal(user1.address);
		})
	})

	describe("setOpFundReceiver", () => {
		beforeEach(async () => {
			expect(await setting.isAdmin(admin.address)).to.equal(false);
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await setting.isAdmin(admin.address)).to.equal(true);
			expect(await project.opFundReceiver()).to.equal(opFundReceiver.address);
		})

		it("Should return exception `Caller is not the super admin`", async () => {
			await expect(project.connect(user1).setOpFundReceiver(user1.address)).to.revertedWith("Caller is not the super admin");
			await expect(project.connect(admin).setOpFundReceiver(user1.address)).to.revertedWith("Caller is not the super admin");
			await project.connect(superAdmin).setOpFundReceiver(user1.address);
			expect(await project.opFundReceiver()).to.equal(user1.address);
		})

		it("Should return exception `Invalid account`", async () => {
			await expect(project.connect(superAdmin).setOpFundReceiver(ZERO_ADDRESS)).to.revertedWith("Invalid account");
			await project.connect(superAdmin).setOpFundReceiver(user1.address);
			expect(await project.opFundReceiver()).to.equal(user1.address);
		})

		it("Should return success", async () => {
			await project.connect(superAdmin).setOpFundReceiver(user1.address);
			expect(await project.opFundReceiver()).to.equal(user1.address);
		})
	})

	describe("setCreateProjectFee", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await setting.isAdmin(admin.address)).to.equal(true);
			expect(await project.createProjectFee()).to.equal(createProjectFee);
		})

		it("Should return exception `Caller is not the super admin`", async () => {
			const newFee = parseEther(1);
			await expect(project.connect(user1).setCreateProjectFee(newFee)).to.revertedWith("Caller is not the super admin");
			await expect(project.connect(admin).setCreateProjectFee(newFee)).to.revertedWith("Caller is not the super admin");
			await project.connect(superAdmin).setCreateProjectFee(newFee);
			expect(await project.createProjectFee()).to.equal(newFee);
		})

		it("Should return exception `Invalid fee`", async () => {
			const newFee = parseEther(1);
			await expect(project.connect(superAdmin).setCreateProjectFee(0)).to.revertedWith("Invalid fee");
			await project.connect(superAdmin).setCreateProjectFee(newFee);
			expect(await project.createProjectFee()).to.equal(newFee);
		})

		it("Should return success", async () => {
			const newFee = parseEther(1);
			await project.connect(superAdmin).setCreateProjectFee(newFee);
			expect(await project.createProjectFee()).to.equal(newFee);
		})
	})

	describe("setSaleCreateLimit", () => {
		beforeEach(async () => {
			expect(await setting.isAdmin(admin.address)).to.equal(false);
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await setting.isAdmin(admin.address)).to.equal(true);
			expect(await project.saleCreateLimit()).to.equal(50);
		})

		it("Should return exception `Caller is not the super admin`", async () => {
			const newLimit = 100;
			await expect(project.connect(user1).setSaleCreateLimit(newLimit)).to.revertedWith("Caller is not the super admin");
			await expect(project.connect(admin).setSaleCreateLimit(newLimit)).to.revertedWith("Caller is not the super admin");
			await project.connect(superAdmin).setSaleCreateLimit(newLimit);
			expect(await project.saleCreateLimit()).to.equal(newLimit);
		})

		it("Should return exception `Invalid limit`", async () => {
			const newLimit = 100;
			await expect(project.connect(superAdmin).setSaleCreateLimit(0)).to.revertedWith("Invalid limit");
			await project.connect(superAdmin).setSaleCreateLimit(newLimit);
			expect(await project.saleCreateLimit()).to.equal(newLimit);
		})

		it("Should return success", async () => {
			let newLimit = 100;
			await project.connect(superAdmin).setSaleCreateLimit(newLimit);
			expect(await project.saleCreateLimit()).to.equal(newLimit);
			newLimit = 1;
			await project.connect(superAdmin).setSaleCreateLimit(newLimit);
			expect(await project.saleCreateLimit()).to.equal(newLimit);
		})
	})

	describe("setCloseLimit", () => {
		beforeEach(async () => {
			expect(await setting.isAdmin(admin.address)).to.equal(false);
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await setting.isAdmin(admin.address)).to.equal(true);
			expect(await project.closeLimit()).to.equal(closeLimit);
		})

		it("Should return exception `Caller is not the admin`", async () => {
			const newLimit = 5;
			await expect(project.connect(user1).setCloseLimit(newLimit)).to.revertedWith("Caller is not the admin");
			await project.connect(admin).setCloseLimit(newLimit);
			expect(await project.closeLimit()).to.equal(newLimit);
		})

		it("Should return exception `Invalid limit`", async () => {
			const newLimit = 5;
			await expect(project.connect(admin).setCloseLimit(0)).to.revertedWith("Invalid limit");
			await project.connect(admin).setCloseLimit(newLimit);
			expect(await project.closeLimit()).to.equal(newLimit);
		})

		it("Should return success", async () => {
			let newLimit = 5;
			await project.connect(superAdmin).setCloseLimit(newLimit);
			expect(await project.closeLimit()).to.equal(newLimit);
			newLimit = 1;
			await project.connect(admin).setCloseLimit(newLimit);
			expect(await project.closeLimit()).to.equal(newLimit);
		})
	})

	describe("setOpFundLimit", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await project.opFundLimit()).to.equal(opFundLimit);
		})

		it("Should return exception `Caller is not the super admin`", async () => {
			const newLimit = parseEther(0.2);
			await expect(project.connect(user1).setOpFundLimit(newLimit)).to.revertedWith("Caller is not the super admin");
			await expect(project.connect(admin).setOpFundLimit(newLimit)).to.revertedWith("Caller is not the super admin");
			await project.connect(superAdmin).setOpFundLimit(newLimit);
			expect(await project.opFundLimit()).to.equal(newLimit);
		})

		it("Should return exception `Invalid limit`", async () => {
			let newLimit = 0;
			await expect(project.connect(superAdmin).setOpFundLimit(newLimit)).to.revertedWith("Invalid limit");
			newLimit = parseEther(0.2);
			await project.connect(superAdmin).setOpFundLimit(newLimit);
			expect(await project.opFundLimit()).to.equal(newLimit);
		})

		it("Should return success", async () => {
			const newLimit = parseEther(0.2);
			await project.connect(superAdmin).setOpFundLimit(newLimit);
			expect(await project.opFundLimit()).to.equal(newLimit);
		})
	})

	describe("setManager", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);

			let ownerContract = admin.address;
			let controllerContract = ZERO_ADDRESS;
			await osbFactory.connect(admin).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", admin.address, 1000);
			
			ownerContract = user1.address;
			await osbFactory.connect(user1).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", admin.address, 1000);
			tokenSingleAdmin = (await osbFactory.tokenInfos(1)).token;
			tokenSingleUser1 = (await osbFactory.tokenInfos(2)).token;
			const tokenAttachAdmin = await OSB721.attach(tokenSingleAdmin);
			await tokenAttachAdmin.connect(admin).mintBatch(admin.address, Array(20).fill(baseUri));
			await tokenAttachAdmin.connect(admin).setApprovalForAll(sale.address, true);

			const tokenAttachUser1 = await OSB721.attach(tokenSingleUser1);
			await tokenAttachUser1.connect(user1).mintBatch(user1.address, Array(20).fill(baseUri));
			await tokenAttachUser1.connect(user1).setApprovalForAll(sale.address, true);

			const profitShareAdmin = 0;
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(parseEther(1))),
				{ value: createProjectFee }
			);
			expect(await project.isManager(1, admin.address)).to.equal(true);
			
			await osbSoul.connect(admin).mint(user1.address, "https://ipfs");
			await project.connect(user1).publish(
				[tokenSingleUser1, "", "", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 20), Array(20).fill(parseEther(1))),
				{ value: createProjectFee }
			);
			expect(await project.isManager(2, user1.address)).to.equal(true);
		})

		it("Should return exception `Caller is not the admin`", async () => {
			expect(await project.getManager(1)).to.equal(admin.address);
			await expect(project.connect(user1).setManager(1, user1.address)).to.revertedWith("Caller is not the admin");
			await project.connect(admin).setManager(1, user1.address);
			expect(await project.getManager(1)).to.equal(user1.address);
		})

		it("Should return exception `Invalid project`", async () => {
			expect(await project.getManager(1)).to.equal(admin.address);
			await expect(project.connect(admin).setManager(3, user1.address)).to.revertedWith("Invalid project");
			await project.connect(admin).setManager(1, user1.address);
			expect(await project.getManager(1)).to.equal(user1.address);
		})

		it("Should return exception `Invalid account`", async () => {
			expect(await project.getManager(1)).to.equal(admin.address);
			await expect(project.connect(admin).setManager(1, ZERO_ADDRESS)).to.revertedWith("Invalid account");
			await project.connect(admin).setManager(1, user1.address);
			expect(await project.getManager(1)).to.equal(user1.address);
		})

		it("Should return exception `Account already exists`", async () => {
			expect(await project.getManager(1)).to.equal(admin.address);
			await project.connect(admin).setManager(1, user1.address);
			await expect(project.connect(admin).setManager(1, user1.address)).to.revertedWith("Account already exists");
			expect(await project.getManager(1)).to.equal(user1.address);
		})

		it("Should return success", async () => {
			expect(await project.getManager(1)).to.equal(admin.address);
			await project.connect(admin).setManager(1, user1.address);
			expect(await project.getManager(1)).to.equal(user1.address);
		})
	})

	describe("publish", () => {
		let addressTokenSingleAdmin;
		let addressTokenMultiAdmin;
		let addressTokenSingleUser;
		let addressTokenMultiUser;
		let tokenSingleAdmin;
		let tokenMultiAdmin;
		let tokenSingleUser;
		let tokenMultiUser;

		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
		})
		
		describe("publish with token available", () => {
			beforeEach(async () => {
				let ownerContract = admin.address;
				let controllerContract = ZERO_ADDRESS;
				await osbFactory.connect(admin).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", ZERO_ADDRESS, 0);
				await osbFactory.connect(admin).create(false, ownerContract, controllerContract, baseUri, "Token Multi", "MUL", ZERO_ADDRESS, 0);
				
				ownerContract = user1.address;
				await osbFactory.connect(user1).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", ZERO_ADDRESS, 0);
				await osbFactory.connect(user1).create(false, ownerContract, controllerContract, baseUri, "Token Multi", "MUL", ZERO_ADDRESS, 0);
				addressTokenSingleAdmin = (await osbFactory.tokenInfos(1)).token;
				addressTokenMultiAdmin = (await osbFactory.tokenInfos(2)).token;
				addressTokenSingleUser = (await osbFactory.tokenInfos(3)).token;
				addressTokenMultiUser = (await osbFactory.tokenInfos(4)).token;

				tokenSingleAdmin = await OSB721.attach(addressTokenSingleAdmin);
				await tokenSingleAdmin.connect(admin).mintBatch(admin.address, Array(50).fill(baseUri));
				await tokenSingleAdmin.connect(admin).setApprovalForAll(sale.address, true);

				tokenMultiAdmin = await OSB1155.attach(addressTokenMultiAdmin);
				await tokenMultiAdmin.connect(admin).mintBatch(admin.address, Array(50).fill(100), Array(50).fill(baseUri));
				await tokenMultiAdmin.connect(admin).setApprovalForAll(sale.address, true);

				tokenSingleUser = await OSB721.attach(addressTokenSingleUser);
				await tokenSingleUser.connect(user1).mintBatch(user1.address, Array(50).fill(baseUri));
				await tokenSingleUser.connect(user1).setApprovalForAll(sale.address, true);

				tokenMultiUser = await OSB1155.attach(addressTokenMultiUser);
				await tokenMultiUser.connect(user1).mintBatch(user1.address, Array(50).fill(100), Array(50).fill(baseUri));
				await tokenMultiUser.connect(user1).setApprovalForAll(sale.address, true);
			})

			it("Sales is empty", async () => {
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					[],
					{ value: createProjectFee }
				)).to.revertedWith("Sales is empty");
			})

			it("Reached sale create Limit", async () => {
				const fixedPrices1 = parseEthers(Array(51).fill(1));
				const fixedPrices2 = parseEthers(Array(50).fill(1));

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 51), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Reached sale create Limit");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices2),
					{ value: createProjectFee }
				);
			})

			it("Invalid create fee", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				let royaltyReceiver = admin.address;
				let royaltyFeeNumerator = 1000;

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: 0 }
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee.sub(1) }
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee.add(1) }
				)).to.revertedWith("Invalid create fee");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				royaltyReceiver = ZERO_ADDRESS;
				royaltyFeeNumerator = 0;
				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: 0 }
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee.sub(1) }
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee.add(1) }
				)).to.revertedWith("Invalid create fee");

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await expect(project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: 0 }
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee.sub(1) }
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee.add(1) }
				)).to.revertedWith("Invalid create fee");

				await project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee.sub(1) }
				)).to.revertedWith("Invalid create fee");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee.add(1) }
				)).to.revertedWith("Invalid create fee");

				await project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid sale time", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				const timestamp = await blockTimestamp();
				let royaltyReceiver = ZERO_ADDRESS;
				let royaltyFeeNumerator = 0;

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, timestamp - 1, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleEnd, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleEnd + 1, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getSaleTimeStart(1)).to.equal(saleStart);
				expect(await getSaleTimeEnd(1)).to.equal(saleEnd);
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, timestamp - 1, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleEnd, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleEnd + 1, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getSaleTimeStart(2)).to.equal(saleStart);
				expect(await getSaleTimeEnd(2)).to.equal(saleEnd);
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				);

				await project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				);
				
				expect(await getSaleTimeStart(3)).to.equal(saleStart);
				expect(await getSaleTimeEnd(3)).to.equal(saleEnd);
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid isInstantPayment", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				let royaltyReceiver = ZERO_ADDRESS;
				let royaltyFeeNumerator = 0;

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 1, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 1, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");
				
				await expect(project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 1, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 1, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid token", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				let royaltyReceiver = ZERO_ADDRESS;
				let royaltyFeeNumerator = 0;

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[user1.address, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await expect(project.connect(admin).publish(
					[sale.address, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(admin).publish(
					[user1.address, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await expect(project.connect(admin).publish(
					[sale.address, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ifps");

				await expect(project.connect(user1).publish(
					[user1.address, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await expect(project.connect(user1).publish(
					[sale.address, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", false, true, true, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(user1).publish(
					[user1.address, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await expect(project.connect(user1).publish(
					[sale.address, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid token");

				await project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid minSales", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 51, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 50, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100) + 1, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100), 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await expect(project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 51, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(user1).publish(
					[addressTokenSingleUser, "", "", "", !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 50, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices3),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100) + 1, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100), 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 20), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid amount", async () => {
				const fixedPrices1 = parseEthers(Array(5).fill(1));
				const fixedPrices2 = parseEthers(Array(5).fill(1));
				let royaltyReceiver = ZERO_ADDRESS;
				let royaltyFeeNumerator = 0;

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [0, 100 , 100, 100, 100], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 100, 100, 0], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 0, 100, 100], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), Array(5).fill(100), fixedPrices1),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [0, 100 , 100, 100, 100], fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 100, 100, 0], fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 0, 100, 100], fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), Array(5).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid price", async () => {
				const ONE_ETH = parseEther(1);
				const maxPrices = Array(3).fill(ONE_ETH);
				const minPrices = parseEthers(Array(3).fill(0.01));
				const priceDecrementAmts = parseEthers(Array(3).fill(0.01));
				let royaltyReceiver = ZERO_ADDRESS;
				let royaltyFeeNumerator = 0;

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, false, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), [ONE_ETH, ONE_ETH, ONE_ETH], [ONE_ETH.mul(2), 0, 0], priceDecrementAmts),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, false, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), [ONE_ETH, ONE_ETH, ONE_ETH], [0, 0, 0], priceDecrementAmts),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, false, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), maxPrices, minPrices, [maxPrices[0].sub(minPrices[0]).add(1), parseEther(0.01), parseEther(0.01)]),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", false, true, false, true, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Should return success", async () => {
				const opFundReceiverBalance = await getBalance(opFundReceiver.address);
				await sendNativeCoinFrom(opFundReceiver, admin.address, formatEther(opFundReceiverBalance) - 2);
				const fixedPrices1 = parseEthers(Array(10).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(10).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				const maxPrices = Array(20).fill(parseEther(1));
				const minPrices = parseEthers(Array(20).fill(0.01));
				const priceDecrementAmts = parseEthers(Array(20).fill(0.01));
				let royaltyReceiver = ZERO_ADDRESS;
				let royaltyFeeNumerator = 0;
				
				//** publish project admin */
				expect((await getBalance(opFundReceiver.address)) < parseEther(2)).to.equal(true);
				await expect(() => project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, !isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 10, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 10), fixedPrices1),
					{ value: createProjectFee }
				)).to.changeEtherBalances(
					[opFundReceiver],
					[createProjectFee]
				);

				let projectId = await project.lastId();
				let currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(10);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(10);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices1[i]);
				}
				
				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(11, 30), fixedPrices2),
					{ value: createProjectFee }
				)

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices2[i]);
				}

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, !isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(31, 50), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.false;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.dutchMaxPrice).to.equal(maxPrices[i]);
					expect(saleInfo.dutchMinPrice).to.equal(minPrices[i]);
					expect(saleInfo.priceDecrementAmt).to.equal(priceDecrementAmts[i]);
				}
				
				expect(await project.getManager(1)).to.equal(admin.address);
				expect(await project.getManager(2)).to.equal(admin.address);
				expect(await project.getManager(3)).to.equal(admin.address);
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, (10 * 100), profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 10), Array(10).fill(100), fixedPrices3),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(1000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices3[i]);
				}

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(11, 30), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(2000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices4[i]);
				}
				
				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, (20 * 100), profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenMultiAvailable(genNumbersASC(31, 50), Array(20).fill(100), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(2000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(0);
				}
				
				await sendNativeCoinFrom(admin, opFundReceiver.address, formatEther(opFundReceiverBalance) - 2);
				expect(await project.getManager(4)).to.equal(admin.address);
				expect(await project.getManager(5)).to.equal(admin.address);
				expect(await project.getManager(6)).to.equal(admin.address);
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(5)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(6)).to.equal(PROJECT_STATUS.STARTED);
			})
		})

		describe.only("publish with token not available", () => {
			it.only("Invalid create fee", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				let royaltyReceiver = ZERO_ADDRESS;
				let royaltyFeeNumerator = 0;
				
				//** publish project admin */
				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
					{ value: 0 }
				)).to.revertedWith("Invalid create fee");

				// await expect(project.connect(admin).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
				// 	{ value: createProjectFee.sub(1) }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(admin).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
				// 	{ value: createProjectFee.add(1) }
				// )).to.revertedWith("Invalid create fee");

				// await project.connect(admin).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
				// 	{ value: createProjectFee }
				// );

				// expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				// await expect(project.connect(admin).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
				// 	{ value: 0 }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(admin).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
				// 	{ value: createProjectFee.sub(1) }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(admin).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
				// 	{ value: createProjectFee.add(1) }
				// )).to.revertedWith("Invalid create fee");

				// await project.connect(admin).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
				// 	{ value: createProjectFee }
				// );

				// expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
				// 	{ value: 0 }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
				// 	{ value: createProjectFee }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
				// 	{ value: createProjectFee.add(1) }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
				// 	{ value: createProjectFee.sub(1) }
				// )).to.revertedWith("Invalid create fee");

				// await project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
				// 	{ value: createProjectFee }
				// );

				// expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
				// 	{ value: 0 }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
				// 	{ value: createProjectFee }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
				// 	{ value: createProjectFee.sub(1) }
				// )).to.revertedWith("Invalid create fee");

				// await expect(project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
				// 	{ value: createProjectFee.add(1) }
				// )).to.revertedWith("Invalid create fee");

				// await project.connect(user1).publish(
				// 	[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, 0, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
				// 	generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
				// 	{ value: createProjectFee }
				// );

				// expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid sale time", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				const timestamp = await blockTimestamp();

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, timestamp - 1, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleEnd, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleEnd + 1, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getSaleTimeStart(1)).to.equal(saleStart);
				expect(await getSaleTimeEnd(1)).to.equal(saleEnd);
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, timestamp - 1, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleEnd, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleEnd + 1, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid sale time");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getSaleTimeStart(2)).to.equal(saleStart);
				expect(await getSaleTimeEnd(2)).to.equal(saleEnd);
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				await project.connect(user1).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
					{ value: createProjectFee.add(activeProjectFee) }
				);
				
				expect(await getSaleTimeStart(3)).to.equal(0);
				expect(await getSaleTimeEnd(3)).to.equal(0);
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.INACTIVE);

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee.add(activeProjectFee) }
				);
				
				expect(await getSaleTimeStart(3)).to.equal(saleStart);
				expect(await getSaleTimeEnd(3)).to.equal(saleEnd);
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), Array(20).fill(baseUri), fixedPrices4),
					{ value: createProjectFee }
				);
				
				expect(await getSaleTimeStart(4)).to.equal(saleStart);
				expect(await getSaleTimeEnd(4)).to.equal(saleEnd);
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid isInstantPayment", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 1, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 1, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await expect(project.connect(user1).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 1, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
					{ value: createProjectFee.add(activeProjectFee) }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, fixedPrices3),
					{ value: createProjectFee.add(activeProjectFee) }
				);
				
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 1, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee.add(activeProjectFee) }
				)).to.revertedWith("Invalid isInstantPayment");

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee.add(activeProjectFee) }
				);
				
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid minSales", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(50).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 51, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, Array(50).fill(baseUri), fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 50, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, Array(50).fill(baseUri), fixedPrices1),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100) + 1, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), Array(20).fill(baseUri), fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100), 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), Array(20).fill(baseUri), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await expect(project.connect(user1).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 51, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, Array(50).fill(baseUri), fixedPrices3),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 50, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(50, Array(50).fill(baseUri), fixedPrices3),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await expect(project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100) + 1, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), Array(20).fill(baseUri), fixedPrices4),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid minSales");

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100), 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), Array(20).fill(baseUri), fixedPrices4),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid amount", async () => {
				const fixedPrices1 = parseEthers(Array(5).fill(1));
				const fixedPrices2 = parseEthers(Array(5).fill(1));

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable([0, 100 , 100, 100, 100], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable([100, 100 , 100, 100, 0], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable([100, 100 , 0, 100, 100], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(5).fill(100), fixedPrices1),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await expect(project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable([0, 100 , 100, 100, 100], fixedPrices2),
					{ value: createProjectFee.add(activeProjectFee) }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable([100, 100 , 100, 100, 0], fixedPrices2),
					{ value: createProjectFee.add(activeProjectFee) }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable([100, 100 , 0, 100, 100], fixedPrices2),
					{ value: createProjectFee.add(activeProjectFee) }
				)).to.revertedWith("Invalid amount");

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(5).fill(100), fixedPrices2),
					{ value: createProjectFee.add(activeProjectFee) }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid price", async () => {
				const ONE_ETH = parseEther(1);
				const maxPrices = Array(3).fill(ONE_ETH);
				const minPrices = parseEthers(Array(3).fill(0.01));
				const priceDecrementAmts = parseEthers(Array(3).fill(0.01));

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleNotAvailable(3, [ONE_ETH, ONE_ETH, ONE_ETH], [ONE_ETH.mul(2), 0, 0], priceDecrementAmts),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleNotAvailable(3, [ONE_ETH, ONE_ETH, ONE_ETH], [0, 0, 0], priceDecrementAmts),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await expect(project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleNotAvailable(3, maxPrices, minPrices, [maxPrices[0].sub(minPrices[0]).add(1), parseEther(0.01), parseEther(0.01)]),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleNotAvailable(3, maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Should return success", async () => {
				const fixedPrices1 = parseEthers(Array(10).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(10).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				const maxPrices = Array(20).fill(parseEther(1));
				const minPrices = parseEthers(Array(20).fill(0.01));
				const priceDecrementAmts = parseEthers(Array(20).fill(0.01));
				
				//** publish project admin */
				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 10, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(10, fixedPrices1),
					{ value: createProjectFee }
				);
				
				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(20, fixedPrices2),
					{ value: createProjectFee }
				);

				let projectId = await project.lastId();
				let currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(10);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(10);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices1[i]);
				}
				
				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleNotAvailable(20, maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices2[i]);
				}

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleNotAvailable(20, Array(20).fill(baseUri), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.false;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.dutchMaxPrice).to.equal(maxPrices[i]);
					expect(saleInfo.dutchMinPrice).to.equal(minPrices[i]);
					expect(saleInfo.priceDecrementAmt).to.equal(priceDecrementAmts[i]);
				}

				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (10 * 100), 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(10).fill(100), Array(10).fill(baseUri), fixedPrices3),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(1000);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(1000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices3[i]);
				}

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiNotAvailable(Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(2000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices4[i]);
				}

				await project.connect(admin).publish(
					[ZERO_ADDRESS, "MULTI", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, (20 * 100), 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenMultiNotAvailable(Array(20).fill(100), Array(20).fill(baseUri), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(2000);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(2000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(0);
				}

				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(5)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(6)).to.equal(PROJECT_STATUS.STARTED);

				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");
				await osbSoul.connect(admin).mint(user2.address, "https://ipfs");
				await osbSoul.connect(admin).mint(user3.address, "https://ipfs");

				await project.connect(user1).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 10, 0, 0, 0, 0, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices1),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.false;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(user1.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(10);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(10);
				
				await project.connect(user2).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleNotAvailable(20, Array(20).fill(baseUri), fixedPrices2),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.false;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(user2.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				await project.connect(user3).publish(
					[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleNotAvailable(20, Array(20).fill(baseUri), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.false;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(user3.address);
				expect(currentProject.token).to.not.equal(ZERO_ADDRESS);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.false;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.dutchMaxPrice).to.equal(maxPrices[i]);
					expect(saleInfo.dutchMinPrice).to.equal(minPrices[i]);
					expect(saleInfo.priceDecrementAmt).to.equal(priceDecrementAmts[i]);
				}
			})
		})
	})

	describe("addSales", () => {
		let addressTokenSingleAdmin;
		let addressTokenMultiAdmin;
		let addressTokenSingleUser;
		let addressTokenMultiUser;
		let tokenSingleAdmin;
		let tokenMultiAdmin;
		let tokenSingleUser;
		let tokenMultiUser;
		let fixedPricePack = 0;
		let maxPricePack = 0;
		let minPricePack = 0;
		let priceDecrementAmtPack = 0;

		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
		})
		
		describe("add normal Project", () => {
			beforeEach(async () => {
				let ownerContract = admin.address;
				let controllerContract = ZERO_ADDRESS;
				await osbFactory.connect(admin).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", ZERO_ADDRESS, 0);
				await osbFactory.connect(admin).create(false, ownerContract, controllerContract, baseUri, "Token Multi", "MUL", ZERO_ADDRESS, 0);
				
				ownerContract = user1.address;
				await osbFactory.connect(user1).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", ZERO_ADDRESS, 0);
				await osbFactory.connect(user1).create(false, ownerContract, controllerContract, baseUri, "Token Multi", "MUL", ZERO_ADDRESS, 0);
				addressTokenSingleAdmin = (await osbFactory.tokenInfos(1)).token;
				addressTokenMultiAdmin = (await osbFactory.tokenInfos(2)).token;
				addressTokenSingleUser = (await osbFactory.tokenInfos(3)).token;
				addressTokenMultiUser = (await osbFactory.tokenInfos(4)).token;

				tokenSingleAdmin = await OSB721.attach(addressTokenSingleAdmin);
				await tokenSingleAdmin.connect(admin).mintBatch(admin.address, Array(100).fill(baseUri));
				await tokenSingleAdmin.connect(admin).setApprovalForAll(sale.address, true);

				tokenMultiAdmin = await OSB1155.attach(addressTokenMultiAdmin);
				await tokenMultiAdmin.connect(admin).mintBatch(admin.address, Array(100).fill(100), Array(100).fill(baseUri));
				await tokenMultiAdmin.connect(admin).setApprovalForAll(sale.address, true);

				tokenSingleUser = await OSB721.attach(addressTokenSingleUser);
				await tokenSingleUser.connect(user1).mintBatch(user1.address, Array(100).fill(baseUri));
				await tokenSingleUser.connect(user1).setApprovalForAll(sale.address, true);

				tokenMultiUser = await OSB1155.attach(addressTokenMultiUser);
				await tokenMultiUser.connect(user1).mintBatch(user1.address, Array(100).fill(100), Array(100).fill(baseUri));
				await tokenMultiUser.connect(user1).setApprovalForAll(sale.address, true);
			})

			it("Invalid project", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));
				await expect(project.connect(admin).addSales(10, false, 0, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])))).to.revertedWith("Invalid project");
				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);
				
				await setTime(saleStart);
				let projectId = await project.lastId();
				project.connect(admin).addSales(projectId, false, 0, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])));
			})

			it("Project is live", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);
				
				await setTime(saleStart);
				let projectId = await project.lastId();
				await expect(project.connect(admin).addSales(projectId, false, 0, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])))).to.revertedWith("Project is live");
			})

			it("Reached sale create Limit", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);
				
				await project.connect(superAdmin).setSaleCreateLimit(5);
				let projectId = await project.lastId();
				await expect(project.connect(admin).addSales(projectId, false, 0, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])))).to.revertedWith("Reached sale create Limit");
				await project.connect(superAdmin).setSaleCreateLimit(10);
				await project.connect(admin).addSales(projectId, false, 0, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])));
			})

			it("Reached sale create Limit", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);
				
				await project.connect(superAdmin).setSaleCreateLimit(5);
				let projectId = await project.lastId();
				await expect(project.connect(admin).addSales(projectId, false, 0, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])))).to.revertedWith("Reached sale create Limit");
				await project.connect(superAdmin).setSaleCreateLimit(10);
				await project.connect(admin).addSales(projectId, false, 0, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])));
			})

			it("Invalid minSales", async () => {
				const fixedPrices1 = parseEthers(Array(50).fill(1));

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, !isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices1),
					{ value: createProjectFee }
				);
				
				let projectId = await project.lastId();
				await expect(project.connect(admin).addSales(projectId, false, 61, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])))).to.revertedWith("Invalid minSales");
				await project.connect(admin).addSales(projectId, false, 60, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(51, 60), Array(10).fill(fixedPrices1[0])));
			})
	
			it("Invalid amount", async () => {
				const fixedPrices1 = parseEthers(Array(5).fill(1));
				const fixedPrices2 = parseEthers(Array(5).fill(1));

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [0, 100 , 100, 100, 100], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 100, 100, 0], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 0, 100, 100], fixedPrices1),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), Array(5).fill(100), fixedPrices1),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				
				//** publish project user */
				//add member
				await osbSoul.connect(admin).mint(user1.address, "https://ipfs");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [0, 100 , 100, 100, 100], fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 100, 100, 0], fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await expect(project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), [100, 100 , 0, 100, 100], fixedPrices2),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid amount");

				await project.connect(user1).publish(
					[addressTokenMultiUser, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareMinimum, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 5), Array(5).fill(100), fixedPrices2),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Invalid price", async () => {
				const ONE_ETH = parseEther(1);
				const maxPrices = Array(3).fill(ONE_ETH);
				const minPrices = parseEthers(Array(3).fill(0.01));
				const priceDecrementAmts = parseEthers(Array(3).fill(0.01));

				//** publish project admin */
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), [ONE_ETH, ONE_ETH, ONE_ETH], [ONE_ETH.mul(2), 0, 0], priceDecrementAmts),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), [ONE_ETH, ONE_ETH, ONE_ETH], [0, 0, 0], priceDecrementAmts),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), maxPrices, minPrices, [maxPrices[0].sub(minPrices[0]).add(1), parseEther(0.01), parseEther(0.01)]),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				maxPricePack = ONE_ETH;
				minPricePack = ONE_ETH.mul(2);
				priceDecrementAmtPack = parseEther(0.01);
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(4, 6), Array(3).fill(0), Array(3).fill(0), Array(3).fill(0)),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				maxPricePack = ONE_ETH;
				minPricePack = 0;
				priceDecrementAmtPack = parseEther(0.01);
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(4, 6), Array(3).fill(0), Array(3).fill(0), Array(3).fill(0)),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				maxPricePack = ONE_ETH;
				minPricePack = parseEther(0.01);
				priceDecrementAmtPack = maxPricePack.sub(minPricePack).add(1);
				await expect(project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(4, 6), Array(3).fill(0), Array(3).fill(0), Array(3).fill(0)),
					{ value: createProjectFee }
				)).to.revertedWith("Invalid price");

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(1, 3), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);
				
				maxPricePack = ONE_ETH;
				minPricePack = parseEther(0.01);
				priceDecrementAmtPack = parseEther(0.01);
				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(4, 6), Array(3).fill(0), Array(3).fill(0), Array(3).fill(0)),
					{ value: createProjectFee }
				);
				
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
			})
	
			it("Should return success", async () => {
				const fixedPrices1 = parseEthers(Array(10).fill(1));
				const fixedPrices2 = parseEthers(Array(20).fill(1));
				const fixedPrices3 = parseEthers(Array(10).fill(1));
				const fixedPrices4 = parseEthers(Array(20).fill(1));
				const maxPrices = Array(20).fill(parseEther(1));
				const minPrices = parseEthers(Array(20).fill(0.01));
				const priceDecrementAmts = parseEthers(Array(20).fill(0.01));
				
				//** publish project admin */
				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 10, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 10), fixedPrices1),
					{ value: createProjectFee }
				)

				let projectId = await project.lastId();
				let currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(10);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(10);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices1[0]);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(11, 20), fixedPrices1));

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices1[0]);
				}

				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(20);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);
				
				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(21, 40), fixedPrices2),
					{ value: createProjectFee }
				)

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices2[0]);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(41, 60), fixedPrices2));

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices2[0]);
				}

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(40);

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", !isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(61, 80), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.false;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.dutchMaxPrice).to.equal(maxPrices[i]);
					expect(saleInfo.dutchMinPrice).to.equal(minPrices[i]);
					expect(saleInfo.priceDecrementAmt).to.equal(priceDecrementAmts[i]);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsDutchWithTokenSingleAvailable(genNumbersASC(81, 90), Array(10).fill(maxPrices[0]), Array(10).fill(minPrices[0]), Array(10).fill(priceDecrementAmts[0])));
				
				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.false;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(30);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.dutchMaxPrice).to.equal(maxPrices[0]);
					expect(saleInfo.dutchMinPrice).to.equal(minPrices[0]);
					expect(saleInfo.priceDecrementAmt).to.equal(priceDecrementAmts[0]);
				}
				
				expect(await project.getManager(1)).to.equal(admin.address);
				expect(await project.getManager(2)).to.equal(admin.address);
				expect(await project.getManager(3)).to.equal(admin.address);
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);

				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, (10 * 100), profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 10), Array(10).fill(100), fixedPrices3),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(1000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices3[i]);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsFixedWithTokenMultiAvailable(genNumbersASC(11, 20), Array(10).fill(100), fixedPrices3));

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(20);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(2000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices3[0]);
				}
				
				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenMultiAvailable(genNumbersASC(21, 40), Array(20).fill(100), fixedPrices4),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(2000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices4[i]);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsFixedWithTokenMultiAvailable(genNumbersASC(41, 50), Array(10).fill(100), fixedPrices3));
				
				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(3000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrices4[0]);
				}
				
				await project.connect(admin).publish(
					[addressTokenMultiAdmin, "", "", "", !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, (20 * 100), profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenMultiAvailable(genNumbersASC(51, 70), Array(20).fill(100), maxPrices, minPrices, priceDecrementAmts),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenMultiAdmin);
				expect(currentProject.isSingle).to.be.false;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.false;
				expect(currentProject.amount).to.equal(2000);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(0);
				}
				
				await project.connect(admin).addSales(projectId, false, 20, generateInputsDutchWithTokenMultiAvailable(genNumbersASC(71, 80), Array(10).fill(100), Array(10).fill(maxPrices[0]), Array(10).fill(minPrices[0]), Array(10).fill(priceDecrementAmts[0])));

				expect(await project.getManager(4)).to.equal(admin.address);
				expect(await project.getManager(5)).to.equal(admin.address);
				expect(await project.getManager(6)).to.equal(admin.address);
				expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(5)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(6)).to.equal(PROJECT_STATUS.STARTED);
			})
		})

		describe("add pack Project", () => {
			beforeEach(async () => {
				let ownerContract = admin.address;
				let controllerContract = ZERO_ADDRESS;
				await osbFactory.connect(admin).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", ZERO_ADDRESS, 0);
				await osbFactory.connect(admin).create(false, ownerContract, controllerContract, baseUri, "Token Multi", "MUL", ZERO_ADDRESS, 0);
				
				ownerContract = user1.address;
				await osbFactory.connect(user1).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", ZERO_ADDRESS, 0);
				await osbFactory.connect(user1).create(false, ownerContract, controllerContract, baseUri, "Token Multi", "MUL", ZERO_ADDRESS, 0);
				addressTokenSingleAdmin = (await osbFactory.tokenInfos(1)).token;
				addressTokenMultiAdmin = (await osbFactory.tokenInfos(2)).token;
				addressTokenSingleUser = (await osbFactory.tokenInfos(3)).token;
				addressTokenMultiUser = (await osbFactory.tokenInfos(4)).token;

				tokenSingleAdmin = await OSB721.attach(addressTokenSingleAdmin);
				await tokenSingleAdmin.connect(admin).mintBatch(admin.address, Array(100).fill(baseUri));
				await tokenSingleAdmin.connect(admin).setApprovalForAll(sale.address, true);

				tokenMultiAdmin = await OSB1155.attach(addressTokenMultiAdmin);
				await tokenMultiAdmin.connect(admin).mintBatch(admin.address, Array(100).fill(100), Array(100).fill(baseUri));
				await tokenMultiAdmin.connect(admin).setApprovalForAll(sale.address, true);

				tokenSingleUser = await OSB721.attach(addressTokenSingleUser);
				await tokenSingleUser.connect(user1).mintBatch(user1.address, Array(100).fill(baseUri));
				await tokenSingleUser.connect(user1).setApprovalForAll(sale.address, true);

				tokenMultiUser = await OSB1155.attach(addressTokenMultiUser);
				await tokenMultiUser.connect(user1).mintBatch(user1.address, Array(100).fill(100), Array(100).fill(baseUri));
				await tokenMultiUser.connect(user1).setApprovalForAll(sale.address, true);
			})

			it("Should return success", async () => {
				const fixedPrice = parseEther(1);
				const maxPrice = parseEther(1);
				const minPrice = parseEther(0.1);
				const priceDecrementAmt = parseEther(0.1);;
				
				//** publish project admin */
				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", isPack, isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 10, fixedPrice, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 10), Array(10).fill(0)),
					{ value: createProjectFee }
				)

				let projectId = await project.lastId();
				let currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(10);
				expect(currentProject.isPack).to.be.true;
				expect(currentProject.amount).to.equal(10);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrice);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(11, 20), Array(10).fill(parseEther(4))));

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrice);
				}

				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.false;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(20);
				expect(currentProject.isPack).to.be.true;
				expect(currentProject.amount).to.equal(20);
				
				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, fixedPrice, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
					generateInputsFixedWithTokenSingleAvailable(genNumbersASC(21, 40), Array(20).fill(0)),
					{ value: createProjectFee }
				)

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.true;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrice);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsFixedWithTokenSingleAvailable(genNumbersASC(41, 60), Array(20).fill(parseEther(5))));

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.fixedPrice).to.equal(fixedPrice);
				}

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.true;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.true;
				expect(currentProject.amount).to.equal(40);

				await project.connect(admin).publish(
					[addressTokenSingleAdmin, "", "", "", isPack, isSingle, !isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, maxPrice, minPrice, priceDecrementAmt, profitShareAdmin, saleStart, saleEnd],
					generateInputsDutchWithTokenSingleAvailable(genNumbersASC(61, 80), Array(20).fill(0), Array(20).fill(0), Array(20).fill(0)),
					{ value: createProjectFee }
				);

				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.false;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.true;
				expect(currentProject.amount).to.equal(20);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.dutchMaxPrice).to.equal(maxPrice);
					expect(saleInfo.dutchMinPrice).to.equal(minPrice);
					expect(saleInfo.priceDecrementAmt).to.equal(priceDecrementAmt);
				}

				await project.connect(admin).addSales(projectId, false, 20, generateInputsDutchWithTokenSingleAvailable(genNumbersASC(81, 90), Array(10).fill(maxPrice), Array(10).fill(minPrice), Array(10).fill(priceDecrementAmt)));
				
				projectId = await project.lastId();
				currentProject = await project.getProject(projectId);
				expect(currentProject.id).to.equal(projectId);
				expect(currentProject.isCreatedByAdmin).to.be.true;
				expect(currentProject.isInstantPayment).to.be.true;
				expect(currentProject.manager).to.equal(admin.address);
				expect(currentProject.token).to.equal(addressTokenSingleAdmin);
				expect(currentProject.isSingle).to.be.true;
				expect(currentProject.isFixed).to.be.false;
				expect(currentProject.saleStart).to.equal(saleStart);
				expect(currentProject.saleEnd).to.equal(saleEnd);
				expect(currentProject.status).to.equal(PROJECT_STATUS.STARTED);
				expect(currentProject.minSales).to.equal(0);
				expect(currentProject.isPack).to.be.true;
				expect(currentProject.amount).to.equal(30);

				saleIds = await sale.getSaleIdsOfProject(projectId);
				for (let i = 0; i < saleIds.length; i++) {
					const saleInfo = await sale.sales(saleIds[i]);
					expect(saleInfo.dutchMaxPrice).to.equal(maxPrice);
					expect(saleInfo.dutchMinPrice).to.equal(minPrice);
					expect(saleInfo.priceDecrementAmt).to.equal(priceDecrementAmt);
				}
				
				expect(await project.getManager(1)).to.equal(admin.address);
				expect(await project.getManager(2)).to.equal(admin.address);
				expect(await project.getManager(3)).to.equal(admin.address);
				expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
				expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.STARTED);
			})
		})
	})

	describe("closeProject", () => {
		let hexProofUser1, hexProofUser2, hexProofUser3, hexProofUser4, hexProofUser5, hexProofUser6, hexProofUser7, hexProofUser8, hexProofUser9, hexProofUser10;
		let tokenAttach1, tokenAttach2, tokenAttach3, tokenAttach4, tokenAttach5;
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			merkleTree = generateMerkleTree([user1.address, user2.address, user3.address, user4.address, user5.address, user6.address, user7.address, user8.address, user9.address, user10.address]);
			hexRoot = merkleTree.getHexRoot();

			const fixedPrices1 = Array(50).fill(parseEther(1));
			const fixedPrices2 = Array(3).fill(parseEther(1));

			hexProofUser1 = hexProof(merkleTree, user1.address);
			hexProofUser2 = hexProof(merkleTree, user2.address);
			hexProofUser3 = hexProof(merkleTree, user3.address);
			hexProofUser4 = hexProof(merkleTree, user4.address);
			hexProofUser5 = hexProof(merkleTree, user5.address);
			hexProofUser6 = hexProof(merkleTree, user6.address);
			hexProofUser7 = hexProof(merkleTree, user7.address);
			hexProofUser8 = hexProof(merkleTree, user8.address);
			hexProofUser9 = hexProof(merkleTree, user9.address);
			hexProofUser10 = hexProof(merkleTree, user10.address);
			
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "MultiToken1", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiNotAvailable(Array(50).fill(50), Array(50).fill(baseUri), fixedPrices1),
				{ value: createProjectFee }
			);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "MultiToken2", "MUL", baseUri, !isPack, !isSingle, isFixed, !isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiNotAvailable(Array(3).fill(50), Array(3).fill(baseUri), fixedPrices2),
				{ value: createProjectFee }
			);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "MultiToken3", "MUL", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiNotAvailable(Array(3).fill(50), Array(3).fill(baseUri), fixedPrices2),
				{ value: createProjectFee }
			);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SingleToken1", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(3, Array(3).fill(baseUri), Array(3).fill(admin.address), Array(3).fill(1000), fixedPrices2),
				{ value: createProjectFee }
			);

			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SingleToken2", "SIN", baseUri, !isPack, isSingle, isFixed, !isInstantPayment, admin.address, 1000, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleRoyalty(3, Array(3).fill(baseUri), Array(3).fill(admin.address), Array(3).fill(1000), fixedPrices2),
				{ value: createProjectFee }
			);
				
			tokenAttach1 = await OSB1155.attach((await osbFactory.tokenInfos(1)).token);
			tokenAttach2 = await OSB1155.attach((await osbFactory.tokenInfos(2)).token);
			tokenAttach3 = await OSB1155.attach((await osbFactory.tokenInfos(3)).token);
			tokenAttach4 = await OSB1155.attach((await osbFactory.tokenInfos(4)).token);
			tokenAttach5 = await OSB1155.attach((await osbFactory.tokenInfos(5)).token);

			await setMerkleRoots(opFundReceiver, genNumbersASC(1, 50), Array(50).fill(hexRoot));
			await setMerkleRoots(opFundReceiver, genNumbersASC(51, 53), Array(3).fill(hexRoot));
			await setMerkleRoots(opFundReceiver, genNumbersASC(54, 56), Array(3).fill(hexRoot));
			await setMerkleRoots(opFundReceiver, genNumbersASC(57, 59), Array(3).fill(hexRoot));
			await setMerkleRoots(opFundReceiver, genNumbersASC(60, 62), Array(3).fill(hexRoot));

			await setTime(saleStart);

			expect(await project.getTotalBuyersWaitingDistribution(3)).to.equal(0);
			for (let i = 0; i < 3; i++) {
			    await sale.connect(user1).buy(i + 54, hexProofUser1, 1, { value: parseEther(1) });
			    await sale.connect(user2).buy(i + 54, hexProofUser2, 1, { value: parseEther(1) });
			    await sale.connect(user3).buy(i + 54, hexProofUser3, 1, { value: parseEther(1) });
			    await sale.connect(user4).buy(i + 54, hexProofUser4, 1, { value: parseEther(1) });
			    await sale.connect(user5).buy(i + 54, hexProofUser5, 1, { value: parseEther(1) });
			    await sale.connect(user6).buy(i + 54, hexProofUser6, 1, { value: parseEther(1) });
			    await sale.connect(user7).buy(i + 54, hexProofUser7, 1, { value: parseEther(1) });
			    await sale.connect(user8).buy(i + 54, hexProofUser8, 1, { value: parseEther(1) });
			    await sale.connect(user9).buy(i + 54, hexProofUser9, 1, { value: parseEther(1) });
			    await sale.connect(user10).buy(i + 54, hexProofUser10, 1, { value: parseEther(1) });
			}
		})

		it("Caller is not the manager", async () => {
			await setTime(saleEnd);
			await expect(project.connect(user1).closeProject(3, genNumbersASC(54, 56), true)).to.revertedWith("Caller is not the manager");
			await project.connect(admin).closeProject(3, genNumbersASC(54, 56), false);
			expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("Invalid softCap", async () => {
			await setTime(saleEnd);
			await expect(project.connect(admin).closeProject(3, genNumbersASC(54, 56), true)).to.revertedWith("Invalid softCap");
			await project.connect(admin).closeProject(3, genNumbersASC(54, 56), false);
			expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("Invalid project", async () => {
			await expect(project.connect(admin).closeProject(3, genNumbersASC(54, 56), false)).to.revertedWith("Invalid project");
			await setTime(saleEnd);
			await project.connect(admin).closeProject(3, genNumbersASC(54, 56), false);
			expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.ENDED);
			await expect(project.connect(admin).closeProject(3, genNumbersASC(54, 56), false)).to.revertedWith("Invalid project");
		})

		it("Invalid sale id", async () => {
			await setTime(saleEnd);
			await expect(project.connect(admin).closeProject(3, genNumbersASC(1, 20), false)).to.revertedWith("Invalid sale id");
			await expect(project.connect(admin).closeProject(3, genNumbersASC(57, 60), false)).to.revertedWith("Invalid sale id");
			await project.connect(admin).closeProject(3, genNumbersASC(54, 56), false);
			expect(await getProjectStatus(3)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("Should return success", async () => {
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(0);
			for (let i = 0; i < 20; i++) {
				expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(i * 4);
				await sale.connect(user1).buy(i + 1, hexProofUser1, 10, { value: parseEther(1).mul(10) });
				await sale.connect(user2).buy(i + 1, hexProofUser2, 10, { value: parseEther(1).mul(10) });
				await sale.connect(user3).buy(i + 1, hexProofUser3, 10, { value: parseEther(1).mul(10) });
				await sale.connect(user4).buy(i + 1, hexProofUser4, 10, { value: parseEther(1).mul(10) });
			}

			expect(await project.getTotalBuyersWaitingDistribution(2)).to.equal(0);
			for (let i = 0; i < 3; i++) {
			    await sale.connect(user1).buy(i + 51, hexProofUser1, 1, { value: parseEther(1) });
			    await sale.connect(user2).buy(i + 51, hexProofUser2, 1, { value: parseEther(1) });
			    await sale.connect(user3).buy(i + 51, hexProofUser3, 1, { value: parseEther(1) });
			    await sale.connect(user4).buy(i + 51, hexProofUser4, 1, { value: parseEther(1) });
			    await sale.connect(user5).buy(i + 51, hexProofUser5, 1, { value: parseEther(1) });
			    await sale.connect(user6).buy(i + 51, hexProofUser6, 1, { value: parseEther(1) });
			    await sale.connect(user7).buy(i + 51, hexProofUser7, 1, { value: parseEther(1) });
			    await sale.connect(user8).buy(i + 51, hexProofUser8, 1, { value: parseEther(1) });
			    await sale.connect(user9).buy(i + 51, hexProofUser9, 1, { value: parseEther(1) });
			    await sale.connect(user10).buy(i + 51, hexProofUser10, 1, { value: parseEther(1) });
			}

			expect(await project.getTotalBuyersWaitingDistribution(4)).to.equal(0);
			await buys(genNumbersASC(57, 59), [user1, user2, user3], [merkleTree, merkleTree, merkleTree], parseEthers([1, 1, 1]), [1, 1, 1]);
			expect(await project.getTotalBuyersWaitingDistribution(4)).to.equal(0);
			expect(await getProjectStatus(4)).to.equal(PROJECT_STATUS.ENDED);

			expect(await project.getTotalBuyersWaitingDistribution(5)).to.equal(0);
			await buys(genNumbersASC(60, 62), [user1, user2, user3], [merkleTree, merkleTree, merkleTree], parseEthers([1, 1, 1]), [1, 1, 1]);
			expect(await project.getTotalBuyersWaitingDistribution(5)).to.equal(3);
			expect(await getProjectStatus(5)).to.equal(PROJECT_STATUS.STARTED);

			//** CLOSE PROJECT */
			await setTime(saleEnd);
			await project.connect(admin).closeProject(1, genNumbersASC(1, 20), false);

			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);

			await checkBalanceOfWallets(tokenAttach1, Array(20).fill(admin.address), genNumbersASC(1, 20), Array(20).fill(10));
			await checkBalanceOfWallets(tokenAttach1, Array(20).fill(user1.address), genNumbersASC(1, 20), Array(20).fill(10));
			await checkBalanceOfWallets(tokenAttach1, Array(20).fill(user2.address), genNumbersASC(1, 20), Array(20).fill(10));
			await checkBalanceOfWallets(tokenAttach1, Array(20).fill(user3.address), genNumbersASC(1, 20), Array(20).fill(10));
			await checkBalanceOfWallets(tokenAttach1, Array(20).fill(user4.address), genNumbersASC(1, 20), Array(20).fill(10));
			await checkBalanceOfWallets(tokenAttach1, Array(30).fill(sale.address), genNumbersASC(21, 50), Array(30).fill(50));

			await project.connect(admin).closeProject(1, genNumbersASC(21, 50), false);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);

			await expect(project.connect(user1).setCloseLimit(1)).to.revertedWith("Caller is not the admin");
			await expect(project.connect(admin).setCloseLimit(0)).to.revertedWith("Invalid limit");
			await project.connect(admin).setCloseLimit(1);

			await project.connect(admin).closeProject(5, genNumbersASC(60, 62), true);
			expect(await getProjectStatus(5)).to.equal(PROJECT_STATUS.STARTED);
			await project.connect(admin).closeProject(5, [61, 62], true);
			expect(await getProjectStatus(5)).to.equal(PROJECT_STATUS.STARTED);
			await project.connect(admin).closeProject(5, [62], true);
			expect(await getProjectStatus(5)).to.equal(PROJECT_STATUS.ENDED);

			expect(await project.getTotalBuyersWaitingDistribution(2)).to.equal(30);
			expect(await sale.getSaleNotCloseLength(2)).to.equal(3);

			let totalBuyersWaitingDistribution = await project.getTotalBuyersWaitingDistribution(2);
			for (let i = 0; i < 10; i++) {
				await project.connect(admin).closeProject(2, [51], false);
				expect(await project.getTotalBuyersWaitingDistribution(2)).to.equal(--totalBuyersWaitingDistribution);
			}
			expect(await sale.getSaleNotCloseLength(2)).to.equal(2);
			expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
			await checkBalanceOfWallets(tokenAttach2, [user1.address, user2.address, user3.address, user4.address, user5.address, user6.address, user7.address, user8.address, user9.address, user10.address], Array(10).fill(1), Array(10).fill(1));
			expect(await tokenAttach2.balanceOf(admin.address, 1)).to.equal(40);

			await project.connect(admin).setCloseLimit(2);

			totalBuyersWaitingDistribution = await project.getTotalBuyersWaitingDistribution(2);
			for (let i = 0; i < 5; i++) {
				await project.connect(admin).closeProject(2, [52], false);
				expect(await project.getTotalBuyersWaitingDistribution(2)).to.equal(totalBuyersWaitingDistribution -= 2);
			}
			expect(await sale.getSaleNotCloseLength(2)).to.equal(1);
			expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.STARTED);
			await checkBalanceOfWallets(tokenAttach2, [user1.address, user2.address, user3.address, user4.address, user5.address, user6.address, user7.address, user8.address, user9.address, user10.address], Array(10).fill(2), Array(10).fill(1));
			expect(await tokenAttach2.balanceOf(admin.address, 2)).to.equal(40);

			await project.connect(admin).setCloseLimit(3);

			totalBuyersWaitingDistribution = await project.getTotalBuyersWaitingDistribution(2);
			for (let i = 0; i < 4; i++) {
				await project.connect(admin).closeProject(2, [53], false);
				expect(await project.getTotalBuyersWaitingDistribution(2)).to.equal(i !== 3 ? totalBuyersWaitingDistribution -= 3 : 0);
			}
			expect(await sale.getSaleNotCloseLength(2)).to.equal(0);
			expect(await getProjectStatus(2)).to.equal(PROJECT_STATUS.ENDED);
			await checkBalanceOfWallets(tokenAttach2, [user1.address, user2.address, user3.address, user4.address, user5.address, user6.address, user7.address, user8.address, user9.address, user10.address], Array(10).fill(3), Array(10).fill(1));
			expect(await tokenAttach2.balanceOf(admin.address, 3)).to.equal(40);
		})
	})

	describe("setSoldQuantityToProject", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await project.sale()).to.equal(sale.address);
		})
		
		it("Should return exception `Invalid project`", async () => {
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await expect(project.connect(superAdmin).setSoldQuantityToProject(1, 100)).to.revertedWith("Invalid project");

			await project.connect(superAdmin).setSaleAddress(sale.address);
			expect(await project.sale()).to.equal(sale.address);

			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getSoldAmountFromProject(1)).to.equal(0);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await project.connect(superAdmin).setSoldQuantityToProject(1, 100);
			expect(await getSoldAmountFromProject(1)).to.equal(100);
		})

		it("Should return exception `Caller is not the sale`", async () => {
			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getSoldAmountFromProject(1)).to.equal(0);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await expect(project.connect(user1).setSoldQuantityToProject(1, 100)).to.revertedWith("Caller is not the sale");
			await project.connect(superAdmin).setSoldQuantityToProject(1, 100);
			expect(await getSoldAmountFromProject(1)).to.equal(100);
		})

		it("Should return success", async () => {
			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getSoldAmountFromProject(1)).to.equal(0);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await project.connect(superAdmin).setSoldQuantityToProject(1, 100);
			expect(await getSoldAmountFromProject(1)).to.equal(100);
		})
	})

	describe("setMerkleRoot", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
				
			const ownerContract = admin.address;
			const controllerContract = ZERO_ADDRESS;
			await osbFactory.connect(admin).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", ZERO_ADDRESS, 0);
			
			addressTokenSingleAdmin = (await osbFactory.tokenInfos(1)).token;

			tokenSingleAdmin = await OSB721.attach(addressTokenSingleAdmin);
			await tokenSingleAdmin.connect(admin).mintBatch(admin.address, Array(50).fill(baseUri));
			await tokenSingleAdmin.connect(admin).setApprovalForAll(sale.address, true);

			merkleTree = generateMerkleTree([user1.address, user2.address, user3.address]);
			hexRoot = merkleTree.getHexRoot();
		})

		it("Should return exception `Caller is not the opFundReceiver`", async () => {
			const fixedPrices = parseEthers(Array(50).fill(1));
			await project.connect(admin).publish(
				[addressTokenSingleAdmin, "", "", "", isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices),
				{ value: createProjectFee }
			);

			await expect(project.connect(superAdmin).setMerkleRoot(1, hexRoot)).to.revertedWith("Caller is not the opFundReceiver");
			await expect(project.connect(admin).setMerkleRoot(1, hexRoot)).to.revertedWith("Caller is not the opFundReceiver");
			await expect(project.connect(user1).setMerkleRoot(1, hexRoot)).to.revertedWith("Caller is not the opFundReceiver");
			await project.connect(opFundReceiver).setMerkleRoot(1, hexRoot);
			expect(await project.getMerkleRoots(1)).to.equal(hexRoot);
		})

		it("Should return exception `Invalid project`", async () => {
			const fixedPrices = parseEthers(Array(50).fill(1));
			await project.connect(admin).publish(
				[addressTokenSingleAdmin, "", "", "", isPack, isSingle, isFixed, isInstantPayment,  ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices),
				{ value: createProjectFee }
			);

			await expect(project.connect(opFundReceiver).setMerkleRoot(2, hexRoot)).to.revertedWith("Invalid project");
			await project.connect(opFundReceiver).setMerkleRoot(1, hexRoot);
			expect(await project.getMerkleRoots(1)).to.equal(hexRoot);
		})

		it("Should return success", async () => {
			const fixedPrices = parseEthers(Array(50).fill(1));
			await project.connect(admin).publish(
				[addressTokenSingleAdmin, "", "", "", isPack, isSingle, isFixed, isInstantPayment,  ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 50), fixedPrices),
				{ value: createProjectFee }
			);

			await project.connect(opFundReceiver).setMerkleRoot(1, hexRoot);
			expect(await project.getMerkleRoots(1)).to.equal(hexRoot);
		})
	})
	
	describe("addTotalBuyersWaitingDistribution", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await project.sale()).to.equal(sale.address);
		})
		
		it("Should return exception `Invalid project`", async () => {
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await expect(project.connect(superAdmin).addTotalBuyersWaitingDistribution(1)).to.revertedWith("Invalid project");

			await project.connect(superAdmin).setSaleAddress(sale.address);
			expect(await project.sale()).to.equal(sale.address);

			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(0);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await project.connect(superAdmin).addTotalBuyersWaitingDistribution(1);
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(1);
		})

		it("Should return exception `Caller is not the sale`", async () => {
			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(0);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await expect(project.connect(user1).addTotalBuyersWaitingDistribution(1)).to.revertedWith("Caller is not the sale");
			await project.connect(superAdmin).addTotalBuyersWaitingDistribution(1);
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(1);
		})

		it("Should return success", async () => {
			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(0);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await project.connect(superAdmin).addTotalBuyersWaitingDistribution(1);
			expect(await project.getTotalBuyersWaitingDistribution(1)).to.equal(1);
		})
	})

	describe("end", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
			expect(await project.sale()).to.equal(sale.address);
		})
		
		it("Should return exception `Invalid project`", async () => {
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await expect(project.connect(superAdmin).end(1)).to.revertedWith("Invalid project");

			await project.connect(superAdmin).setSaleAddress(sale.address);
			expect(await project.sale()).to.equal(sale.address);

			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await project.connect(superAdmin).end(1);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("Should return exception `Caller is not the sale`", async () => {
			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await expect(project.connect(user1).end(1)).to.revertedWith("Caller is not the sale");
			await project.connect(superAdmin).end(1);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})

		it("Should return success", async () => {
			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.STARTED);
			
			await project.connect(superAdmin).setSaleAddress(superAdmin.address);
			expect(await project.sale()).to.equal(superAdmin.address);
			await project.connect(superAdmin).end(1);
			expect(await getProjectStatus(1)).to.equal(PROJECT_STATUS.ENDED);
		})
	})

	describe("withdrawFund", () => {
		beforeEach(async () => {
			await setting.connect(superAdmin).setAdmin(admin.address, true);
		})
		
		it("Should return exception `Amount exceeds balance`", async () => {
			expect(await ethers.provider.getBalance(project.address)).to.equal(0);
			await expect(project.withdrawFund()).to.revertedWith("Amount exceeds balance");

			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);

			await expect(await ethers.provider.getBalance(project.address)).to.equal(parseEther(3));
			
			await expect(() => project.withdrawFund())
				.to.changeEtherBalances(
					[superAdmin],
					[parseEther(3)]
				);
		})

		it("Should return success", async () => {
			const fixedPrices = parseEthers(Array(10).fill(1));
			await project.connect(admin).publish(
				[ZERO_ADDRESS, "SINGLE", "SIN", baseUri, !isPack, isSingle, isFixed, isInstantPayment, ZERO_ADDRESS, 0, 0, 0, 0, 0, 0, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleNotAvailable(10, Array(10).fill(baseUri), fixedPrices),
				{ value: createProjectFee }
			);

			await expect(await ethers.provider.getBalance(project.address)).to.equal(parseEther(3));
			
			await expect(() => project.withdrawFund())
				.to.changeEtherBalances(
					[superAdmin],
					[parseEther(3)]
				);
		})
	})
});