//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "./IProject.sol";

interface ISale {
    function getSalesProject(uint256 projectId) external view returns (SaleInfo[] memory);
    function getSaleIdsOfProject(uint256 _projectId) external view returns (uint256[] memory);
    function getBuyers(uint256 _saleId) external view returns (address[] memory);
    function setCloseSale(uint256 _saleId) external;
    function resetAmountSale(uint256 _saleId) external;
    function approveForAll(address _token) external;
    function close(uint256 closeLimit, ProjectInfo memory _project, SaleInfo memory _sale, uint256 _totalBuyersWaitingClose, bool _isGive) external returns (uint256);
    function createSale(address _caller, bool _isCreateNewToken, bool _isSetRoyalty, ProjectInfo memory _project, SaleInput memory _saleInput) external returns (uint256);
    function getSaleById(uint256 _saleId) external view returns (SaleInfo memory);
    function getSaleNotCloseLength(uint256 _projectId) external view returns (uint256);
    function getSaleIdNotCloseByIndex(uint256 _projectId, uint256 _index) external view returns (uint256);
}

struct SaleInfo {
    uint256 id;
    uint256 projectId;
    address token;
    uint256 tokenId;
    uint256 fixedPrice;
    uint256 dutchMaxPrice;
    uint256 dutchMinPrice;
    uint256 priceDecrementAmt;
    uint256 amount;
    bool isSoldOut;
    bool isClose;
}

struct Bill {
    uint256 saleId;
    address account;
    address royaltyReceiver;
    uint256 royaltyFee;
    uint256 superAdminFee;
    uint256 sellerFee;
    uint256 amount;
}

struct SaleInput {
    uint256 tokenId;
    uint256 amount;
    string  tokenUri;
    address royaltyReceiver;
    uint96  royaltyFeeNumerator;
    uint256 fixedPrice;
    uint256 maxPrice;
    uint256 minPrice;
    uint256 priceDecrementAmt;
}