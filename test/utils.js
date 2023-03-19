const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const Big = require("big.js");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const { expect } = require("chai");
const keccak256 = require("keccak256");

const blockTimestamp = async () => {
  return (await ethers.provider.getBlock()).timestamp;
} 

const weiToEther = (weiValue) => {
  return ethers.utils.formatEther(weiValue);
}

const skipTime = async (seconds) => {
  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");
};

const setTime = async (time) => {
  await network.provider.send("evm_setNextBlockTimestamp", [time])
  await network.provider.send("evm_mine")
};

const sleep = async (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const getProfit = (pool, days, deposedCash, round) => {
  return Big((pool + 2) ** (1 / 365))
    .pow(days)
    .minus(1)
    .times(deposedCash)
    .round(round ? round : 18)
    .toString();
};

const getProfitRoot = (pool, days, deposedCash, round) => {
  return Big((pool + 2) ** (1 / 365))
    .pow(days)
    .times(deposedCash)
    .round(round ? round : 18)
    .toString();
};

const skipBlock = async (blockNumber) => {
  for (let index = 0; index < blockNumber; index++) {
    await hre.ethers.provider.send('evm_mine');
  }
};

const getCurrentBlock = async () => {
  const latestBlock = await hre.ethers.provider.getBlock("latest");
  return latestBlock.number;
};

const getBalance = async (address) => {
  return ethers.provider.getBalance(address);
}

const getEstimateGas = async (transactionData) => {
  return ethers.provider.estimateGas({ data: transactionData });
}

const getCostGasDeployed = async (transactionData) => {
  const gasUsed = await ethers.provider.estimateGas({ data: transactionData.deployTransaction.data });
  const gasPrice = transactionData.deployTransaction.gasPrice;
  return gasUsed.mul(gasPrice);
}

const formatEther = (weiValue) => {
  return ethers.utils.formatEther(weiValue);
}

const parseEther = (number) => {
  number = isNaN(number) ? number : number.toString();
  return ethers.utils.parseEther(number);
}

const sendNativeCoinFrom = async (fromSigner, toAddress, value) => {
  await fromSigner.sendTransaction({
    to: toAddress,
    value: parseEther(value),
  });
}

const burnNativeCoinFrom = async (fromSigner, value) => {
  await fromSigner.sendTransaction({
    to: ZERO_ADDRESS,
    value: parseEther(value),
  });
}

const parseEthers = (numbers) => {
  return numbers.map(number => ethers.utils.parseEther(number.toString()));
}

const generateMerkleTree = (whiteList) => {
	const leafNodes = whiteList.map(addr => keccak256(addr));
	const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });
	return merkleTree;
}

const hexProof = (merkleTree, walletAddr) => {
	return merkleTree.getHexProof(keccak256(walletAddr));
}

const checkOwnerOfWallets = async (token, tokenIds, accounts) => {
  if (tokenIds.length !== accounts.length) throw "checkOwnerOfWallets: tokenIds and accounts length mismatch";
  for (let i = 0; i < tokenIds.length; i++) {
    expect(await token.ownerOf(tokenIds[i])).to.equal(accounts[i]);
  }
}

const checkBalanceOfWallets = async (token, accounts, tokenIds, balances) => {
  if (tokenIds.length !== accounts.length) throw "checkBalanceOfWallets: tokenIds and accounts length mismatch";
  if (tokenIds.length !== balances.length) throw "checkBalanceOfWallets: tokenIds and balances length mismatch";
  for (let i = 0; i < tokenIds.length; i++) {
    expect(await token.balanceOf(accounts[i], tokenIds[i])).to.equal(balances[i]);
  }
}

const checkTokenURIs = async (token, tokenIds, uris) => {
  if (tokenIds.length !== uris.length) throw "checkTokenURIs: tokenIds and uris length mismatch";
  await Promise.all(tokenIds.map(async (tokenId, index) => expect(await token.tokenURI(tokenId)).to.equal(uris[index])));
}

const genNumbersASC = (_from, _to) => {
  if (_from < 0) throw "genNumbersASC: _startTo must be equal 0 or bigger 0";
  if (_to <= _from) throw "genNumbersASC: _from must be bigger _startTo";
  return Array((_to - _from) + 1).fill().map((_, index) => index + _from);
} 

module.exports = {
  ZERO_ADDRESS,
  blockTimestamp,
  skipTime,
  setTime,
  getProfit,
  getProfitRoot,
  skipBlock,
  getCurrentBlock,
  weiToEther,
  parseEther,
  parseEthers,
  generateMerkleTree,
  hexProof,
  checkOwnerOfWallets,
  checkBalanceOfWallets,
  checkTokenURIs,
  genNumbersASC,
  formatEther,
  getBalance,
  sendNativeCoinFrom,
  burnNativeCoinFrom,
  getEstimateGas,
  getCostGasDeployed,
  sleep
}