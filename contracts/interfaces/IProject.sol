//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface IProject {
    function isManager(uint256 _projectId, address _account) external view returns (bool);
    function opFundReceiver() external view returns (address);
    function getMerkleRoots(uint256 _projectId) external view returns (bytes32);
    function getProject(uint256 _projectId) external view returns (ProjectInfo memory);
    function getManager(uint256 _projectId) external view returns (address);
    function getTotalBuyersWaitingDistribution(uint256 _projectId) external view returns (uint256);
    function addTotalBuyersWaitingDistribution (uint256 _projectId) external;
    function setSoldQuantityToProject(uint256 _projectId, uint256 _quantity) external;
    function end(uint256 _projectId) external;
}

struct ProjectInfo {
    uint256 id;
    bool isCreatedByAdmin;
    bool isInstantPayment;
    bool isPack;
    bool isSingle;
    bool isFixed;
    bool isFlashSale;
    address manager;
    address token;
    uint256 amount;
    uint256 minSales;
    uint256 sold;
    uint256 profitShare;
    uint256 saleStart;
    uint256 saleEnd;
    ProjectStatus status;
}

struct InitializeInput {
    address setting;
    address nftChecker;
    address osbFactory;
    address osbSoul;
    uint256 createProjectFee;
    uint256 profitShareMinimum;
    uint256 saleCreateLimit;
    uint256 closeLimit;
    uint256 opFundLimit;
    address opFundReceiver;
}

struct ProjectInput {
    address token;
    string tokenName;
    string tokenSymbol;
    string contractUri;
    bool isPack;
    bool isSingle;
    bool isFixed;
    bool isFlashSale;
    bool isInstantPayment;
    address royaltyReceiver;
    uint96 royaltyFeeNumerator;
    uint256 maxTotalSupply;
    uint256 minSales;
    uint256 fixedPricePack;
    uint256 maxPricePack;
    uint256 minPricePack;
    uint256 priceDecrementAmtPack;
    uint256 profitShare;
    uint256 saleStart;
    uint256 saleEnd;
}

struct PaymentInput {
    address buyTo;
    bool isCreatedByAdmin;
    bool isInstantPayment;
    uint256 projectId;
    uint256 saleId;
    uint256 tokenId;
    uint256 minSales;
    uint256 profitShare;
    uint256 amount;
    uint256 payAmount;
}

enum ProjectStatus {
    INACTIVE,
    STARTED,
    ENDED
}