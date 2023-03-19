//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./libraries/Helper.sol";
import "./interfaces/ISetting.sol";
import "./interfaces/IProject.sol";
import "./interfaces/ISale.sol";
import "./interfaces/IOSB721.sol";
import "./interfaces/IOSB1155.sol";
import "./interfaces/INFTChecker.sol";
import "./interfaces/IRandomizer.sol";

contract Sale is ISale, ContextUpgradeable, ReentrancyGuardUpgradeable, ERC721HolderUpgradeable, ERC1155HolderUpgradeable {
    ISetting public setting;
    IProject public project;
    INFTChecker public nftChecker;
    IRandomizer public randomizer;

    uint256 public constant WEIGHT_DECIMAL = 1e6;

    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter public lastId;

    /**
     * @dev Keep track of Sale from sale ID
     */
    mapping(uint256 => SaleInfo) public sales;

    /**
     * @dev Keep track of merkleRoot from sale ID
     */
    mapping(uint256 => bytes32) public merkleRoots;

    /**
     * @dev Keep track of saleIds of Project from project ID
     */
    mapping(uint256 => uint256[]) private saleIdsOfProject;

    /**
     * @dev Keep track of all buyers of Sale from sale ID
     */
    mapping(uint256 => address[]) private buyers;

    /**
     * @dev Keep track of buyers waiting distribution from sale ID
     */
    mapping(uint256 => address[]) private buyersWaitingDistributions;

    /**
     * @dev Check buyer was bought from sale ID and the buyer’s address
     */
    mapping(uint256 => mapping(address => bool)) private bought;

    /**
     * @dev Keep track of bill from saleId and buyer address
     */
    mapping(uint256 => mapping(address => Bill)) private bills;

    /**
     * @dev Keep track of list sales not close from project ID
     */
    mapping(uint256 => EnumerableSetUpgradeable.UintSet) private _saleIdNotCloseOfProject;

    /**
     * @dev Keep track of list current sales Ids in pack from project ID
     */
    mapping(uint256 => EnumerableSetUpgradeable.UintSet) private _currentSalesInPack;

    // ============ EVENTS ============

    /// @dev Emit an event when the contract is deployed
    event ContractDeployed(address indexed setting, address indexed nftChecker);

    /// @dev Emit an event when Project contract address is updated
    event SetProjectAddress(address indexed oldProjectAddress, address indexed newProjectAddress);

    /// @dev Emit an event when Randomizer contract address is updated
    event SetRandomizerAddress(address indexed oldRandomizerAddress, address indexed newRandomizerAddress);

    /// @dev Emit an event when created Sales
    event Creates(uint256 indexed projectId, SaleInfo[] sales);

    /// @dev Emit an event when bought
    event Buy(address indexed buyTo, uint256 indexed saleId, uint256 indexed tokenId, uint256 amount, uint256 percentAdminFee, uint256 adminFee, uint256 royaltyFee, uint256 valueForUser);

    /// @dev Emit an event when the status close a Sale is updated
    event SetCloseSale(uint256 indexed saleId, bool status);

    /// @dev Emit an event when the amount a Sale is reset
    event ResetAmountSale(uint256 indexed saleId, uint256 indexed oldAmount);

    /// @dev Emit an event when the MerkleRoot a Sale is updated
    event SetMerkleRoot(uint256 indexed saleId, bytes32 rootHash);

    /**
     * @notice Setting states initial when deploy contract and only called once
     * @param _setting Setting contract address
     * @param _nftChecker NFTChecker contract address
     */
    function initialize(address _setting, address _nftChecker, address _randomizer) external initializer {
        require(_setting != address(0), "Invalid setting");
        require(_nftChecker != address(0), "Invalid nftChecker");
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
        ERC721HolderUpgradeable.__ERC721Holder_init();
        ERC1155HolderUpgradeable.__ERC1155Holder_init();
        nftChecker = INFTChecker(_nftChecker);
        setting = ISetting(_setting);
        randomizer = IRandomizer(_randomizer);
        emit ContractDeployed(_setting, _nftChecker);
    }

    // ============ ACCESS CONTROL/SANITY MODIFIERS ============

    /**
     * @dev To check caller is super admin
     */
    modifier onlySuperAdmin() {
        setting.checkOnlySuperAdmin(_msgSender());
        _;
    }

    /**
     * @dev To check caller is Project contract
     */
    modifier onlyProject() {
        require(_msgSender() == address(project), "Caller is not the Project");
        _;
    }

    // ============ OWNER-ONLY ADMIN FUNCTIONS =============

    /**
     * @notice
     * Set the new Project contract address
     * Caution need to discuss with the dev before updating the new state
     * 
     * @param _project Project contract address
     */
    function setProjectAddress(address _project) external onlySuperAdmin {
        require(_project != address(0), "Invalid Project address");
        address oldProjectAddress = address(project);
        project = IProject(_project);
        emit SetProjectAddress(oldProjectAddress, _project);
    }

    /**
     * @notice Set the new randomizer contract address
     * @param _randomizer The new contract address
     */
    function setRandomizerAddress(address _randomizer) external onlySuperAdmin {
        require(_randomizer != address(0), "Invalid randomizer address");
        address oldRandomizerAddress = address(randomizer);
        randomizer = IRandomizer(_randomizer);
        emit SetRandomizerAddress(oldRandomizerAddress, _randomizer);
    }

    // ============ PROJECT-ONLY FUNCTIONS =============

    /**
     * @notice Support create sale
     * @param _caller Address user request
     * @param _isCreateNewToken Is create new a token
     * @param _isSetRoyalty Is set royalty for token
     * @param _project Project info
     * @param _saleInput Sale input
     */
    function createSale(address _caller, bool _isCreateNewToken, bool _isSetRoyalty, ProjectInfo memory _project, SaleInput memory _saleInput) external nonReentrant onlyProject returns (uint256) {
        require(_project.isSingle ? _saleInput.amount == 1 : _saleInput.amount > 0, "Invalid amount");
        if (!_project.isFixed) {
            require(_saleInput.maxPrice > _saleInput.minPrice && _saleInput.minPrice > 0, "Invalid price");
            require(_saleInput.priceDecrementAmt > 0 && _saleInput.priceDecrementAmt <= _saleInput.maxPrice - _saleInput.minPrice, "Invalid price");
        }

        lastId.increment();
        uint256 _saleId = lastId.current();

        SaleInfo storage sale = sales[_saleId];
        sale.id = _saleId;
        sale.projectId = _project.id;
        sale.token = _project.token;
        sale.tokenId = _saleInput.tokenId;
        sale.amount = _saleInput.amount;
        sale.dutchMaxPrice = _saleInput.maxPrice;
        sale.dutchMinPrice = _saleInput.minPrice;
        sale.priceDecrementAmt = _saleInput.priceDecrementAmt;
        sale.fixedPrice = _saleInput.fixedPrice;

        if (_project.isPack) {
            //slither-disable-next-line unused-return
            _currentSalesInPack[_project.id].add(_saleId);
        }

        saleIdsOfProject[_project.id].push(_saleId);
        //slither-disable-next-line unused-return
        _saleIdNotCloseOfProject[_project.id].add(_saleId);

        if (_project.isSingle) {
            if (_isCreateNewToken) {
                sale.tokenId = _isSetRoyalty ? 
                IOSB721(_project.token).mintWithRoyalty(address(this), _saleInput.tokenUri, _saleInput.royaltyReceiver, _saleInput.royaltyFeeNumerator) : 
                IOSB721(_project.token).mint(address(this), _saleInput.tokenUri);
            } else {
                IOSB721(_project.token).safeTransferFrom(_caller, address(this), _saleInput.tokenId);
            }
        } else {
            if (_isCreateNewToken) {
                sale.tokenId = _isSetRoyalty ? 
                IOSB1155(_project.token).mintWithRoyalty(address(this), _saleInput.amount, _saleInput.tokenUri, _saleInput.royaltyReceiver, _saleInput.royaltyFeeNumerator) : 
                IOSB1155(_project.token).mint(address(this), _saleInput.amount, _saleInput.tokenUri);
            } else {
                IOSB1155(_project.token).safeTransferFrom(_caller, address(this), _saleInput.tokenId, _saleInput.amount, "");
            }
        }

        return _saleId;
    }

    /**
     * @notice Distribute NFTs to buyers waiting or transfer remaining NFTs to project owner and close sale
     * @param _closeLimit Loop limit
     * @param _project Project info
     * @param _sale Sale info
     * @param _totalBuyersWaitingDistribution Total buyers waiting distribution
     * @param _isGive NFTs is give
     */
    function close(uint256 _closeLimit, ProjectInfo memory _project, SaleInfo memory _sale, uint256 _totalBuyersWaitingDistribution, bool _isGive) external onlyProject nonReentrant returns (uint256) {
        address[] memory buyersWaiting = getBuyersWaitingDistribution(_sale.id);
        for (uint256 i = 0; i < buyersWaiting.length; i++) {
            _totalBuyersWaitingDistribution++;

            Bill memory billInfo = getBill(_sale.id, buyersWaiting[buyersWaiting.length - (i + 1)]);
            buyersWaitingDistributions[_sale.id].pop();
            if (getBuyersWaitingDistribution(_sale.id).length == 0) {
                _closeSale(_sale.id);
            }

            // transfer profits
            if (_isGive || _project.sold < _project.minSales) {
                Helper.safeTransferNative(billInfo.account, billInfo.royaltyFee + billInfo.superAdminFee + billInfo.sellerFee);
            } else {
                Helper.safeTransferNative(billInfo.royaltyReceiver, billInfo.royaltyFee);
                Helper.safeTransferNative(setting.getSuperAdmin(), billInfo.superAdminFee);
                Helper.safeTransferNative(project.getManager(_project.id), billInfo.sellerFee);
            }

            // Transfer tokens
            address receiver = (_project.minSales > 0 && _project.sold < _project.minSales && !_isGive) ? _project.manager : billInfo.account;
            _project.isSingle ? 
            IOSB721(_project.token).safeTransferFrom(address(this), receiver, _sale.tokenId) : 
            IOSB1155(_project.token).safeTransferFrom(address(this), receiver, _sale.tokenId, billInfo.amount, "");

            if (_totalBuyersWaitingDistribution == _closeLimit) break;
        }

        return _totalBuyersWaitingDistribution;
    }

    /**
     * @notice Set ended sale
     * @param _saleId From sale ID
     */
    function setCloseSale(uint256 _saleId) external onlyProject {
        _closeSale(_saleId);
        emit SetCloseSale(_saleId, true);
    }

    /**
     * @notice Reset amount NFTs from sale ID
     * @param _saleId From sale ID
     */
    function resetAmountSale(uint256 _saleId) external onlyProject {
        uint256 oldAmount = sales[_saleId].amount;
        sales[_saleId].amount = 0;
        emit ResetAmountSale(_saleId, oldAmount);
    }

    /**
     * @notice Only use for sale approve a certain token to Project
     * @param _token Address of NFT token
     */
    function approveForAll(address _token) external onlyProject {
        IOSB721(_token).setApprovalForAll(address(project), true);
    }

    // ============ FUND RECEIVER-ONLY FUNCTIONS =============

    /**
     * @notice Update new MerkleRoot from sale ID
     * @param _saleId From sale ID
     * @param _rootHash New MerkleRoot
     */
    function setMerkleRoot(uint256 _saleId, bytes32 _rootHash) external {
        require(_msgSender() == project.opFundReceiver(), "Caller is not the opFundReceiver");
        require(_saleId <= lastId.current(), "Invalid sale");
        merkleRoots[_saleId] = _rootHash;
        emit SetMerkleRoot(_saleId, _rootHash);
    }

    // ============ OTHER FUNCTIONS =============

    /**
     * @notice Show current dutch price
     * @param _startTime Sale start time
     * @param _endTime Sale end time
     * @param _maxPrice Max price for dutch auction
     * @param _minPrice Min price for dutch auction
     * @param _priceDecrementAmt Price decrement amt for dutch auction
     */ 
    function getCurrentDutchPrice(uint256 _startTime, uint256 _endTime, uint256 _maxPrice, uint256 _minPrice, uint256 _priceDecrementAmt) public view returns (uint256) {
        uint256 decrement = (_maxPrice - _minPrice) / _priceDecrementAmt;
        uint256 timeToDecrementPrice = (_endTime - _startTime) / decrement;

        uint256 currentTimestamp = block.timestamp;
        if (currentTimestamp <= _startTime) return _maxPrice;

        //slither-disable-next-line divide-before-multiply
        uint256 numDecrements = (currentTimestamp - _startTime) / timeToDecrementPrice;
        uint256 decrementAmt = _priceDecrementAmt * numDecrements;

        if (decrementAmt > _maxPrice || _maxPrice - decrementAmt <= _minPrice) {
            return _minPrice;
        }

        return _maxPrice - decrementAmt;
    }

    /**
     * @notice Show all sale IDs from project ID
     * @param _projectId From project ID
     */ 
    function getSaleIdsOfProject(uint256 _projectId) public view returns (uint256[] memory) {
        return saleIdsOfProject[_projectId];
    }

    /**
     * @notice Show all addresses of buyers waiting for distribution from sale ID
     * @param _saleId From sale ID
     */ 
    function getBuyersWaitingDistribution(uint256 _saleId) public view returns (address[] memory) {
        return buyersWaitingDistributions[_saleId];       
    }

    /**
     * @notice Show the bill info of the buyer
     * @param _saleId From sale ID
     * @param _buyer Buyer address
     */ 
    function getBill(uint256 _saleId, address _buyer) public view returns (Bill memory) {
        return bills[_saleId][_buyer];
    }

    /**
     * @notice Show royalty info on the token
     * @param _projectId From project ID
     * @param _tokenId Token ID
     * @param _salePrice Sale price
     */ 
    function getRoyaltyInfo(uint256 _projectId, uint256 _tokenId, uint256 _salePrice) public view returns (address, uint256) {
        ProjectInfo memory _project = project.getProject(_projectId);
        if (nftChecker.isImplementRoyalty(_project.token)) {
            (address receiver, uint256 amount) = _project.isSingle ? 
            IOSB721(_project.token).royaltyInfo(_tokenId, _salePrice) : 
            IOSB1155(_project.token).royaltyInfo(_tokenId, _salePrice);

            //slither-disable-next-line incorrect-equality
            if (receiver == address(0)) return (address(0), 0);
            return (receiver, amount);
        }
        return (address(0), 0);
    }
    
    /**
     * @notice Show royalty fee
     * @param _projectId From project ID
     * @param _tokenIds Foken ID
     * @param _salePrices Sales prices
     */ 
    function getTotalRoyalFee(uint256 _projectId, uint256[] memory _tokenIds, uint256[] memory _salePrices) public view returns (uint256) {
        uint256 total;
        ProjectInfo memory _project = project.getProject(_projectId);
        if (_project.id == 0) return 0;

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            (, uint256 royaltyAmount) = _project.isSingle ? 
            IOSB721(_project.token).royaltyInfo(_tokenIds[i], _salePrices[i]) : 
            IOSB1155(_project.token).royaltyInfo(_tokenIds[i], _salePrices[i]);
            total += royaltyAmount;
        }
        return total;
    }

    /**
     * @notice Show sales info from project ID
     * @param _projectId From project ID
     */ 
    function getSalesProject(uint256 _projectId) external view returns (SaleInfo[] memory) {
        uint256[] memory saleIds = getSaleIdsOfProject(_projectId);
        SaleInfo[] memory sales_ = new SaleInfo[](saleIds.length);
        for (uint256 i = 0; i < saleIds.length; i++) {
            sales_[i] = sales[saleIds[i]];
        }
        return sales_;
    }

    /**
     * @notice Show all addresses buyers from sale ID
     * @param _saleId From sale ID
     */ 
    function getBuyers(uint256 _saleId) external view returns (address[] memory) {
        return buyers[_saleId];
    }

    /**
     * @notice Show sale info from sale ID
     * @param _saleId From sale ID
     */ 
    function getSaleById(uint256 _saleId) external view returns (SaleInfo memory) {
        return sales[_saleId];
    }

    /**
     * @notice Show length sale ids not close from project ID
     * @param _projectId From sale ID
     */
    function getSaleNotCloseLength(uint256 _projectId) external view returns (uint256) {
        return _saleIdNotCloseOfProject[_projectId].length();
    }

    /**
     * @notice Show sale ID not close by index from project ID
     * @param _projectId From sale ID
     * @param _index From sale ID
     */
    function getSaleIdNotCloseByIndex(uint256 _projectId, uint256 _index) public view returns (uint256) {
        return _saleIdNotCloseOfProject[_projectId].at(_index);
    }

    /**
     * @notice Get the list of sale ID in one pack
     * @param _projectId From sale ID
     */
    function currentSalesInPack(uint256 _projectId) public view returns (uint256[] memory) {
        return _currentSalesInPack[_projectId].values();
    }

    /**
     * @notice Buy NFT from sale ID
     * @param _to Buy for address
     * @param _saleId From sale ID
     * @param _merkleProof Merkle proof
     * @param _amount Token amount
     */
    function buy(address _to, uint256 _saleId, bytes32[] memory _merkleProof, uint256 _amount) external payable nonReentrant {
        SaleInfo storage saleInfo = sales[_saleId];
        ProjectInfo memory projectInfo = project.getProject(saleInfo.projectId);
        require(!projectInfo.isPack, "Project is pack");
        require(!sales[_saleId].isSoldOut, "Sold out");
        require(_amount > 0 && _amount <= saleInfo.amount, "Invalid amount");
        if (!projectInfo.isFlashSale) {
            require(MerkleProofUpgradeable.verify(_merkleProof, merkleRoots[_saleId], keccak256(abi.encodePacked(_to))), "Invalid winner");
        }


        saleInfo.amount -= _amount;
        saleInfo.isSoldOut = saleInfo.amount == 0;
        projectInfo.sold += _amount;

        if (!bought[_saleId][_to]) {
            bought[_saleId][_to] = true;
            buyers[_saleId].push(_to);
        }

        if (projectInfo.isInstantPayment) {
            if (saleInfo.isSoldOut) _closeSale(_saleId);
            if (projectInfo.sold == projectInfo.amount) project.end(projectInfo.id);
            projectInfo.isSingle ? IOSB721(projectInfo.token).safeTransferFrom(address(this), _to, saleInfo.tokenId) :
            IOSB1155(projectInfo.token).safeTransferFrom(address(this), _to, saleInfo.tokenId, _amount, "");
        }

        project.setSoldQuantityToProject(saleInfo.projectId, projectInfo.sold);
        (, uint256 total)= _calculateSale(saleInfo.projectId, _saleId, _amount);
        // Transfer residual paid token back to user
        if (msg.value > total) {
            Helper.safeTransferNative(_to, msg.value - (total));
        }

        _sharing(PaymentInput(_to, projectInfo.isCreatedByAdmin, projectInfo.isInstantPayment, projectInfo.id, saleInfo.id, saleInfo.tokenId, projectInfo.minSales, projectInfo.profitShare, _amount, total));
    }

    /**
     * @notice Buy NFT from project ID
     * @param _to Buy for address
     * @param _projectId From project ID
     * @param _merkleProof Merkle proof
     * @param _amount Token amount
     */
    function buyPack(address _to, uint256 _projectId, bytes32[] memory _merkleProof, uint256 _amount) external payable nonReentrant {
        ProjectInfo memory projectInfo = project.getProject(_projectId);
        require(projectInfo.isPack, "Project is not pack");

        if (!projectInfo.isFlashSale) {
            require(MerkleProofUpgradeable.verify(
                    _merkleProof,
                    project.getMerkleRoots(_projectId),
                    keccak256(abi.encodePacked(_to))
                ),"Invalid winner");
        }
        
        uint256 available = _currentSalesInPack[_projectId].length();
        require(available > 0, "Sold out");
        require(_amount > 0 && _amount <= available, "Invalid amount");

        bool shouldRandom = _amount < available;
        (uint256 price, uint256 total) = _calculateSale(_projectId, _currentSalesInPack[_projectId].at(0), _amount);

        for (uint256 i = 0; i < _amount; i++) {
            uint256 selectedIndex = 0;
            if (shouldRandom) {
                //slither-disable-next-line reentrancy-no-eth,unused-return
                randomizer.getRandomNumber();
                selectedIndex = randomizer.random(i) % _currentSalesInPack[_projectId].length();
            }

            uint256 saleId = _currentSalesInPack[_projectId].at(selectedIndex);
            SaleInfo storage saleInfo = sales[saleId];
            
            //slither-disable-next-line unused-return 
            _currentSalesInPack[_projectId].remove(saleId);
            saleInfo.amount = 0;
            saleInfo.isSoldOut = true;

            bought[saleInfo.id][_to] = true;
            buyers[saleInfo.id].push(_to);

            if (projectInfo.isInstantPayment) {
                _closeSale(saleInfo.id);
                IOSB721(projectInfo.token).safeTransferFrom(address(this), _to, saleInfo.tokenId);
            }

            _sharing(PaymentInput(_to, projectInfo.isCreatedByAdmin, projectInfo.isInstantPayment, projectInfo.id, saleInfo.id, saleInfo.tokenId, projectInfo.minSales, projectInfo.profitShare, 1, price));
        }

        projectInfo.sold += _amount;
        project.setSoldQuantityToProject(_projectId, projectInfo.sold);
        if (projectInfo.isInstantPayment && projectInfo.sold == projectInfo.amount) project.end(_projectId);
        // Transfer residual paid token back to user
        if (msg.value > total) {
            Helper.safeTransferNative(_to, msg.value - (total));
        }
    }

    /**
     * @notice Calculate sale item price, total should pay and proccess residual amount
     * @param _projectId Project ID
     * @param _saleId Sale ID
     * @param _amount amount of token in each Sale or Pack
     */
    function _calculateSale(uint256 _projectId, uint256 _saleId, uint256 _amount) private returns (uint256, uint256) {
        ProjectInfo memory projectInfo = project.getProject(_projectId);
        SaleInfo memory saleInfo = sales[_saleId];

        uint256 price = 0;
        if (projectInfo.isFixed) {
            price = saleInfo.fixedPrice;
        } else {
            price = getCurrentDutchPrice(projectInfo.saleStart, projectInfo.saleEnd, saleInfo.dutchMaxPrice, saleInfo.dutchMinPrice, saleInfo.priceDecrementAmt);
        }


        uint256 total = price * _amount;
        //slither-disable-next-line incorrect-equality
        require(projectInfo.isFixed ? msg.value == total : msg.value >= total, "Invalid value");

        return (price, total);
    }

    /**
     * @notice Support sharing profit or log bill

     * @param _paymentInput.buyTo -> The address to receive the token
     * @param _paymentInput.amount -> Token amount
     * @param _paymentInput.payAmount -> Minimum amount that pay for sale
     */ 
    function _sharing(PaymentInput memory _paymentInput) private {
        uint256 supperAdminProfit = 0; 
        uint256 royaltyProfit = 0;
        uint256 sellerProfit = 0;

        // Calculate royal fee
        (address royaltyReceiver, uint256 royaltyFee) = getRoyaltyInfo(_paymentInput.projectId, _paymentInput.tokenId, _paymentInput.payAmount);
        royaltyProfit = royaltyFee;

        // Calculate fee and profit
        if (_paymentInput.isCreatedByAdmin) {
            supperAdminProfit = _paymentInput.payAmount - royaltyProfit;
        } else {
            // admin fee
            supperAdminProfit = _getPriceToPercent(_paymentInput.payAmount, _paymentInput.profitShare);
            sellerProfit = _paymentInput.payAmount - supperAdminProfit;
            if (royaltyProfit > sellerProfit) royaltyProfit = sellerProfit;
            sellerProfit -= royaltyProfit;
        }

        // Transfer fee and profit
        // slither-disable-next-line incorrect-equality
        if (_paymentInput.minSales == 0 && _paymentInput.isInstantPayment) {
            if (royaltyProfit > 0) Helper.safeTransferNative(royaltyReceiver, royaltyProfit);
            if (supperAdminProfit > 0) Helper.safeTransferNative(setting.getSuperAdmin(), supperAdminProfit);
            if (sellerProfit > 0) Helper.safeTransferNative(project.getManager(_paymentInput.projectId), sellerProfit);
        } else {
            Bill storage billInfo = bills[_paymentInput.saleId][_paymentInput.buyTo];
            billInfo.saleId = _paymentInput.saleId;
            billInfo.amount += _paymentInput.amount;
            billInfo.royaltyReceiver = royaltyReceiver;
            billInfo.royaltyFee += royaltyProfit;
            billInfo.superAdminFee += supperAdminProfit;
            billInfo.sellerFee += sellerProfit;
            if (billInfo.account != _paymentInput.buyTo) {
                billInfo.account = _paymentInput.buyTo;
                project.addTotalBuyersWaitingDistribution(_paymentInput.projectId);
                buyersWaitingDistributions[_paymentInput.saleId].push(_paymentInput.buyTo);
            }
        }

        emit Buy(_paymentInput.buyTo, _paymentInput.saleId, _paymentInput.tokenId, _paymentInput.amount, _paymentInput.profitShare, supperAdminProfit, royaltyProfit, sellerProfit);
    }

    /**
     * @notice Support calculate price to percent
     */
    function _getPriceToPercent(uint256 _price, uint256 _percent) private pure returns (uint256) {
        return (_price * _percent) / (100 * WEIGHT_DECIMAL);
    }

    /**
     * @notice Close sale
     * @param _saleId Sale ID
     */
    function _closeSale(uint256 _saleId) private {
        sales[_saleId].isClose = true;
        //slither-disable-next-line unused-return
        _saleIdNotCloseOfProject[sales[_saleId].projectId].remove(_saleId);
    }
}
