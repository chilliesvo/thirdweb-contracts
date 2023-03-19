const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("./utils");

describe('Randomizer', () => { 
    beforeEach(async () => {
		[deployer, superAdmin, admin, user1, user2,...accounts] = await ethers.getSigners();

		const Setting = await ethers.getContractFactory("Setting");
		const Randomizer = await ethers.getContractFactory("Randomizer");
		setting = await upgrades.deployProxy(Setting, [superAdmin.address]);

        await expect(Randomizer.deploy(ZERO_ADDRESS)).to.revertedWith("Invalid setting address");
		randomizer = await Randomizer.deploy(setting.address);

    });

    describe("setAdmin", () => {
        it("Should revert with Only supper admin", async () => {
            await expect(randomizer.connect(deployer).setAdmin(user1.address, true)).to.revertedWith("Only supper admin");
            await expect(randomizer.connect(admin).setAdmin(user1.address, true)).to.revertedWith("Only supper admin");
            await expect(randomizer.connect(user1).setAdmin(user1.address, true)).to.revertedWith("Only supper admin");
        });

        it("Should revert with Invalid address", async () => {
            await expect(randomizer.connect(superAdmin).setAdmin(ZERO_ADDRESS, true)).to.revertedWith("Invalid address");
        });

        it("Should setAdmin successfully", async () => {
            await expect(randomizer.connect(superAdmin).setAdmin(admin.address, true)).to.emit(randomizer, "AdminChanged").withArgs(admin.address, true);
            expect(await randomizer.admins(admin.address)).to.be.true;
        })
    })

    describe('getRandomNumber', () => { 
        beforeEach(async () => {
            await randomizer.connect(superAdmin).setAdmin(admin.address, true);
        })

        it("Should revert with Not admin or owner", async () => {
            await expect(randomizer.connect(superAdmin).getRandomNumber()).to.revertedWith("RandomizerCL: Not admin or owner");
            await expect(randomizer.connect(user1).getRandomNumber()).to.revertedWith("RandomizerCL: Not admin or owner");
            await expect(randomizer.connect(deployer).getRandomNumber()).to.revertedWith("RandomizerCL: Not admin or owner");
        })
    })

    describe('random', () => { 
        it("Should revert with Not admin or owner", async () => {
            await expect(randomizer.connect(superAdmin).random(100)).to.revertedWith("RandomizerCL: Not admin or owner");
            await expect(randomizer.connect(user1).random(100)).to.revertedWith("RandomizerCL: Not admin or owner");
            await expect(randomizer.connect(deployer).random(100)).to.revertedWith("RandomizerCL: Not admin or owner");
        })
     })
 })