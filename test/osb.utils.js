const { ZERO_ADDRESS, hexProof } = require("./utils");

const PROJECT_STATUS = {
	INACTIVE: 0,
	STARTED: 1,
	ENDED: 2,
};

const WEIGHT_DECIMAL = 1e6;

const importContractABIs = (project, sale, osbFactory) => {
	_project = project;
	_sale = sale;
	_osbFactory = osbFactory;
}

const generateInputsFixedWithTokenSingleNotAvailable = (amountOfMint, tokenUris, fixedPrices) => {
	if (amountOfMint !== tokenUris.length) throw "generateInputsFixedWithTokenSingleNotAvailable: amountOfMint and tokenUris length mismatch";
	if (amountOfMint !== fixedPrices.length) throw "generateInputsFixedWithTokenSingleNotAvailable: amountOfMint and fixedPrices length mismatch";
	return _generateInputsSale(true, true, tokenUris, amountOfMint, [], [], [], [], fixedPrices);
}

const generateInputsFixedWithTokenSingleRoyalty = (amountOfMint, tokenUris, royaltyReceivers, royaltyFeeNumerators, fixedPrices) => {
	if (amountOfMint !== tokenUris.length) throw "generateInputsFixedWithTokenSingleRoyalty: amountOfMint and tokenUris length mismatch";
	if (amountOfMint !== royaltyReceivers.length) throw "generateInputsFixedWithTokenSingleRoyalty: amountOfMint and royaltyReceivers length mismatch";
	if (amountOfMint !== royaltyFeeNumerators.length) throw "generateInputsFixedWithTokenSingleRoyalty: amountOfMint and royaltyFeeNumerators length mismatch";
	if (amountOfMint !== fixedPrices.length) throw "generateInputsFixedWithTokenSingleRoyalty: amountOfMint and fixedPrices length mismatch";
	return _generateInputsSale(true, true, tokenUris, amountOfMint, [], [], royaltyReceivers, royaltyFeeNumerators, fixedPrices);
}

const generateInputsFixedWithTokenSingleAvailable = (tokenIds, fixedPrices) => {
	if (tokenIds.length !== fixedPrices.length) throw "generateInputsFixedWithTokenSingleAvailable: tokenIds and fixedPrices length mismatch";
	return _generateInputsSale(true, true, Array(tokenIds.length).fill(""), 0, tokenIds, [], [], [], fixedPrices);
}

const generateInputsFixedWithTokenMultiNotAvailable = (amounts, tokenUris, fixedPrices) => {
	if (amounts.length !== tokenUris.length) throw "generateInputsFixedWithTokenMultiNotAvailable: amounts and tokenUris length mismatch";
	if (amounts.length !== fixedPrices.length) throw "generateInputsFixedWithTokenMultiNotAvailable: amounts and fixedPrices length mismatch";
	return _generateInputsSale(false, true, tokenUris, 0, [], amounts, [], [], fixedPrices);
}

const generateInputsFixedWithTokenMultiRoyalty = (amounts, tokenUris, royaltyReceivers, royaltyFeeNumerators, fixedPrices) => {
	if (amounts.length !== tokenUris.length) throw "generateInputsFixedWithTokenMultiRoyalty: amounts and tokenUris length mismatch";
	if (amounts.length !== royaltyReceivers.length) throw "generateInputsFixedWithTokenMultiRoyalty: amounts and royaltyReceivers length mismatch";
	if (amounts.length !== royaltyFeeNumerators.length) throw "generateInputsFixedWithTokenMultiRoyalty: amounts and royaltyFeeNumerators length mismatch";
	if (amounts.length !== fixedPrices.length) throw "generateInputsFixedWithTokenMultiRoyalty: amounts and fixedPrices length mismatch";
	return _generateInputsSale(false, true, tokenUris, 0, [], amounts, royaltyReceivers, royaltyFeeNumerators, fixedPrices);
}

