//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import { ClonesUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/ClonesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./interfaces/ISetting.sol";
import "./interfaces/IOSBFactory.sol";
import "./OSB721.sol";
import "./OSB1155.sol";

contract OSBFactory is IOSBFactory, ContextUpgradeable {
    ISetting public setting;

    address public library721Address;
    address public library1155Address;
    address public crossmintAddress;    // Crossmint service address

    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter public lastId;

    /**
     * @dev Check account is controller from account address.
     */
    mapping(address => bool) public controllers;

    /**
     * @dev Keep track of token info from created ID.
     */
    mapping(uint256 => TokenInfo) public tokenInfos;

    // ============ EVENTS ============

    /// @dev Emit an event when the contract is deployed.
    event ContractDeployed(address indexed settingAddress, address indexed library721Address, address indexed library1155Address);

    /// @dev Emit an event when token created.
    event Create(uint256 indexed id, TokenInfo tokenInfo);

    /// @dev Emit an event when the libraryAddress is updated.
    event SetLibraryAddress(address indexed oldAddress, address indexed newAddress);

    /// @dev Emit an event when the crossmintAddress is updated.
    event SetCrossmintAddress(address indexed oldAddress, address indexed newAddress);
    
    /**
     * @notice Setting states initial when deploy contract and only called once.
     * @param _settingAddress Setting contract address.
     * @param _library721Address OSB721 library address.
     * @param _library1155Address OSB1155 library address.
     * @param _crossmintAddress Crossmint service address. 
     */
    function initialize(address _settingAddress, address _library721Address, address _library1155Address, address _crossmintAddress) external initializer {
        require(_settingAddress != address(0), "Invalid settingAddress");
        require(_library721Address != address(0), "Invalid library721Address");
        require(_library1155Address != address(0), "Invalid library1155Address");
        require(_crossmintAddress != address(0), "Invalid crossmintAddress");
        setting = ISetting(_settingAddress);
        library721Address = _library721Address;
        library1155Address = _library1155Address;
        crossmintAddress = _crossmintAddress;
        emit ContractDeployed(_settingAddress, _library721Address, _library1155Address);
    }

    // ============ ACCESS CONTROL/SANITY MODIFIERS ============

    modifier onlySuperAdmin() {
        setting.checkOnlySuperAdmin(_msgSender());
        _;
    }

    // ============ OWNER-ONLY ADMIN FUNCTIONS =============

    /**
     * @notice Update the new OSB721 library address
     * @param _library721Address Library address
     */
    function setLibrary721Address(address _library721Address) external onlySuperAdmin {
        require(_library721Address != address(0), "Invalid library721Address");
        address oldAddress = library721Address;
        library721Address = _library721Address;
        emit SetLibraryAddress(oldAddress, _library721Address);
    }

    /**
     * @notice Update the new OSB1155 library address
     * @param _library1155Address Library address
     */
    function setLibrary1155Address(address _library1155Address) external onlySuperAdmin {
        require(_library1155Address != address(0), "Invalid library1155Address");
        address oldAddress = library1155Address;
        library1155Address = _library1155Address;
        emit SetLibraryAddress(oldAddress, _library1155Address);
    }

    /**
     * @notice Update the new Crossmint address
     * @param _crossmintAddress Crossmint address
     */
    function setCrossmintAddress(address _crossmintAddress) external onlySuperAdmin {
        require(_crossmintAddress != address(0), "Invalid crossmintAddress");
        address oldAddress = crossmintAddress;
        crossmintAddress = _crossmintAddress;
        emit SetCrossmintAddress(oldAddress, _crossmintAddress);
    }
    
    // ============ PUBLIC FUNCTIONS FOR CREATING =============

    /**
     * @notice Creates a new contract with either OSB721 or OSB1155 type.
     * @param _isSingle Indicates whether the token is single or not.
     * @param _owner The owner of the contract.
     * @param _controller The address of the controller of the contract.
     * @param _tokenInput.contractUri contract URI.
     * @param _tokenInput.name Token name.
     * @param _tokenInput.symbol Token symbol.
     * @param _tokenInput.defaultReceiverRoyalty Default address for royalty receiver.
     * @param _tokenInput.defaultPercentageRoyalty Default percentage for royalty.
     * 
     * @param _tokenInput.maxTotalSupply -> the maximum total supply of tokens that can be stored by the contract. 
     * Please ensure that a reasonable limit is set to prevent devaluation and harm to token holders.
     * If left as 0, it represents an unlimited maximum total supply.
     * 
     * @return Token address after creation.
     */
    function create(bool _isSingle, address _owner, address _controller, TokenInput memory _tokenInput) public returns (address) {
        lastId.increment();
        bytes32 salt = keccak256(abi.encodePacked(lastId.current()));
        address deployedContract;

        if (_isSingle) {
            OSB721 _osb721 = OSB721(ClonesUpgradeable.cloneDeterministic(library721Address, salt));
            _osb721.initialize(_owner, _controller, _tokenInput); 
            deployedContract = address(_osb721);
        } else {
            OSB1155 _osb1155 = OSB1155(ClonesUpgradeable.cloneDeterministic(library1155Address, salt));
            _osb1155.initialize(_owner, _controller, _tokenInput); 
            deployedContract = address(_osb1155);
        }

        TokenInfo storage tokenInfo = tokenInfos[lastId.current()];
        tokenInfo.token = deployedContract;
        tokenInfo.owner = _owner;
        tokenInfo.defaultReceiverRoyalty = _tokenInput.defaultReceiverRoyalty;
        tokenInfo.defaultPercentageRoyalty = _tokenInput.defaultPercentageRoyalty;
        tokenInfo.contractUri = _tokenInput.contractUri;
        tokenInfo.name = _tokenInput.name;
        tokenInfo.symbol = _tokenInput.symbol;
        tokenInfo.isSingle = _isSingle;

        emit Create(lastId.current(), tokenInfo);
        return tokenInfo.token;
    }

    /**
     * @notice Creates a new contract with either OSB721 or OSB1155 type by Crossmint.
     * 
     * @param _quantity Using by Crossmint The number of collection to be created and transferred to the specified address. 
     * 
     * @param _isSingle Indicates whether the token is single or not.
     * @param _owner The owner of the contract.
     * @param _controller The address of the controller of the contract.
     * @param _tokenInput.contractUri contract URI.
     * @param _tokenInput.name Token name.
     * @param _tokenInput.symbol Token symbol.
     * @param _tokenInput.defaultReceiverRoyalty Default address for royalty receiver.
     * @param _tokenInput.defaultPercentageRoyalty Default percentage for royalty.
     * @return Token address after creation.
     */
    function crossmintCreate(bool _isSingle, address _owner, address _controller, uint256 _quantity, TokenInput memory _tokenInput) external payable returns (address) {
        require(_msgSender() == crossmintAddress, "This function is for Crossmint only");
        require(_quantity == 1, "Invalid quantity");
        return create(_isSingle, _owner, _controller, _tokenInput);
    }

    /**
     * @notice Create a new contract with type OSB721 and mint multiple tokens.
     * @param _owner The owner of the contract.
     * @param _tokenInput Input parameters for creating the token, including the uri, name, symbol.
     * @param _tokenUris The URIs for each token to be minted.
     */
    function createAndMintSingleToken(address _owner, TokenInput memory _tokenInput, string[] memory _tokenUris) external {
        address tokenAddress = create(true, _owner, address(this), _tokenInput);
        
        // slither-disable-next-line unused-return
        OSB721(tokenAddress).mintBatch(_owner, _tokenUris);
    }

    /**
     * @notice Create a new contract with type OSB721 and mint multiple tokens.
     * with specified token info and token URIs, default royalty receiver and default royalty percentage,
     * and royalty receivers and percentages for each minted token.
     * 
     * @param _owner The owner of the contract.
     * @param _tokenInput Input parameters for creating the token, including the uri, name, symbol.
     * @param _tokenUris The URIs for each token to be minted.
     * @param _royaltyInputPerTokenMinted Custom royalty information for each token in the batch.
     */
    function createAndMintSingleTokenWithRoyalty(address _owner, TokenInput memory _tokenInput, string[] memory _tokenUris, RoyaltyInput[] memory _royaltyInputPerTokenMinted) external {
        address tokenAddress = create(true, _owner, address(this), _tokenInput);

        // slither-disable-next-line unused-return
        OSB721(tokenAddress).mintBatchWithRoyalty(_owner, _tokenUris, _royaltyInputPerTokenMinted);
    }
    /**
     * @notice Create a new contract with type OSB1155 and mint multiple tokens.
     * @param _owner The owner of the contract.
     * @param _tokenInput Input parameters for creating the token, including the uri, name, symbol.
     * @param _tokenUris The URIs for each token to be minted.
     * @param _amounts The amounts of each token to be minted.
     */
    function createAndMintMultiToken(address _owner, TokenInput memory _tokenInput, string[] memory _tokenUris, uint256[] memory _amounts) external {
        address tokenAddress = create(false, _owner, address(this), _tokenInput);

        // slither-disable-next-line unused-return
        OSB1155(tokenAddress).mintBatch(_owner, _amounts, _tokenUris);
    }

    /**
     * @notice Create a new contract with type OSB1155 and mint multiple tokens with specified token info and token URIs, default royalty receiver and default royalty percentage, and royalty receivers and percentages for each minted token.
     * @param _owner The owner of the contract.
     * @param _tokenInput Input parameters for creating the token, including the uri, name, symbol.
     * @param _tokenUris The URIs for each token to be minted.
     * @param _amounts The amounts of each token to be minted.
     * @param _royaltyInputPerTokenMinted Custom royalty information for each token in the batch.
     */
    function createAndMintMultiTokenWithRoyalty(address _owner, TokenInput memory _tokenInput, string[] memory _tokenUris, uint256[] memory _amounts, RoyaltyInput[] memory _royaltyInputPerTokenMinted) external {
        address tokenAddress = create(false, _owner, address(this), _tokenInput);

        // slither-disable-next-line unused-return
        OSB1155(tokenAddress).mintBatchWithRoyalty(_owner, _amounts, _tokenUris, _royaltyInputPerTokenMinted);
    }
}
