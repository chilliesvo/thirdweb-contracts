const { ethers, upgrades } = require("hardhat");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

describe("Setting", () => {
    beforeEach(async () => {
        //** Get Wallets */
        [deployer, superAdmin, admin, controller, user1] = await ethers.getSigners();

        //** Get Contracts */
        const Setting = await ethers.getContractFactory("Setting");

        //** Deploy params */
        opFundReceiver = deployer;

        //** Deploy Contracts with Proxy to upgrade contract in future */
        await expect(upgrades.deployProxy(Setting, [ZERO_ADDRESS])).to.revertedWith("Invalid owner");
        setting = await upgrades.deployProxy(Setting, [superAdmin.address]);

        //** Setting after deployed */
        await setting.connect(superAdmin).setAdmin(admin.address, true);
        await setting.connect(superAdmin).setController(controller.address, true);

        //** Check settings after deployed */
        expect(await setting.getSuperAdmin()).to.equal(superAdmin.address);
        expect(await setting.owner()).to.equal(superAdmin.address);
        expect(await setting.isSuperAdmin(superAdmin.address)).to.equal(true);
        expect(await setting.isAdmin(superAdmin.address)).to.equal(true);
        expect(await setting.isAdmin(admin.address)).to.equal(true);
        expect(await setting.isController(controller.address)).to.equal(true);
    });

    describe("checkOnlySuperAdmin", () => {
        it("Should exception `Caller is not the super admin`", async () => {
            await expect(setting.checkOnlySuperAdmin(admin.address)).to.revertedWith("Caller is not the super admin");
            await expect(setting.checkOnlySuperAdmin(deployer.address)).to.revertedWith("Caller is not the super admin");
            await expect(setting.checkOnlySuperAdmin(controller.address)).to.revertedWith("Caller is not the super admin");
            await expect(setting.checkOnlySuperAdmin(user1.address)).to.revertedWith("Caller is not the super admin");
            await setting.checkOnlySuperAdmin(superAdmin.address);
        });
    })
    
    describe("checkOnlyAdmin", () => {
        it("Should exception `Caller is not the admin`", async () => {
            await expect(setting.checkOnlyAdmin(user1.address)).to.revertedWith("Caller is not the admin");
            await expect(setting.checkOnlyAdmin(controller.address)).to.revertedWith("Caller is not the admin");
            await expect(setting.checkOnlyAdmin(deployer.address)).to.revertedWith("Caller is not the admin");
            await setting.checkOnlyAdmin(superAdmin.address);
            await setting.checkOnlyAdmin(admin.address);
        });
    })

    describe("checkOnlySuperAdminOrController", () => {
        it("Should exception `Caller is not the super admin or controller`", async () => {
            await expect(setting.checkOnlySuperAdminOrController(user1.address)).to.revertedWith("Caller is not the super admin or controller");
            await expect(setting.checkOnlySuperAdminOrController(deployer.address)).to.revertedWith("Caller is not the super admin or controller");
            await expect(setting.checkOnlySuperAdminOrController(admin.address)).to.revertedWith("Caller is not the super admin or controller");
            await setting.checkOnlySuperAdminOrController(superAdmin.address);
            await setting.checkOnlySuperAdminOrController(controller.address);
        });
    })

    describe("checkOnlyController", () => {
        it("Should exception `Caller is not the controller`", async () => {
            await expect(setting.checkOnlyController(superAdmin.address)).to.revertedWith("Caller is not the controller");
            await expect(setting.checkOnlyController(admin.address)).to.revertedWith("Caller is not the controller");
            await expect(setting.checkOnlyController(deployer.address)).to.revertedWith("Caller is not the controller");
            await expect(setting.checkOnlyController(user1.address)).to.revertedWith("Caller is not the controller");
            await setting.checkOnlyController(controller.address);
        });
    })

    describe("setAdmin", () => {
        it("Should exception `Ownable: caller is not the owner`", async () => {
            expect(await setting.isAdmin(user1.address)).to.equal(false);
            await expect(setting.connect(admin).setAdmin(user1.address, true)).to.revertedWith("Ownable: caller is not the owner");
            await expect(setting.connect(deployer).setAdmin(user1.address, true)).to.revertedWith("Ownable: caller is not the owner");
            await expect(setting.connect(user1).setAdmin(user1.address, true)).to.revertedWith("Ownable: caller is not the owner");
            await setting.connect(superAdmin).setAdmin(user1.address, true);
            expect(await setting.isAdmin(user1.address)).to.equal(true);
        });

        it("Should exception `Invalid account`", async () => {
            expect(await setting.isAdmin(user1.address)).to.equal(false);
            await expect(setting.connect(superAdmin).setAdmin(ZERO_ADDRESS, true)).to.revertedWith("Invalid account");
            await setting.connect(superAdmin).setAdmin(user1.address, true);
            expect(await setting.isAdmin(user1.address)).to.equal(true);
        });

        it("Should exception `Account is the owner`", async () => {
            expect(await setting.isAdmin(user1.address)).to.equal(false);
            await expect(setting.connect(superAdmin).setAdmin(superAdmin.address, true)).to.revertedWith("Account is the owner");
            await setting.connect(superAdmin).setAdmin(user1.address, true);
            expect(await setting.isAdmin(user1.address)).to.equal(true);
        });

        it("Should exception `Duplicate setting`", async () => {
            expect(await setting.isAdmin(user1.address)).to.equal(false);
            await setting.connect(superAdmin).setAdmin(user1.address, true);
            expect(await setting.isAdmin(user1.address)).to.equal(true);
            await expect(setting.connect(superAdmin).setAdmin(user1.address, true)).to.revertedWith("Duplicate setting");
        });

        it("Should exception success", async () => {
            expect(await setting.isAdmin(user1.address)).to.equal(false);
            await setting.connect(superAdmin).setAdmin(user1.address, true);
            expect(await setting.isAdmin(user1.address)).to.equal(true);
        });
    })

    describe("setController", () => {
        it("Should exception `Caller is not the owner`", async () => {
            expect(await setting.isController(superAdmin.address)).to.equal(false);
            await expect(setting.connect(admin).setController(superAdmin.address, true)).to.revertedWith("Ownable: caller is not the owner");
            await expect(setting.connect(deployer).setController(superAdmin.address, true)).to.revertedWith("Ownable: caller is not the owner");
            await expect(setting.connect(user1).setController(superAdmin.address, true)).to.revertedWith("Ownable: caller is not the owner");
            await setting.connect(superAdmin).setController(superAdmin.address, true);
            expect(await setting.isController(superAdmin.address)).to.equal(true);
        });

        it("Should exception `Invalid account`", async () => {
            expect(await setting.isController(user1.address)).to.equal(false);
            await expect(setting.connect(superAdmin).setController(ZERO_ADDRESS, true)).to.revertedWith("Invalid account");
            await setting.connect(superAdmin).setController(user1.address, true);
            expect(await setting.isController(user1.address)).to.equal(true);
        });

        it("Should exception `Duplicate setting`", async () => {
            expect(await setting.isController(user1.address)).to.equal(false);
            await setting.connect(superAdmin).setController(user1.address, true);
            expect(await setting.isController(user1.address)).to.equal(true);
            await expect(setting.connect(superAdmin).setController(user1.address, true)).to.revertedWith("Duplicate setting");
        });
        
        it("Should exception success", async () => {
            expect(await setting.isController(user1.address)).to.equal(false);
            await setting.connect(superAdmin).setController(user1.address, true);
            expect(await setting.isController(user1.address)).to.equal(true);
        });
    })
});