const generateInputsFixedWithTokenMultiAvailable = (tokenIds, amounts, fixedPrices) => {
	if (tokenIds.length !== amounts.length) throw "generateInputsFixedWithTokenMultiAvailable: tokenIds and amounts length mismatch";
	if (tokenIds.length !== fixedPrices.length) throw "generateInputsFixedWithTokenMultiAvailable: tokenIds and fixedPrices length mismatch";
	return _generateInputsSale(false, true, Array(tokenIds.length).fill(""), 0, tokenIds, amounts, [], [], fixedPrices);
}

const generateInputsDutchWithTokenSingleNotAvailable = (amountOfMint, tokenUris, maxPrices, minPrices, priceDecrementAmts) => {
	if (amountOfMint !== tokenUris.length) throw "generateInputsDutchWithTokenSingleNotAvailable: amountOfMint and maxPrices length mismatch";
	if (amountOfMint !== maxPrices.length) throw "generateInputsDutchWithTokenSingleNotAvailable: amountOfMint and maxPrices length mismatch";
	if (amountOfMint !== minPrices.length) throw "generateInputsDutchWithTokenSingleNotAvailable: amountOfMint and minPrices length mismatch";
	if (amountOfMint !== priceDecrementAmts.length) throw "generateInputsDutchWithTokenSingleNotAvailable: amountOfMint and priceDecrementAmts length mismatch";
	return _generateInputsSale(true, false, tokenUris, amountOfMint, ...(Array(5).fill([])), maxPrices, minPrices, priceDecrementAmts);
}

