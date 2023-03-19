//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./interfaces/ISetting.sol";
import "./interfaces/INFTChecker.sol";
import "./interfaces/IOSBFactory.sol";
import "./interfaces/ISale.sol";
import "./interfaces/IProject.sol";
import "./interfaces/IOSB721.sol";
import "./interfaces/IOSB1155.sol";
import "./interfaces/IOSBSoul.sol";
import "./libraries/Helper.sol";

contract Project is IProject, ContextUpgradeable, ReentrancyGuardUpgradeable {
    ISale public sale;
    ISetting public setting;
    INFTChecker public nftChecker;
    IOSBFactory public osbFactory;
    IOSBSoul public osbSoul;

    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter public lastId;

    uint256 public createProjectFee;    /// Fee for publish project 
    uint256 public opFundLimit;         /// Limit balance for OpReceiver 
    uint256 public saleCreateLimit;     /// Limit create sales when publish the project
    uint256 public profitShareMinimum;  /// Profit sharing on each product sale batch of the end-users
    uint256 public closeLimit;          /// Limit loop counted when close project
    address public opFundReceiver;      /// Address receive a portion of the suport projects funds work
    address public serviceFundReceiver; /// Address receive funds from publish or allow the active project

    /**
     * @dev Keep track of project from projectId
     */
    mapping(uint256 => ProjectInfo) private projects;

    /**
     * @dev Keep track of total Buyers waiting for distribution from projectId
     */
    mapping(uint256 => uint256) private totalBuyersWaitingDistributions;

    /**
     * @dev Keep track of merkleRoot from project ID
     */
    mapping(uint256 => bytes32) private merkleRoots;

    // ============ EVENTS ============

    /// @dev Emit an event when the contract is deployed
    event ContractDeployed(address indexed serviceFundReceiver, InitializeInput input);

    /// @dev Emit an event when Sale contract address is updated
    event SetSaleAddress(address indexed oldSaleAddress, address indexed newSaleAddress);

    /// @dev Emit an event when createProjectFee is updated
    event SetCreateProjectFee(uint256 indexed oldFee, uint256 indexed newFee);
    
    /// @dev Emit an event when serviceFundReceiver is updated
    event SetServiceFundReceiver(address indexed oldReceiver, address indexed newReceiver);
    
    /// @dev Emit an event when opFundReceiver is updated
    event SetOpFundReceiver(address indexed oldReceiver, address indexed newReceiver);
    
    /// @dev Emit an event when opFundLimit is updated
    event SetOpFundLimit(uint256 indexed oldLimit, uint256 indexed newLimit);
    
    /// @dev Emit an event when closeLimit is updated
    event SetCloseLimit(uint256 indexed oldLimit, uint256 indexed newLimit);

    /// @dev Emit an event when saleCreateLimit is updated
    event SetSaleCreateLimit(uint256 indexed oldLimit, uint256 indexed newLimit);

    /// @dev Emit an event when profitShareMinimum is updated
    event SetProfitShareMinimum(uint256 indexed oldValue, uint256 indexed newValue);

    /// @dev Emit an event when the manager root for a project is updated
    event SetManager(uint256 indexed projectId, address indexed oldManager, address indexed newManager);

    /// @dev Emit an event when the totalBuyersWaitingDistribution for a project is updated
    event SetTotalBuyersWaitingDistribution(uint256 indexed projectId, uint256 indexed oldTotal, uint256 indexed newTotal);

    /// @dev Emit an event when the quantity sold Sale from the project is updated
    event SetSoldQuantityToProject(uint256 indexed projectId, uint256 indexed oldQuantity, uint256 indexed newQuantity);
    
    /// @dev Emit an event when the totalSalesNotClose for a project is updated
    event SetTotalSalesNotClose(uint256 indexed projectId, uint256 indexed oldTotal, uint256 indexed newTotal);

    /// @dev Emit an event when a project is published
    event Publish(uint256 indexed projectId, bool indexed isCreatedByAdmin, address indexed token, string name, string symbol, uint256[] saleIds);
    
    /// @dev Emit an event when the status of a project is updated to ENDED
    event End(uint256 indexed projectId, ProjectStatus status);
    
    /// @dev Emit an event when the project is closed
    event CloseProject(uint256 indexed projectId, bool isGive, ProjectStatus status);
    
    /// @dev Emit an event when withdrawn fund
    event WithdrawnFund(address indexed serviceFundReceiver, uint256 indexed value);

    /// @dev Emit an event when the MerkleRoot a Project is updated
    event SetMerkleRoot(uint256 indexed projectId, bytes32 rootHash);

    /// @dev Emit an event when adding Sales to the Project available
    event AddSales(uint256 indexed projectId, uint256[] saleIds);
    
    /**
     * @notice Setting states initial when deploy contract and only called once
     * @param _input.setting            -> Setting contract address
     * @param _input.nftChecker         -> NftChecker contract address
     * @param _input.osbFactory         -> OsbFactory contract address
     * @param _input.osbSoul            -> OSBSoul contract address
     * @param _input.createProjectFee   -> Create project fee
     * @param _input.profitShareMinimum -> Profit sharing on each product sale batch of the end-users
     * @param _input.saleCreateLimit    -> Limit create sales when publish the project
     * @param _input.closeLimit         -> Limit counted loop when close project
     * @param _input.opFundLimit        -> Limit balance OpReceiver
     * @param _input.opFundReceiver     -> OpReceiver address
     */
    function initialize(InitializeInput memory _input) external initializer {
        require(_input.setting != address(0), "Invalid setting");
        require(_input.nftChecker != address(0), "Invalid nftChecker");
        require(_input.osbFactory != address(0), "Invalid osbFactory");
        require(_input.osbSoul != address(0), "Invalid osbSoul");
        require(_input.opFundReceiver != address(0), "Invalid opFundReceiver");
        require(_input.saleCreateLimit > 0, "Invalid saleCreateLimit");
        require(_input.closeLimit > 0, "Invalid closeLimit");
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init();
        setting = ISetting(_input.setting);
        nftChecker = INFTChecker(_input.nftChecker);
        osbFactory = IOSBFactory(_input.osbFactory);
        osbSoul = IOSBSoul(_input.osbSoul);
        createProjectFee = _input.createProjectFee;
        profitShareMinimum = _input.profitShareMinimum;
        saleCreateLimit = _input.saleCreateLimit;
        closeLimit = _input.closeLimit;
        opFundLimit = _input.opFundLimit;
        opFundReceiver = _input.opFundReceiver;
        serviceFundReceiver = setting.getSuperAdmin();
        emit ContractDeployed(serviceFundReceiver, _input);
    }

    // ============ ACCESS CONTROL/SANITY MODIFIERS ============

    /**
     * @dev To check the project is valid
     */
    modifier projectIsValid(uint256 _projectId) {
        require(_projectId == projects[_projectId].id, "Invalid project");
        _;
    }

    /**
     * @dev To check caller is super admin
     */
    modifier onlySuperAdmin() {
        setting.checkOnlySuperAdmin(_msgSender());
        _;
    }

    /**
     * @dev To check caller is admin
     */
    modifier onlyAdmin() {
        setting.checkOnlyAdmin(_msgSender());
        _;
    }

    /**
     * @dev To check caller is manager
     */
    modifier onlyManager(uint256 _projectId) {
        require(isManager(_projectId, _msgSender()), "Caller is not the manager");
        _;
    }

    /**
     * @dev To check caller is Sale contract
     */
    modifier onlySale() {
        require(_msgSender() == address(sale), "Caller is not the sale");
        _;
    }

    // ============ OWNER-ONLY ADMIN FUNCTIONS =============

    /**
     * @notice 
     * Set the new Sale contract address
     * Caution need to discuss with the dev before updating the new state
     * 
     * @param _sale New Sale contract address
     */
    function setSaleAddress(address _sale) external onlySuperAdmin {
        require(_sale != address(0), "Invalid Sale address");
        address oldSaleAddress = address(sale);
        sale = ISale(_sale);
        emit SetSaleAddress(oldSaleAddress, _sale);
    }

    /**
     * @notice Set the new receiver to receive funds from publish or allow the active project
     * @param _account New receiver
     */
    function setServiceFundReceiver(address _account) external onlySuperAdmin {
        require(_account != address(0), "Invalid account");
        address oldReceiver = serviceFundReceiver;
        serviceFundReceiver = _account;
        emit SetServiceFundReceiver(oldReceiver, _account);
    }

    /**
     * @notice Set the new receiver to receive a portion of the publishing projects funds for the set Merkle Root gas fee
     * @param _account New receiver
     */
    function setOpFundReceiver(address _account) external onlySuperAdmin {
        require(_account != address(0), "Invalid account");
        address oldReceiver = opFundReceiver;
        opFundReceiver = _account;
        emit SetOpFundReceiver(oldReceiver, _account);
    }

    /**
     * @notice Set the new publish project fee
     * @param _fee New fee
     */
    function setCreateProjectFee(uint256 _fee) external onlySuperAdmin {
        require(_fee > 0, "Invalid fee");
        uint256 oldFee = createProjectFee;
        createProjectFee = _fee;
        emit SetCreateProjectFee(oldFee, _fee);
    }

    /**
     * @notice Set the new limit balance for OpReceiver 
     * @param _limit New limit
     */
    function setOpFundLimit(uint256 _limit) external onlySuperAdmin {
        require(_limit > 0, "Invalid limit");
        uint256 oldLimit = opFundLimit;
        opFundLimit = _limit;
        emit SetOpFundLimit(oldLimit, _limit);
    }

    /**
     * @notice Set the new saleCreateLimit
     * @param _limit New limit
     */
    function setSaleCreateLimit(uint256 _limit) external onlySuperAdmin {
        require(_limit > 0, "Invalid limit");
        uint256 oldLimit = saleCreateLimit;
        saleCreateLimit = _limit;
        emit SetSaleCreateLimit(oldLimit, _limit);
    }

    /**
     * @notice Set the new profitShareMinimum
     * @param _minimum New minimum value
     */
    function setProfitShareMinimum(uint256 _minimum) external onlySuperAdmin {
        uint256 oldValue = profitShareMinimum;
        profitShareMinimum = _minimum;
        emit SetProfitShareMinimum(oldValue, _minimum);
    }

    // ============ ADMIN-ONLY FUNCTIONS =============

    /**
     * @notice Set the new loop limit counted when close project
     * @param _limit New limit
     */
    function setCloseLimit(uint256 _limit) external onlyAdmin {
        require(_limit > 0, "Invalid limit");
        uint256 oldLimit = closeLimit;
        closeLimit = _limit;
        emit SetCloseLimit(oldLimit, _limit);
    }

    /**
     * @notice Set the new manager for project
     * @param _projectId Project ID
     * @param _account New manager
     */
    function setManager(uint256 _projectId, address _account) external projectIsValid(_projectId) onlyAdmin {
        require(_account != address(0), "Invalid account");
        require(_account != projects[_projectId].manager, "Account already exists");
        address oldManager = projects[_projectId].manager;
        projects[_projectId].manager = _account;
        emit SetManager(_projectId, oldManager, _account);
    }

    // ============ MANAGER-ONLY FUNCTIONS =============

    /**
     * @notice Distribute NFTs to buyers waiting or transfer remaining NFTs to project owner and close the project
     * @param _projectId From project ID
     * @param _saleIds List sale IDs to need close
     * @param _isGive NFTs is give
     */
    function closeProject(uint256 _projectId, uint256[] memory _saleIds, bool _isGive) external nonReentrant onlyManager(_projectId) {
        uint256 totalBuyersWaitingDistribution;
        uint256 loopCounted = totalBuyersWaitingDistributions[_projectId] + _saleIds.length;
        uint256 _closeLimit = loopCounted > closeLimit ? closeLimit : loopCounted;
        ProjectInfo memory _project = projects[_projectId];
        if (_project.isInstantPayment) require(!_isGive, "Invalid softCap");
        require(block.timestamp > _project.saleEnd && _project.status != ProjectStatus.ENDED, "Invalid project");

        uint256 _count = 0;
        for (uint256 i = 0; i < _saleIds.length; i++) {
            if (totalBuyersWaitingDistribution + _count >= _closeLimit) break;

            SaleInfo memory saleInfo = sale.getSaleById(_saleIds[i]);
            require(saleInfo.projectId == _projectId && !saleInfo.isClose, "Invalid sale id");

            if (sale.getBuyers(saleInfo.id).length == 0) {
                _count++;
                sale.setCloseSale(saleInfo.id);
                _project.isSingle ? IOSB721(_project.token).safeTransferFrom(address(sale), _project.manager, saleInfo.tokenId) :
                IOSB1155(_project.token).safeTransferFrom(address(sale), _project.manager, saleInfo.tokenId, saleInfo.amount, "");
                continue;
            } else if (!_project.isSingle && saleInfo.amount > 0) {
                IOSB1155(_project.token).safeTransferFrom(address(sale), _project.manager, saleInfo.tokenId, saleInfo.amount, "");
                sale.resetAmountSale(saleInfo.id);
            }

            if (_project.isInstantPayment) {
                _count++;
                sale.setCloseSale(saleInfo.id);
                continue;
            }
            
            totalBuyersWaitingDistribution = sale.close(_closeLimit - _count, _project, saleInfo, totalBuyersWaitingDistribution, _isGive);
        }
        totalBuyersWaitingDistributions[_projectId] -= totalBuyersWaitingDistribution;
        if (sale.getSaleNotCloseLength(_projectId) == 0) projects[_projectId].status = ProjectStatus.ENDED;
        
        emit CloseProject(_projectId, _isGive, projects[_projectId].status);
    }

    // ============ SALE-ONLY FUNCTIONS =============

    /**
     * @notice Set the new quantity sold Sale from the project 
     * @param _projectId Project ID
     * @param _quantity New quantity
     */
    function setSoldQuantityToProject(uint256 _projectId, uint256 _quantity) external projectIsValid(_projectId) onlySale {
        uint256 oldQuantiry = projects[_projectId].sold;
        projects[_projectId].sold = _quantity;
        emit SetSoldQuantityToProject(_projectId, oldQuantiry, _quantity);
    }

    /**
     * @notice Set the new total buyers waiting distribution from the project
     * @param _projectId Project ID
     */
    function addTotalBuyersWaitingDistribution(uint256 _projectId) external projectIsValid(_projectId) onlySale {
        totalBuyersWaitingDistributions[_projectId]++;
    }

    /**
     * @notice Set ENDED status for project
     * @param _projectId Project ID
     */
    function end(uint256 _projectId) external projectIsValid(_projectId) onlySale {
        projects[_projectId].status = ProjectStatus.ENDED;
        emit End(_projectId, ProjectStatus.ENDED);
    }

    // ============ FUND RECEIVER-ONLY FUNCTIONS =============

    /**
     * @notice Update new MerkleRoot from project ID
     * @param _projectId From project ID
     * @param _rootHash New MerkleRoot
     */
    function setMerkleRoot(uint256 _projectId, bytes32 _rootHash) external {
        require(_msgSender() == opFundReceiver, "Caller is not the opFundReceiver");
        require(_projectId <= lastId.current(), "Invalid project");
        merkleRoots[_projectId] = _rootHash;
        emit SetMerkleRoot(_projectId, _rootHash);
    }

    // ============ OTHER FUNCTIONS =============

    /**
     * @notice Check account is manager of project
     * @param _projectId From project ID
     * @param _account Account need check
     */
    function isManager(uint256 _projectId, address _account) public view returns (bool) {
        if (projects[_projectId].isCreatedByAdmin) {
            return setting.isSuperAdmin(_account) || setting.isAdmin(_account) || _account == projects[_projectId].manager;
        } else {
            return _account == projects[_projectId].manager;
        }
    }
    
    /**
     * @notice Show project info
     * @param _projectId From project ID
     */ 
    function getProject(uint256 _projectId) external view returns (ProjectInfo memory) {
        return projects[_projectId];
    }

    /**
     * @notice Show current address manager of project 
     * @param _projectId From project ID
     */
    function getManager(uint256 _projectId) external view returns (address) {
        return projects[_projectId].manager;
    }

    /**
     * @notice Show total buyers waiting distribution of project
     * @param _projectId From project ID
     */
    function getTotalBuyersWaitingDistribution(uint256 _projectId) external view returns (uint256) {
        return totalBuyersWaitingDistributions[_projectId];
    }

    /**
     * @notice Show merkleRoot of project
     * @param _projectId From project ID
     */
    function getMerkleRoots(uint256 _projectId) external view returns (bytes32) {
        return merkleRoots[_projectId];
    }

    /**
     * @notice Publish a project including its Sales
     * @param _projectInput.token                 -> Token address (default zero address if not have token available)
     * @param _projectInput.tokenName             -> Token name (default "" if have token available)
     * @param _projectInput.tokenSymbol           -> Token symbol (default "" if have token available)
     * @param _projectInput.uri                   -> URI metadata (default "" if have token available)
     * @param _projectInput.isPack                -> Set true if sale with pack type
     * @param _projectInput.isSingle              -> True if token is ERC721 type else is ERC1155 type
     * @param _projectInput.isFixed               -> True if sale with Fixed price else is a Dutch price
     * @param _projectInput.isFlashSale           -> Set to true if the sale is a flash sale that allows buyers to purchase the product immediately, without waiting for a lottery to determine the winners.
     * @param _projectInput.isInstantPayment      -> True if when buy not waiting for distribution
     * @param _projectInput.royaltyReceiver       -> Address royalty receiver default for token (default zero address if not have token available or not create token with royalty)
     * @param _projectInput.royaltyFeeNumerator   -> Royalty percent default for token
     * @param _projectInput.minSales              -> Minimum sold (default 0 if off softcap)
     * @param _projectInput.fixedPricePack        -> Fixed price for pack
     * @param _projectInput.maxPricePack          -> Max price for dutch auction pack
     * @param _projectInput.minPricePack          -> Min price for dutch auction pack
     * @param _projectInput.priceDecrementAmtPack -> Price decrement amt for dutch auction pack
     * @param _projectInput.saleStart             -> Sale start time (default 0 if publish by end-user)
     * @param _projectInput.saleEnd               -> Sale end time (default 0 if publish by end-user)
     * @param _projectInput.profitShare           -> Profit sharing on each product sale batch of the end-users
     * @param _saleInputs.tokenId                 -> Token ID (default 0 if not have token available)
     * @param _saleInputs.amount                  -> Token amount
     * @param _saleInputs.royaltyReceiver         -> Address royalty receiver by token ID (if equal zero address will get default value)
     * @param _saleInputs.royaltyFeeNumerator     -> Royalty percent by token ID
     * @param _saleInputs.fixedPrice              -> Fixed price (default 0 if sale by Dutch type)
     * @param _saleInputs.maxPrice                -> Max price for dutch auction (default 0 if sale by Fixed type)
     * @param _saleInputs.minPrice                -> Min price for dutch auction (default 0 if sale by Fixed type)
     * @param _saleInputs.priceDecrementAmt       -> Price decrement amt for dutch auction (default 0 if sale by Fixed type)
     */
    function publish(ProjectInput memory _projectInput, SaleInput[] memory _saleInputs) external payable nonReentrant {
        address token = _projectInput.token;
        bool isCreatedByAdmin = setting.isAdmin(_msgSender());
        bool isCreateNewToken = token == address(0);
        bool isSetRoyalty = _projectInput.royaltyReceiver != address(0);

        if (!isCreatedByAdmin) {
            require(osbSoul.balanceOf(_msgSender()) > 0, "Invalid member");
        }

        require(_saleInputs.length > 0, "Sales is empty");
        require(_saleInputs.length <= saleCreateLimit, "Reached sale create Limit");
        require(msg.value == createProjectFee, "Invalid create fee");
        require(isCreatedByAdmin ? _projectInput.profitShare == 0 : _projectInput.profitShare >= profitShareMinimum, "Invalid profitShare");
        require(_projectInput.saleStart >= block.timestamp && _projectInput.saleStart < _projectInput.saleEnd, "Invalid sale time");

        if (_projectInput.minSales > 0) {
            require(!_projectInput.isInstantPayment, "Invalid isInstantPayment");
        }

        if (_projectInput.isPack) {
            require(_projectInput.isSingle, "Only single token for pack");
        }

        if (isCreateNewToken) {
            //slither-disable-next-line reentrancy-no-eth
            token = osbFactory.create(_projectInput.isSingle, _msgSender(), address(sale), TokenInput(_projectInput.contractUri, _projectInput.tokenName, _projectInput.tokenSymbol, _projectInput.royaltyReceiver, _projectInput.royaltyFeeNumerator, _projectInput.maxTotalSupply));
        } else {
            require(_projectInput.isSingle ? nftChecker.isERC721(token) : nftChecker.isERC1155(token), "Invalid token");
        }
        
        lastId.increment();
        ProjectInfo storage project = projects[lastId.current()];
        project.id = lastId.current();
        project.isCreatedByAdmin = isCreatedByAdmin;
        project.manager = _msgSender();
        project.token = token;
        project.isSingle = nftChecker.isERC721(token);
        project.isFixed = _projectInput.isFixed;
        project.isFlashSale = _projectInput.isFlashSale;
        project.isInstantPayment = _projectInput.isInstantPayment;
        project.saleStart = _projectInput.saleStart;
        project.saleEnd = _projectInput.saleEnd;
        project.status = ProjectStatus.STARTED;
        project.minSales = _projectInput.minSales;
        project.isPack = _projectInput.isPack;
        project.profitShare = _projectInput.profitShare;

        // Create sales
        for (uint256 i = 0; i < _saleInputs.length; i++) {
            if (_projectInput.isPack) {
                if (_projectInput.isFixed) {
                    _saleInputs[i].fixedPrice = _projectInput.fixedPricePack;
                } else {
                    _saleInputs[i].maxPrice = _projectInput.maxPricePack;
                    _saleInputs[i].minPrice = _projectInput.minPricePack;
                    _saleInputs[i].priceDecrementAmt = _projectInput.priceDecrementAmtPack;
                }
            }

            project.amount += _saleInputs[i].amount;

            // slither-disable-next-line unused-return
            sale.createSale(_msgSender(), isCreateNewToken, isSetRoyalty, project, _saleInputs[i]);
        }

        require(_projectInput.minSales <= project.amount, "Invalid minSales");

        sale.approveForAll(token);
        if (address(opFundReceiver).balance < opFundLimit) Helper.safeTransferNative(opFundReceiver, msg.value);

        emit Publish(project.id, isCreatedByAdmin, project.token, _projectInput.tokenName, _projectInput.tokenSymbol, sale.getSaleIdsOfProject(project.id));
    }

    /**
     * @notice Add Sales to Project available
     * @param _projectId From project ID
     * @param _isMint If it's set to true, tokens will be minted; if it's set to false, tokens will be transferred.
     * @param _minSales Minimum sold (default 0 if off softcap)
     * @param _saleInputs.tokenId             -> Token ID (default 0 if _isMint set true)
     * @param _saleInputs.amount              -> Token amount
     * @param _saleInputs.royaltyReceiver     -> Address royalty receiver by token ID (if equal zero address will get default value)
     * @param _saleInputs.royaltyFeeNumerator -> Royalty percent by token ID
     * @param _saleInputs.fixedPrice          -> Fixed price (default 0 if sale by Dutch type)
     * @param _saleInputs.maxPrice            -> Max price for dutch auction (default 0 if sale by Fixed type)
     * @param _saleInputs.minPrice            -> Min price for dutch auction (default 0 if sale by Fixed type)
     * @param _saleInputs.priceDecrementAmt   -> Price decrement amt for dutch auction (default 0 if sale by Fixed type)
     */
    function addSales(uint256 _projectId, bool _isMint, uint256 _minSales, SaleInput[] memory _saleInputs) external projectIsValid(_projectId) onlyManager(_projectId) {
        ProjectInfo storage projectInfo = projects[_projectId];
        require(block.timestamp < projectInfo.saleStart, "Project is live");
        require(_saleInputs.length <= saleCreateLimit, "Reached sale create Limit");
        uint256[] memory saleIds = new uint256[](_saleInputs.length);

        // slither-disable-next-line uninitialized-local
        SaleInfo memory salePackInfo;
        if (projectInfo.isPack) {
            salePackInfo = sale.getSaleById(sale.getSaleIdsOfProject(_projectId)[0]);
        }

        for (uint256 i = 0; i < _saleInputs.length; i++) {
            if (projectInfo.isPack) {
                if (projectInfo.isFixed) {
                    _saleInputs[i].fixedPrice = salePackInfo.fixedPrice;
                } else {
                    _saleInputs[i].maxPrice = salePackInfo.dutchMaxPrice;
                    _saleInputs[i].minPrice = salePackInfo.dutchMinPrice;
                    _saleInputs[i].priceDecrementAmt = salePackInfo.priceDecrementAmt;
                }
            }
            bool isSetRoyalty = _isMint && _saleInputs[i].royaltyReceiver != address(0);

            projectInfo.amount += _saleInputs[i].amount;
            saleIds[i] = sale.createSale(_msgSender(), _isMint, isSetRoyalty, projectInfo, _saleInputs[i]);
        }

        if (!projectInfo.isInstantPayment) {
            require(_minSales <= projectInfo.amount, "Invalid minSales");
            projectInfo.minSales = _minSales;
        }

        emit AddSales(_projectId, saleIds);
    }

    /**
     * @notice Withdraw all funds from the contract
     */
    function withdrawFund() external nonReentrant {
        uint256 withdrawable = address(this).balance;
        require(withdrawable > 0, "Amount exceeds balance");
        Helper.safeTransferNative(serviceFundReceiver, withdrawable);
        emit WithdrawnFund(serviceFundReceiver, withdrawable);
    }
}
