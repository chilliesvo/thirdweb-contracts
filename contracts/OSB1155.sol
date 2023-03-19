//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import { RoyaltyInput, TokenInput } from "./interfaces/IOSBFactory.sol";

contract OSB1155 is ERC1155Upgradeable, ERC2981Upgradeable, OwnableUpgradeable {
    RoyaltyInfo public defaultRoyaltyInfo;

    /// @dev Contract address of the Factory.
    address public factory;

    /**
     * @dev The maximum total supply of tokens that can be stored by the contract, effectively limiting the amount of tokens that can be created.
     * If left as 0, it represents an unlimited maximum total supply.
     */ 
    uint256 public maxTotalSupply;

    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter public lastId;

    /// @dev The name of the token.
    string public name;

    /// @dev The symbol of the token.
    string public symbol;

    /**
     * @dev This mapping is used to check if an account is a controller.
     * The key is the address of the account and the value is a boolean indicating if it's a controller.
     */
    mapping(address => bool) public controllers;

    /**
     * @dev Mapping for token metadata URIs.
     */
    mapping(uint256 => string) private _tokenURIs;

    // ============ EVENTS ============

    /// @dev Emit an event when the contract is deployed.
    event ContractDeployed(address indexed owner, address indexed controller, TokenInput tokenInput);

    /// @dev Emit an event when mint success.
    event Mint(address indexed to, uint256 indexed tokenId, string tokenUri, uint256 amount);

    /// @dev Emit an event when mintBatch success.
    event MintBatch(address indexed to, uint256[] tokenIds, uint256[] amounts, string[] tokenUris);

    /// @dev Emit an event when mintWithRoyalty success.
    event MintWithRoyalty(address indexed to, uint256 amount, string tokenUri, address indexed receiverRoyalty, uint96 indexed percentageRoyalty);

    /// @dev Emit an event when MintBatchWithRoyalty success.
    event MintBatchWithRoyalty(address indexed to, string[] tokenUris, uint256[] tokenIds, uint256[] amounts, RoyaltyInput[] royaltyInputs);
    
    /// @dev Emit an event when updated controller.
    event SetController(address indexed account, bool allow);
    
    /// @dev Emit an event when updated new contract URI.
    event SetContractURI(string oldUri, string newUri);

    /// @dev Emit an event when updated new token URI.
    event SetTokenURI(uint256 indexed tokenId, string oldUri, string newUri);

    /**
     * @notice This function sets the initial states of the contract and is only called once at deployment.
     * @param _owner The address of the owner of the contract.
     * @param _controller The address of the controller of the contract.
     * @param _tokenInput.contractUri The metadata URI associated with the contract.
     * @param _tokenInput.name The name of the token.
     * @param _tokenInput.symbol The symbol used to represent the token.
     * @param _tokenInput.defaultReceiverRoyalty The default address that will receive the royalty for each token.
     * @param _tokenInput.defaultPercentageRoyalty The default percentage of royalty that will be applied per token.
     * 
     * @param _tokenInput.maxTotalSupply -> the maximum total supply of tokens that can be stored by the contract. 
     * Please ensure that a reasonable limit is set to prevent devaluation and harm to token holders.
     * If left as 0, it represents an unlimited maximum total supply.
     */
    function initialize(address _owner, address _controller, TokenInput memory _tokenInput) public initializer {
        __ERC1155_init("");
        __Ownable_init();
        transferOwnership(_owner);

        factory = _msgSender();
        name = _tokenInput.name;
        symbol = _tokenInput.symbol;
        _tokenURIs[0] = _tokenInput.contractUri;
        maxTotalSupply = _tokenInput.maxTotalSupply;
        
        if (_tokenInput.defaultReceiverRoyalty != address(0)) {
            defaultRoyaltyInfo = RoyaltyInfo(_tokenInput.defaultReceiverRoyalty, _tokenInput.defaultPercentageRoyalty);
            _setDefaultRoyalty(_tokenInput.defaultReceiverRoyalty, _tokenInput.defaultPercentageRoyalty);
        }

        if (_controller != address(0)) {
            controllers[_controller] = true;
        }
        emit ContractDeployed(_owner, _controller, _tokenInput);
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Upgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ============ ACCESS CONTROL/SANITY MODIFIERS ============

    /**
     * @dev To check caller is owner or controller.
     */
    modifier onlyOwnerOrController() {
        require(_msgSender() == owner() || controllers[_msgSender()], "Caller not owner or controller");
        _;
    }

    /**
     * @dev To check if adding amount to the total supply exceeds the maximum allowed total supply.
     * If maxTotalSupply is greater than 0, then the function will require that the sum of the current total supply and amount
     * does not exceed maxTotalSupply. If it does, the function will revert with the error message "Exceeded maximum total supply".
     * Otherwise, the function will proceed as usual.
     */
    modifier exceededTotalSupply(uint256 amount) {
        if (maxTotalSupply > 0) {
            require(lastId.current() + amount <= maxTotalSupply, "Exceeded maximum total supply");
        }
        _;
    }

    // ============ OWNER-ONLY ADMIN FUNCTIONS ============

    /**
     * @notice This function allows the caller to delegate control permissions to another account.
     * @param _account The address of the account that will be set as the controller.
     * @param _allow The value indicating whether the account should be set as the controller or not.
     */
    function setController(address _account, bool _allow) external onlyOwner {
        require(_account != address(0), "Invalid account");
        require(controllers[_account] != _allow, "Duplicate setting");
        controllers[_account] = _allow;

        emit SetController(_account, _allow);
    }

    /**
     * @notice Sets the metadata URI for the specified token ID.
     * @param _tokenId Token ID.
     * @param _tokenUri New Metadata URI.
     * Requirements:
     * - The specified "tokenId" must exist.
     */
    function setTokenURI(uint256 _tokenId, string memory _tokenUri) external onlyOwner {
        require(_tokenId > 0 && _tokenId <= lastId.current(), "URI set of nonexistent token");
        require(bytes(_tokenUri).length > 0, "Invalid tokenUri");
        string memory oldUri = _tokenURIs[_tokenId];
        _tokenURIs[_tokenId] = _tokenUri;
        emit SetTokenURI(_tokenId, oldUri, _tokenUri);
    }

    /**
     * @notice Updates the contract's URI to a new value.
     * @param _newUri The new URI to be set for the contract.
     */
    function setContractURI(string memory _newUri) external onlyOwner {
        require(bytes(_newUri).length > 0, "Invalid newUri");
        string memory oldUri = _tokenURIs[0];
        _tokenURIs[0] = _newUri;
        emit SetContractURI(oldUri, _newUri);
    }

    // ============ OWNER OR CONTROLLER-ONLY FUNCTIONS ============

    /**
     * @notice This function mints a token to a specified address.
     * @param _to The address where the token will be minted to.
     * @param _amount The number of tokens to be minted.
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    function mint(address _to, uint256 _amount, string memory _tokenUri) public exceededTotalSupply(1) onlyOwnerOrController returns (uint256 tokenId) {
        require(_amount > 0, "Invalid amount");
        require(bytes(_tokenUri).length > 0, "Invalid tokenUri");
        lastId.increment();
        tokenId = lastId.current();
        _mint(_to, tokenId, _amount, "");
        _tokenURIs[tokenId] = _tokenUri;
        emit Mint(_to, tokenId, _tokenUri, _amount);
    }

    /**
     * @notice This function mints multiple tokens to a specified address.
     * @param _to The address where the tokens will be minted to.
     * @param _amounts An array of the number of tokens to be minted for each token.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @return tokenIds The list of unique identifiers of the tokens that were minted, assigned to the owner's address.
     */
    function mintBatch(address _to, uint256[] memory _amounts, string[] memory _tokenUris) external exceededTotalSupply(_amounts.length) onlyOwnerOrController returns (uint256[] memory tokenIds) {
        require(_amounts.length > 0 && _amounts.length == _tokenUris.length, "Invalid parameters");
        tokenIds = new uint256[](_amounts.length);
        for (uint256 i = 0; i < _amounts.length; i++) {
            tokenIds[i] = mint(_to, _amounts[i], _tokenUris[i]);
        }
        emit MintBatch(_to, tokenIds, _amounts, _tokenUris);
    }

    /**
     * @notice Mints a token with a specified quantity to an address and sets the royalty for the token.
     * @param _to The address where the token will be minted to.
     * @param _amount The quantity of tokens to mint.
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @param _receiverRoyalty The address that will receive the royalty for the token being minted.
     * @param _percentageRoyalty The percentage of royalty that will be applied to the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    function mintWithRoyalty(address _to, uint256 _amount, string memory _tokenUri, address _receiverRoyalty, uint96 _percentageRoyalty) external onlyOwnerOrController returns (uint256 tokenId) {
        tokenId = mint(_to, _amount, _tokenUri);
        _setTokenRoyalty(tokenId, _receiverRoyalty, _percentageRoyalty);
        emit MintWithRoyalty(_to, _amount, _tokenUri, _receiverRoyalty, _percentageRoyalty);
    }

    /**
     * @notice Mint multiple tokens with specific quantities to a single address and set royalty for each token.
     * @param _to The address where the tokens will be minted to.
     * @param _amounts The quantity of tokens to be minted.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @param _royaltyInputs.receiver -> The addresses that will receive the royalties for the tokens being minted.
     * @param _royaltyInputs.percentage -> The percentage of royalties that will be applied to each token being minted.
     * @return tokenIds The list of unique identifiers of the tokens that were minted, assigned to the owner's address.
     */
    function mintBatchWithRoyalty(address _to, uint256[] memory _amounts, string[] memory _tokenUris, RoyaltyInput[] memory _royaltyInputs) external exceededTotalSupply(_amounts.length) onlyOwnerOrController returns (uint256[] memory tokenIds) {
        require(_amounts.length > 0 && _amounts.length == _royaltyInputs.length, "Invalid parameters");
        tokenIds = new uint256[](_amounts.length);
        for (uint256 i = 0; i < _amounts.length; i++) {
            tokenIds[i] = mint(_to, _amounts[i], _tokenUris[i]);
            _setTokenRoyalty(tokenIds[i], _royaltyInputs[i].receiver, _royaltyInputs[i].percentage);
        }
        emit MintBatchWithRoyalty(_to, _tokenUris, tokenIds, _amounts, _royaltyInputs);
    }

    // ============ OTHER FUNCTIONS =============

    /**
     * @notice Takes a tokenId and returns base64 string to represent the token metadata.
     * @param _tokenId Id of the token.
     * @return string base64
     */
    function uri(uint256 _tokenId) public view override returns (string memory) {
        return _tokenURIs[_tokenId];
    }

    /**
     * @notice Returns base64 string to represent the contract metadata.
     * See https://docs.opensea.io/docs/contract-level-metadata
     * @return string base64
     */
    function contractURI() public view returns (string memory) {
        return uri(0);
    }
}