const generateInputsDutchWithTokenSingleRoyalty = (amountOfMint, tokenUris, royaltyReceivers, royaltyFeeNumerators, maxPrices, minPrices, priceDecrementAmts) => {
	if (amountOfMint !== tokenUris.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and tokenUris length mismatch";
	if (amountOfMint !== royaltyReceivers.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and royaltyReceivers length mismatch";
	if (amountOfMint !== royaltyFeeNumerators.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and royaltyFeeNumerators length mismatch";
	if (amountOfMint !== maxPrices.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and maxPrices length mismatch";
	if (amountOfMint !== minPrices.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and minPrices length mismatch";
	if (amountOfMint !== priceDecrementAmts.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and priceDecrementAmts length mismatch";
	return _generateInputsSale(true, false, tokenUris, amountOfMint, [], [], royaltyReceivers, royaltyFeeNumerators, [], maxPrices, minPrices, priceDecrementAmts);
}

const generateInputsDutchWithTokenSingleAvailable = (tokenIds, maxPrices, minPrices, priceDecrementAmts) => {
	if (tokenIds.length !== maxPrices.length) throw "generateInputsDutchWithTokenSingleAvailable: tokenIds and maxPrices length mismatch";
	if (tokenIds.length !== minPrices.length) throw "generateInputsDutchWithTokenSingleAvailable: tokenIds and minPrices length mismatch";
	if (tokenIds.length !== priceDecrementAmts.length) throw "generateInputsDutchWithTokenSingleAvailable: tokenIds and priceDecrementAmts length mismatch";
	return _generateInputsSale(true, false, Array(tokenIds.length).fill(""), 0, tokenIds, [], [], [], [], maxPrices, minPrices, priceDecrementAmts);
}

const generateInputsDutchWithTokenMultiNotAvailable = (amounts, tokenUris, maxPrices, minPrices, priceDecrementAmts) => {
	if (amounts.length !== tokenUris.length) throw "generateInputsDutchWithTokenMultiNotAvailable: amounts and tokenUris length mismatch";
	if (amounts.length !== maxPrices.length) throw "generateInputsDutchWithTokenMultiNotAvailable: amounts and maxPrices length mismatch";
	if (amounts.length !== minPrices.length) throw "generateInputsDutchWithTokenMultiNotAvailable: amounts and minPrices length mismatch";
	if (amounts.length !== priceDecrementAmts.length) throw "generateInputsDutchWithTokenMultiNotAvailable: amounts and priceDecrementAmts length mismatch";
	return _generateInputsSale(false, false, tokenUris, 0, [], amounts, ...(Array(3).fill([])), maxPrices, minPrices, priceDecrementAmts);
}

const generateInputsDutchWithTokenMultiRoyalty = (amounts, tokenUris, royaltyReceivers, royaltyFeeNumerators, maxPrices, minPrices, priceDecrementAmts) => {
	if (amounts.length !== tokenUris.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and tokenUris length mismatch";
	if (amounts.length !== royaltyReceivers.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and royaltyReceivers length mismatch";
	if (amounts.length !== royaltyFeeNumerators.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and royaltyFeeNumerators length mismatch";
	if (amounts.length !== maxPrices.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and maxPrices length mismatch";
	if (amounts.length !== minPrices.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and minPrices length mismatch";
	if (amounts.length !== priceDecrementAmts.length) throw "generateInputsDutchWithTokenSingleRoyalty: amountOfMint and priceDecrementAmts length mismatch";
	return _generateInputsSale(false, false, tokenUris, 0, [], amounts, royaltyReceivers, royaltyFeeNumerators, [], maxPrices, minPrices, priceDecrementAmts);
}

const generateInputsDutchWithTokenMultiAvailable = (tokenIds, amounts, maxPrices, minPrices, priceDecrementAmts) => {
	if (tokenIds.length !== amounts.length) throw "generateInputsDutchWithTokenMultiAvailable: tokenIds and amounts length mismatch";
	if (tokenIds.length !== maxPrices.length) throw "generateInputsDutchWithTokenMultiAvailable: tokenIds and maxPrices length mismatch";
	if (tokenIds.length !== minPrices.length) throw "generateInputsDutchWithTokenMultiAvailable: tokenIds and minPrices length mismatch";
	if (tokenIds.length !== priceDecrementAmts.length) throw "generateInputsDutchWithTokenMultiAvailable: tokenIds and priceDecrementAmts length mismatch";
	return _generateInputsSale(false, false, Array(tokenIds.length).fill(""), 0, tokenIds, amounts, [], [], [], maxPrices, minPrices, priceDecrementAmts);
}

const _generateInputsSale = (isSingle, isFixed, tokenUris, amountOfMint, tokenIds, amounts, royaltyReceivers, royaltyFeeNumerators, fixedPrices, maxPrices, minPrices, priceDecrementAmts) => {
	if (amountOfMint > 0) tokenIds = Array(amountOfMint).fill(0);
	else if (amounts.length > 0 && tokenIds.length === 0 ) tokenIds = Array(amounts.length).fill(0);

	if (royaltyReceivers.length === 0) {
		royaltyReceivers = Array(tokenIds.length).fill(ZERO_ADDRESS);
		royaltyFeeNumerators = Array(tokenIds.length).fill(0);
	}

	if (isFixed) {
		return tokenIds.map((id, i) => [id, isSingle ? 1 : amounts[i], tokenUris[i], royaltyReceivers[i], royaltyFeeNumerators[i], fixedPrices[i], 0, 0, 0]);
	} else {
		return tokenIds.map((id, i) => [id, isSingle ? 1 : amounts[i], tokenUris[i], royaltyReceivers[i], royaltyFeeNumerators[i], 0, maxPrices[i], minPrices[i], priceDecrementAmts[i]]);
	}
}

const setMerkleRoots = async (caller, saleIds, rootHashes) => {
	if (!caller) throw "setMerkleRoots: caller not null";
	if (saleIds.length !== rootHashes.length) throw "setMerkleRoots: saleIds and rootHashes length mismatch";
	for (let i = 0; i < saleIds.length; i++) {
		await sale.connect(caller).setMerkleRoot(saleIds[i], rootHashes[i]);
	}
}

const buys = async (saleIds, accounts, merkleTrees, prices, amounts) => {
	for (let i = 0; i < saleIds.length; i++) {
		await sale.connect(accounts[i]).buy(saleIds[i], hexProof(merkleTrees[i], accounts[i].address), amounts[i], { value: prices[i] });
	}
}

const getProfitSuperAdmin = (price, percent, WEIGHT_DECIMAL) => {
	const userFee = price.sub(price.mul(percent).div(100 * WEIGHT_DECIMAL));
	const adminFee = price.mul(percent).div(100 * WEIGHT_DECIMAL);
	return [adminFee, userFee];
}

// ============ PROJECT-ONLY SHOW FUNCTIONS =============
const getProjectStatus = async (projectId) => {
	const projectInfo = await project.getProject(projectId);
	return projectInfo.status;
}

const getSaleTimeStart = async (projectId) => {
	const projectInfo = await project.getProject(projectId);
	return projectInfo.saleStart;
}

const getSaleTimeEnd = async (projectId) => {
	const projectInfo = await project.getProject(projectId);
	return projectInfo.saleEnd;
}

const getSoldAmountFromProject = async (projectId) => {
	const projectInfo = await project.getProject(projectId);
	return projectInfo.sold;
}

// ============ SALE-ONLY SHOW FUNCTIONS =============
const saleIsClosed = async (saleId) => {
	const saleInfo = await sale.getSaleById(saleId);
	return saleInfo.isClose;
}

const getSaleAmount = async (saleId) => {
	const saleInfo = await sale.getSaleById(saleId);
	return saleInfo.amount;
}

const getTokenIdsBySaleIds = async (saleIds) => {
	const tokenIds = [];
	for (let i = 0; i < saleIds.length; i++) {
		const tokenId = (await sale.sales(saleIds[i])).tokenId;
		tokenIds.push(Number(tokenId));
	}
	return tokenIds;
}

// ============ OTHER FUNCTIONS =============
const getRoyaltyFee = (salePrice, percentRoyalty) => {
	return (salePrice.mul(percentRoyalty)).div(100).div(100);
}

const getSaleIdsNotClosedByProjectId = async (projectId) => {
	const saleInfos = await sale.getSalesProject(projectId);
	return saleInfos.filter(sale => sale.isClose == false).map(sale => Number(sale.id));
}

const getSalesHaveBuyerWaitingClose = async (projectId) => {
	const saleIdsNotClosed = await getSaleIdsNotClosedByProjectId(projectId);
	let salesNotClosed = saleIdsNotClosed.map(async saleId => {
		const buyersWaiting = await sale.getBuyersWaitingToTokens(saleId);
		return { id: saleId, buyersWaiting };
	});
	salesNotClosed = await Promise.all(salesNotClosed);
	return salesNotClosed.filter(sale => sale.buyersWaiting.length > 0);
}

const countNumberOfCloses = async (projectId) => {
	const totalSalesNotClose = Number(await project.getTotalSalesNotClose(projectId));
	const totalBuyersWaiting = Number(await project.getTotalBuyersWaitingToToken(projectId));
	const closeLimit = Number(await project.closeLimit());
	return Math.ceil((totalSalesNotClose + totalBuyersWaiting) / closeLimit);
}

module.exports = {
	PROJECT_STATUS,
	WEIGHT_DECIMAL,
	importContractABIs,
	generateInputsFixedWithTokenSingleNotAvailable,
	generateInputsFixedWithTokenSingleRoyalty,
	generateInputsFixedWithTokenSingleAvailable,
	generateInputsFixedWithTokenMultiNotAvailable,
	generateInputsFixedWithTokenMultiRoyalty,
	generateInputsFixedWithTokenMultiAvailable,
	generateInputsDutchWithTokenSingleNotAvailable,
	generateInputsDutchWithTokenSingleRoyalty,
	generateInputsDutchWithTokenSingleAvailable,
	generateInputsDutchWithTokenMultiNotAvailable,
	generateInputsDutchWithTokenMultiRoyalty,
	generateInputsDutchWithTokenMultiAvailable,
	setMerkleRoots,
	buys,
	getSoldAmountFromProject,
	getProfitSuperAdmin,
	getRoyaltyFee,
	getSaleIdsNotClosedByProjectId,
	getProjectStatus,
	countNumberOfCloses,
	getSalesHaveBuyerWaitingClose,
	getSaleTimeStart,
	getSaleTimeEnd,
	saleIsClosed,
	getSaleAmount,
	getTokenIdsBySaleIds
}
