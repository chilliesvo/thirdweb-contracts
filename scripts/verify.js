const { run } = require("hardhat");
const contracts = require("../contracts.json");

async function main() {
  const jobs = [
    run("verify:verify", {
      address: contracts.projectVerify,
    }),
    run("verify:verify", {
      address: contracts.saleVerify,
    }),
    run("verify:verify", {
      address: contracts.nftCheckerVerify,
      contract: "contracts/utils/NFTChecker.sol:NFTChecker",
    }),
    run("verify:verify", {
      address: contracts.osb721,
    }),
    run("verify:verify", {
      address: contracts.osb1155,
    }),
    run("verify:verify", {
      address: contracts.osbFactoryVerify,
    }),
    run("verify:verify", {
      address: contracts.giftVerify,
    }),
    run("verify:verify", {
      address: contracts.settingVerify,
    }),
    run("verify:verify", {
      address: contracts.osbSoulVerify,
    }),
    run("verify:verify", {
      address: contracts.osb721PublicMintVerify,
    }),
    run("verify:verify", {
      address: contracts.osb1155PublicMintVerify,
    })
  ]

  await Promise.all(jobs.map(job => job.catch(console.log)));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
