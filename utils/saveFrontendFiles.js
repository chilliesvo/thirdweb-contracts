module.exports = contractAddresses => {
  const fs = require("fs");
  const contractsDir = __dirname + "/.." + "/.." + "/client/src/contract";

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir);
  }

  // fs.writeFileSync("contracts.json", JSON.stringify(contractAddresses));

  fs.writeFileSync(
    contractsDir + "/address-" + contractAddresses.chainId + ".json",
    JSON.stringify(contractAddresses, null, 2)
  );

  const ProjectArtifacts = artifacts.readArtifactSync("Project");
  fs.writeFileSync(
    contractsDir + "/project.json",
    JSON.stringify(ProjectArtifacts, null, 2)
  );

  const Sale = artifacts.readArtifactSync("Sale");
  fs.writeFileSync(contractsDir + "/sale.json", JSON.stringify(Sale, null, 2));

  const OSBFactory = artifacts.readArtifactSync("OSBFactory");
  fs.writeFileSync(
    contractsDir + "/osb-factory.json",
    JSON.stringify(OSBFactory, null, 2)
  );

  const OSB721 = artifacts.readArtifactSync("OSB721");

  fs.writeFileSync(
    contractsDir + "/single.json",
    JSON.stringify(OSB721, null, 2)
  );

  const OSB1155 = artifacts.readArtifactSync("OSB1155");

  fs.writeFileSync(
    contractsDir + "/multi.json",
    JSON.stringify(OSB1155, null, 2)
  );

  const Gift = artifacts.readArtifactSync("Gift");
  fs.writeFileSync(contractsDir + "/gift.json", JSON.stringify(Gift, null, 2));

  const Setting = artifacts.readArtifactSync("Setting");
  fs.writeFileSync(
    contractsDir + "/setting.json",
    JSON.stringify(Setting, null, 2)
  );

  const OSBSoul = artifacts.readArtifactSync("OSBSoul");
  fs.writeFileSync(
    contractsDir + "/osb-soul.json",
    JSON.stringify(OSBSoul, null, 2)
  );

  const OSB721PublicMint = artifacts.readArtifactSync("OSB721PublicMint");
  fs.writeFileSync(
    contractsDir + "/public-single.json",
    JSON.stringify(OSB721PublicMint, null, 2)
  );

  const OSB1155PublicMint = artifacts.readArtifactSync("OSB1155PublicMint");
  fs.writeFileSync(
    contractsDir + "/public-multi.json",
    JSON.stringify(OSB1155PublicMint, null, 2)
  );
};
