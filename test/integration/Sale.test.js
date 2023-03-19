const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { blockTimestamp, setTime, parseEthers, generateMerkleTree, hexProof, genNumbersASC, ZERO_ADDRESS, parseEther } = require("../utils");
const { generateInputsFixedWithTokenSingleAvailable, generateInputsFixedWithTokenMultiAvailable, generateInputsDutchWithTokenSingleAvailable, generateInputsDutchWithTokenMultiAvailable } = require("../osb.utils");

const TEN_MINUTES = 600;
const ONE_DAY = 86400;
const createProjectFee = parseEther(0.2);
const profitShareMinimum = 10;
const profitShareAdmin = 0;
const opFundLimit = parseEther(3);
const saleCreateLimit = 50;
const closeLimit = 100;
const baseUri = "ipfs://";

describe("Sale Integration", () => {
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

	before(async () => {
		//** Get Wallets */
		[deployer, superAdmin, admin, opFundReceiver, user1, manager1, manager2, manager3, crossmint] = await ethers.getSigners();

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
		const osb721 = await OSB721.deploy();
		const osb1155 = await OSB1155.deploy();

		//** Deploy Contracts with Proxy to upgrade contract in future */
		nftChecker = await upgrades.deployProxy(NFTChecker);
		setting = await upgrades.deployProxy(Setting, [superAdmin.address]);
		randomizer = await Randomizer.deploy(setting.address);
		osbFactory = await upgrades.deployProxy(OSBFactory, [setting.address, osb721.address, osb1155.address, crossmint.address]);
		osbSoul = await upgrades.deployProxy(OSBSoul,[setting.address, "OSB Soul", "SOUL"]);
		project = await upgrades.deployProxy(Project, [[setting.address, nftChecker.address, osbFactory.address, osbSoul.address, createProjectFee, profitShareMinimum, saleCreateLimit, closeLimit, opFundLimit, opFundReceiver.address]]);
		sale = await upgrades.deployProxy(Sale, [setting.address, nftChecker.address, randomizer.address]);

		//** Setting after deployed */
		await project.connect(superAdmin).setSaleAddress(sale.address);
		await sale.connect(superAdmin).setProjectAddress(project.address);
		await setting.connect(superAdmin).setAdmin(admin.address, true);

		//** Check settings after deployed */
		expect(await project.sale()).to.equal(sale.address);
		expect(await sale.project()).to.equal(project.address);
		expect(await setting.getSuperAdmin()).to.equal(superAdmin.address);
		expect(await setting.isAdmin(admin.address)).to.equal(true);

		WEIGHT_DECIMAL = await sale.WEIGHT_DECIMAL();
		[CASH_0_1, CASH_0_2] = parseEthers([0.1, 0.2]);
		[CASH_00_1, CASH_00_2] = parseEthers([0.01, 0.02]);

		const ownerContract = admin.address;
		const controllerContract = ZERO_ADDRESS;
		await osbFactory.connect(admin).create(true, ownerContract, controllerContract, baseUri, "Token Single", "SIN", admin.address, 1000);
		await osbFactory.connect(admin).create(false, ownerContract, controllerContract, baseUri, "Token Multi", "MUL", admin.address, 1000);

		tokenSingleAdmin = (await osbFactory.tokenInfos(1)).token;
		tokenSingleAdminAttach = await OSB721.attach(tokenSingleAdmin);
		await tokenSingleAdminAttach.connect(admin).mintBatch(admin.address, Array(50).fill(baseUri));
		await tokenSingleAdminAttach.connect(admin).setApprovalForAll(sale.address, true);

		tokenMultiAdmin = (await osbFactory.tokenInfos(2)).token;
		tokenMultiAdminAttach = await OSB1155.attach(tokenMultiAdmin);
		await tokenMultiAdminAttach.connect(admin).mintBatch(admin.address, Array(20).fill(500), Array(20).fill(baseUri));
		await tokenMultiAdminAttach.connect(admin).setApprovalForAll(sale.address, true);

		merkleTree = generateMerkleTree([user1.address]);
		rootHash = merkleTree.getHexRoot();
		hexProofUser1 = hexProof(merkleTree, user1.address);

		//** IDO input */
		saleStart = (await blockTimestamp()) + TEN_MINUTES;
		saleEnd   = saleStart + ONE_DAY;
	});

	describe("1. Create project single => Create sale fixed => Buy => Distribution success", () => {
		before(async () => {
			//** Sale inputs 1 */
			fixedPrices_sale_1 = parseEthers(Array(6).fill(1));

			//** Publish Project 1 with data inputs */ 
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, minSales, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable(genNumbersASC(1, 6), fixedPrices_sale_1),
				{ value: createProjectFee }
			);

			let project_lastedId = await project.lastId();
			await project.connect(admin).setManager(project_lastedId, manager1.address);

			//** Sale inputs 2 */
			fixedPrices_sale_2 = parseEthers([1, 2, 1]);

			//** Publish Project 2 with data inputs */
			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", baseUri, !isPack, isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, minSales, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenSingleAvailable([7, 8, 9], fixedPrices_sale_2),
				{ value: createProjectFee }
			);

			project_lastedId = await project.lastId();

			await project.connect(admin).setManager(project_lastedId, manager2.address);
		});

		it("buy success for sale 1", async () => {
			await setTime(saleStart);

			for (let i = 0; i < fixedPrices_sale_1.length; i++) {
				const sales_id = i + 1;
				await sale.connect(opFundReceiver).setMerkleRoot(sales_id, rootHash);

				const _saleInfo = await sale.sales(sales_id);
				const _projectInfo = await project.getProject(_saleInfo.projectId);

				const royaltyInfo = await sale.getRoyaltyInfo(_saleInfo.projectId, _saleInfo.tokenId, fixedPrices_sale_1[i]);
				let royaltyProfit = royaltyInfo[1];
				let sellerProfit  = 0;
				let supperAdminProfit = 0;

				if (_projectInfo.isCreatedByAdmin) {
					supperAdminProfit = fixedPrices_sale_1[i].sub(royaltyInfo[1]);
				} else {
					supperAdminProfit = fixedPrices_sale_1[i].mul(_projectInfo.profitShare).div(WEIGHT_DECIMAL.mul(100));

					sellerProfit = fixedPrices_sale_1[i].sub(supperAdminProfit);
					if (royaltyInfo[1] > sellerProfit) royaltyProfit = sellerProfit;

					sellerProfit = sellerProfit.sub(royaltyProfit);
				}

				const project_manager1 = await project.getManager(_projectInfo.id);
				expect(manager1.address).to.equals(project_manager1);

				const project_super_admin = await setting.getSuperAdmin();
				expect(superAdmin.address).to.equals(project_super_admin);

				await expect(() =>
					sale.connect(user1).buy(sales_id, hexProofUser1, 1, { value: fixedPrices_sale_1[i] })).to.changeEtherBalances(
						[user1, manager1, superAdmin, admin],
						[fixedPrices_sale_1[i].mul(-1), sellerProfit, supperAdminProfit, royaltyProfit],
						"Incorrect balances of contract and user1"
				);
			}
		});

		it("buy success for sale 2", async () => {
			for (let i = 0; i < fixedPrices_sale_2.length; i++) {
				const sales_id = fixedPrices_sale_1.length + i + 1;
				await sale.connect(opFundReceiver).setMerkleRoot(sales_id, rootHash);

				const _saleInfo = await sale.sales(sales_id);
				const _projectInfo = await project.getProject(_saleInfo.projectId);

				const royaltyInfo = await sale.getRoyaltyInfo(_saleInfo.projectId, _saleInfo.tokenId, fixedPrices_sale_2[i]);
				let royaltyProfit = royaltyInfo[1];
				let sellerProfit = 0;
				let supperAdminProfit = 0;

				if (_projectInfo.isCreatedByAdmin) {
					supperAdminProfit = fixedPrices_sale_2[i].sub(royaltyInfo[1]);
				} else {
					let approval = await project.getApproval(_projectInfo.id);

					supperAdminProfit = fixedPrices_sale_2[i].mul(approval.percent).div(WEIGHT_DECIMAL.mul(100));

					sellerProfit = fixedPrices_sale_2[i].sub(supperAdminProfit);
					if (royaltyInfo[1] > sellerProfit) royaltyProfit = sellerProfit;

					sellerProfit = sellerProfit.sub(royaltyProfit);
				}

				const project_manager1 = await project.getManager(_projectInfo.id);
				expect(manager2.address).to.equals(project_manager1);

				const project_super_admin = await setting.getSuperAdmin();
				expect(superAdmin.address).to.equals(project_super_admin);

				await expect(() => sale.connect(user1).buy(sales_id, hexProofUser1, 1, { value: fixedPrices_sale_2[i] })).to.changeEtherBalances(
						[manager2, superAdmin, admin],
						[0, supperAdminProfit, royaltyProfit],
						"Incorrect balances of contract and user1"
				);
			}
		});
	});

	describe("2. Create project multi => Create sale fixed => Buy => Distribution success", () => {
		before(async () => {
			saleStart = (await blockTimestamp()) + TEN_MINUTES;
			saleEnd   = saleStart + ONE_DAY;

			amounts = [50, 20, 30, 40, 10, 333];
			fixedPrices = parseEthers(Array(6).fill(1));

			sale_lastedId = await sale.lastId();

			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", baseUri, !isPack, !isSingle, isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, minSales, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsFixedWithTokenMultiAvailable(genNumbersASC(1, 6), amounts, fixedPrices),
				{ value: createProjectFee }
			);

			project_lastedId = await project.lastId();
			await project.connect(admin).setManager(project_lastedId, manager3.address);
			expect(await sale.lastId()).to.equal(sale_lastedId.add(amounts.length));
		});


		it("buy multi success for sale", async () => {
			await setTime(Number(saleStart));
            for (let i = 0; i < fixedPrices.length; i++) {
                let sales_id = sale_lastedId.add(i + 1);
                await sale.connect(opFundReceiver).setMerkleRoot(sales_id, rootHash);

                const _saleInfo = await sale.sales(sales_id);
                const _projectInfo = await project.getProject(_saleInfo.projectId);
                const _amount = fixedPrices[i].mul(amounts[i]);
                const royaltyInfo = await sale.getRoyaltyInfo(_saleInfo.projectId, _saleInfo.tokenId, _amount);
                let royaltyProfit = royaltyInfo[1];
                let sellerProfit = 0;
                let supperAdminProfit = 0;

                if (_projectInfo.isCreatedByAdmin) {
                    supperAdminProfit = _amount.sub(royaltyProfit);
                } else {
                    let approval = await project.getApproval(_projectInfo.id);

                    supperAdminProfit = _amount.mul(approval.percent).div(WEIGHT_DECIMAL.mul(100));

                    sellerProfit = _amount.sub(supperAdminProfit);
                    if (royaltyProfit > sellerProfit) royaltyProfit = sellerProfit;

                    sellerProfit = sellerProfit.sub(royaltyProfit);
                }

                const project_manager_3 = await project.getManager(_projectInfo.id);
                expect(manager3.address).to.equals(project_manager_3);

                const project_super_admin = await setting.getSuperAdmin();
                expect(superAdmin.address).to.equals(project_super_admin);

                await expect(() => sale.connect(user1).buy(sales_id, hexProofUser1, amounts[i], { value: _amount })).to.changeEtherBalances(
                    [user1 ,manager3, superAdmin, admin],
                    [_amount.mul(-1), sellerProfit, supperAdminProfit, royaltyProfit],
                    "Incorrect balances of contract and user"
                );
            }
		});
	});

	describe("3. Create project single => Create sale dutch => Buy => Distribution success", () => {
		before(async () => {
			saleStart = (await blockTimestamp()) + TEN_MINUTES;
			saleEnd   = saleStart + ONE_DAY;

			dutchMaxPrices = parseEthers([1, 2, 1]);
			dutchMinPrices = parseEthers([0.1, 0.2, 0.1]);
			priceDecrementAmts = parseEthers([0.01, 0.02, 0.01]);

			const tokenIds = [10, 11, 12];
			sale_lastedId = await sale.lastId();

			await project.connect(admin).publish(
				[tokenSingleAdmin, "", "", baseUri, !isPack, isSingle, !isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, minSales, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenSingleAvailable(tokenIds, dutchMaxPrices, dutchMinPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);

			expect(await sale.lastId()).to.equal(sale_lastedId.add(tokenIds.length));
			project_lastedId = await project.lastId();

			await project.connect(admin).setManager(project_lastedId, manager1.address);
		});

		it("buy success for sale", async () => {
			await setTime(saleStart + 43200);

			for (let i = 0; i < dutchMaxPrices.length; i++) {
				const sales_id = sale_lastedId.add(i + 1);
				const saleInfo = await sale.sales(sales_id);
				const projectInfo = await project.getProject(saleInfo.projectId);
				const _currentDutchPrice = await sale.getCurrentDutchPrice(projectInfo.saleStart, projectInfo.saleEnd, saleInfo.dutchMaxPrice, saleInfo.dutchMinPrice, saleInfo.priceDecrementAmt);
				if(i % 2 == 0) expect(_currentDutchPrice).to.equal(parseEther('0.55'));
				else expect(_currentDutchPrice).to.equal(parseEther('1.1'));

				await sale.connect(opFundReceiver).setMerkleRoot(sales_id, rootHash);

				const _saleInfo = await sale.sales(sales_id);
				const _projectInfo = await project.getProject(_saleInfo.projectId);

				const royaltyInfo = await sale.getRoyaltyInfo(_saleInfo.projectId, _saleInfo.tokenId, _currentDutchPrice);
				let royaltyProfit = royaltyInfo[1];
				let sellerProfit = 0;
				let supperAdminProfit = 0;

				if (_projectInfo.isCreatedByAdmin) {
					supperAdminProfit = _currentDutchPrice.sub(royaltyInfo[1]);
				} else {
					let approval = await project.getApproval(_projectInfo.id);

					supperAdminProfit = _currentDutchPrice.mul(approval.percent).div(WEIGHT_DECIMAL.mul(100));

					sellerProfit = _currentDutchPrice.sub(supperAdminProfit);
					if (royaltyInfo[1] > sellerProfit) royaltyProfit = sellerProfit;

					sellerProfit = sellerProfit.sub(royaltyProfit);
				}

				const project_manager1 = await project.getManager(_projectInfo.id);
				expect(manager1.address).to.equals(project_manager1);

				const project_super_admin = await setting.getSuperAdmin();
				expect(superAdmin.address).to.equals(project_super_admin);

				await expect(() => sale.connect(user1).buy(sales_id, hexProofUser1, 1, { value: dutchMaxPrices[i] })).to.changeEtherBalances(
					[user1, manager1, superAdmin, admin],
					[_currentDutchPrice.mul(-1), sellerProfit, supperAdminProfit, royaltyProfit],
					"Incorrect balances of contract and user1"
				);
			}
		});
	});

	describe("4. Create project multi => Create sale dutch => Buy => Distribution success", () => {
		before(async () => {
			saleStart = (await blockTimestamp()) + TEN_MINUTES;
			saleEnd   = saleStart + ONE_DAY;

			amounts = [50, 20, 30];
			dutchMaxPrices = parseEthers([1, 2, 1]);
			dutchMinPrices = parseEthers([0.1, 0.2, 0.1]);
			priceDecrementAmts = parseEthers([0.01, 0.02, 0.01]);

			sale_lastedId = await sale.lastId();
			
			await project.connect(admin).publish(
				[tokenMultiAdmin, "", "", baseUri, !isPack, !isSingle, !isFixed, isInstantPayment, royaltyReceiver, royaltyFeeNumerator, minSales, fixedPricePack, maxPricePack, minPricePack, priceDecrementAmtPack, profitShareAdmin, saleStart, saleEnd],
				generateInputsDutchWithTokenMultiAvailable(genNumbersASC(1, 3), amounts, dutchMaxPrices, dutchMinPrices, priceDecrementAmts),
				{ value: createProjectFee }
			);
			 
			project_lastedId = await project.lastId();
			await project.connect(admin).setManager(project_lastedId, manager3.address);
			expect(await sale.lastId()).to.equal(sale_lastedId.add(amounts.length));
		});

		it("buy multi success for sale", async () => {
			await setTime(Number(saleStart + 43200));
			for (let i = 0; i < amounts.length; i++) {
				let sales_id = sale_lastedId.add(i + 1);
				const saleInfo = await sale.sales(sales_id);
				const projectInfo = await project.getProject(saleInfo.projectId);
				const _currentDutchPrice = await sale.getCurrentDutchPrice(projectInfo.saleStart, projectInfo.saleEnd, saleInfo.dutchMaxPrice, saleInfo.dutchMinPrice, saleInfo.priceDecrementAmt);
				if(i % 2 == 0) expect(_currentDutchPrice).to.equal(parseEther('0.55'));
				else expect(_currentDutchPrice).to.equal(parseEther('1.1'));

				const _amount = _currentDutchPrice.mul(amounts[i]);

				await sale.connect(opFundReceiver).setMerkleRoot(sales_id, rootHash);

				const _saleInfo = await sale.sales(sales_id);
				const _projectInfo = await project.getProject(_saleInfo.projectId);

				const royaltyInfo = await sale.getRoyaltyInfo(_saleInfo.projectId, _saleInfo.tokenId, _amount);
				let royaltyProfit = royaltyInfo[1];
				let sellerProfit = 0; 
				let supperAdminProfit = 0;

				if (_projectInfo.isCreatedByAdmin) {
					supperAdminProfit = _amount.sub(royaltyProfit);
				} else {
					let approval = await project.getApproval(_projectInfo.id);

					supperAdminProfit = _amount.mul(approval.percent).div(WEIGHT_DECIMAL.mul(100));

					sellerProfit = _amount.sub(supperAdminProfit);
					if (royaltyProfit > sellerProfit) royaltyProfit = sellerProfit;

					sellerProfit = sellerProfit.sub(royaltyProfit);
				}

				const project_manager_3 = await project.getManager(_projectInfo.id);
				expect(manager3.address).to.equals(project_manager_3);

				const project_super_admin = await setting.getSuperAdmin();
				expect(superAdmin.address).to.equals(project_super_admin);

				await expect(() => sale.connect(user1).buy(sales_id, hexProofUser1, amounts[i], { value: dutchMaxPrices[i].mul(amounts[i]) })).to.changeEtherBalances(
					[user1, manager3, superAdmin, admin],
					[_amount.mul(-1), sellerProfit, supperAdminProfit, royaltyProfit],
					"Incorrect balances of contract and user"
				);
			}
		});
	});
});
