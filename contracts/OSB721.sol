//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import { RoyaltyInput, TokenInput } from "./interfaces/IOSBFactory.sol";

contract OSB721 is ERC721EnumerableUpgradeable, ERC2981Upgradeable, OwnableUpgradeable {
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
    event ContractDeployed(address indexed owner, address indexed controllers, TokenInput tokenInput);

    /// @dev Emit an event when mint success.
    event Mint(address indexed to, uint256 indexed tokenId, string tokenUri);
    
    /// @dev Emit an event when mintBatch success.
    event MintBatch(address indexed to, uint256[] tokenIds, string[] tokenUris);

    /// @dev Emit an event when mintWithRoyalty success.
    event MintWithRoyalty(address indexed to, uint256 tokenId, string tokenUri, address indexed receiverRoyalty, uint96 indexed percentageRoyalty);

    /// @dev Emit an event when mintBatchWithRoyalty success.
    event MintBatchWithRoyalty(address indexed to, uint256[] tokenIds, string[] tokenUris, RoyaltyInput[] royaltyInputs);
    
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
     * @param _tokenInput.contractUri -> The metadata URI associated with the contract.
     * @param _tokenInput.name -> The name of the token.
     * @param _tokenInput.symbol -> The symbol used to represent the token.
     * @param _tokenInput.defaultReceiverRoyalty -> The default address that will receive the royalty for each token.
     * @param _tokenInput.defaultPercentageRoyalty -> The default percentage of royalty that will be applied per token.
     * 
     * @param _tokenInput.maxTotalSupply -> the maximum total supply of tokens that can be stored by the contract. 
     * Please ensure that a reasonable limit is set to prevent devaluation and harm to token holders.
     * If left as 0, it represents an unlimited maximum total supply.
     */
    function initialize(address _owner, address _controller, TokenInput memory _tokenInput) public initializer {
        __ERC721_init(_tokenInput.name, _tokenInput.symbol);
        __Ownable_init();
        transferOwnership(_owner);
        
        factory = _msgSender();
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
    function supportsInterface(bytes4 interfaceId) public view override (ERC721EnumerableUpgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Hook that is called before any token transfer. This includes minting and burning. If {ERC721Consecutive} is
     * used, the hook may be called as part of a consecutive (batch) mint, as indicated by `batchSize` greater than 1.
     *
     * Calling conditions:
     *
     * - When `from` and `to` are both non-zero, ``from``'s tokens will be transferred to `to`.
     * - When `from` is zero, the tokens will be minted for `to`.
     * - When `to` is zero, ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     * - `batchSize` is non-zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    // ============ ACCESS CONTROL/SANITY MODIFIERS ============

    /**
     * @dev To check caller is owner or controller
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
            require(totalSupply() + amount <= maxTotalSupply, "Exceeded maximum total supply");
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
        require(_exists(_tokenId), "URI set of nonexistent token");
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
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    function mint(address _to, string memory _tokenUri) public exceededTotalSupply(1) onlyOwnerOrController returns (uint256 tokenId) {
        require(bytes(_tokenUri).length > 0, "Invalid tokenUri");
        lastId.increment();
        _safeMint(_to, lastId.current());
        _tokenURIs[lastId.current()] = _tokenUri;
        tokenId = lastId.current();
        emit Mint(_to, tokenId, _tokenUri);
    }

    /**
     * @notice This function mints multiple tokens to a specified address.
     * @param _to The address where the tokens will be minted to.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @return tokenIds The list of unique identifiers of the tokens that were minted, assigned to the owner's address.
     */
    function mintBatch(address _to, string[] memory _tokenUris) external exceededTotalSupply(_tokenUris.length) onlyOwnerOrController returns (uint256[] memory tokenIds) {
        require(_tokenUris.length > 0, "Token URIs must have at least 1 item");
        tokenIds = new uint256[](_tokenUris.length);

        for (uint256 i = 0; i < _tokenUris.length; i++) {
            tokenIds[i] = mint(_to, _tokenUris[i]);
        }

        emit MintBatch(_to, tokenIds, _tokenUris);
    }  

    /**
     * @notice This function mints a single token while also calculating and allocating the specified royalty to the designated receiver address.
     * Allowing for customized royalty distribution for each individual token minted.
     * 
     * @param _to The address where the token will be minted to.
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @param _receiverRoyalty The address that will receive the royalty for the token being minted.
     * @param _percentageRoyalty The percentage of royalty that will be applied to the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    function mintWithRoyalty(address _to, string memory _tokenUri, address _receiverRoyalty, uint96 _percentageRoyalty) external onlyOwnerOrController returns (uint256 tokenId) {
        tokenId = mint(_to, _tokenUri);
        _setTokenRoyalty(tokenId, _receiverRoyalty, _percentageRoyalty);
        emit MintWithRoyalty(_to, tokenId, _tokenUri, _receiverRoyalty, _percentageRoyalty);
    }

    /**
     * @notice This function performs the action of minting a batch of tokens,
     * while also calculating and distributing the specified royalty percentage to the designated receiver.
     * 
     * @param _to The address where the tokens will be minted to.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @param _royaltyInputs.receiver -> The addresses that will receive the royalties for the tokens being minted.
     * @param _royaltyInputs.percentage -> The percentage of royalties that will be applied to each token being minted.
     * @return tokenIds The list of unique identifiers of the tokens that were minted, assigned to the owner's address.
     */
    function mintBatchWithRoyalty(address _to, string[] memory _tokenUris, RoyaltyInput[] memory _royaltyInputs) external exceededTotalSupply(_tokenUris.length) onlyOwnerOrController returns (uint256[] memory tokenIds) {
        require(_tokenUris.length > 0 && _tokenUris.length == _royaltyInputs.length, "Invalid parameters");

        tokenIds = new uint256[](_tokenUris.length);

        for (uint256 i = 0; i < _tokenUris.length; i++) {
            tokenIds[i] = mint(_to, _tokenUris[i]);
            _setTokenRoyalty(tokenIds[i], _royaltyInputs[i].receiver, _royaltyInputs[i].percentage);
        }
        emit MintBatchWithRoyalty(_to, tokenIds, _tokenUris, _royaltyInputs);
    }

    // ============ OTHER FUNCTIONS =============

    /**
     * @notice Takes a tokenId and returns base64 string to represent the token metadata.
     * @param _tokenId Id of the token.
     * @return string base64
     */
    function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
        return _tokenURIs[_tokenId];
    }

    /**
     * @notice Returns base64 string to represent the contract metadata.
     * See https://docs.opensea.io/docs/contract-level-metadata
     * @return string base64
     */
    function contractURI() public view returns (string memory) {
        return tokenURI(0);
    }
}