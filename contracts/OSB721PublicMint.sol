//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@thirdweb-dev/contracts/extension/PlatformFee.sol";
import { RoyaltyInput } from "./interfaces/IOSBFactory.sol";
import "./libraries/Helper.sol";

contract OSB721PublicMint is PlatformFee, ERC721EnumerableUpgradeable, ERC2981Upgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    RoyaltyInfo public defaultRoyaltyInfo;

    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter public lastId;

    /**
     * @dev Mapping for token metadata URIs.
     */
    mapping(uint256 => string) private _tokenURIs;

    // ============ EVENTS ============

    /// @dev Emit an event when the contract is deployed.
    event ContractDeployed(address indexed owner, string contractUri, string name, string symbol, address indexed defaultReceiverRoyalty, uint96 indexed defaultPercentageRoyalty);

    /// @dev Emit an event when mint success.
    event Mint(address indexed to, uint256 indexed tokenId, string tokenUri);
    
    /// @dev Emit an event when mintBatch success.
    event MintBatch(address indexed to, uint256[] tokenIds, string[] tokenUris);

    /// @dev Emit an event when mintWithRoyalty success.
    event MintWithRoyalty(address indexed to, uint256 tokenId, string tokenUri, address indexed receiverRoyalty, uint96 indexed percentageRoyalty);

    /// @dev Emit an event when mintBatchWithRoyalty success.
    event MintBatchWithRoyalty(address indexed to, uint256[] tokenIds, string[] tokenUris, RoyaltyInput[] royaltyInputs);
    
    /// @dev Emit an event when updated new contract URI.
    event SetContractURI(string oldUri, string newUri);

    /// @dev Emit an event when withdrawn fund
    event WithdrawnFund(address indexed fundReceiver, uint256 indexed value);

    /**
     * @notice This function sets the initial states of the contract and is only called once at deployment.
     * @param _owner The address of the owner of the contract.
     * @param _contractUri The metadata URI associated with the contract.
     * @param _name The name of the token.
     * @param _symbol The symbol used to represent the token.
     * @param _defaultReceiverRoyalty The default address that will receive the royalty for each token.
     * @param _defaultPercentageRoyalty The default percentage of royalty that will be applied per token.
     */
    function initialize(address _owner, string memory _contractUri, string memory _name, string memory _symbol, address _defaultReceiverRoyalty, uint96 _defaultPercentageRoyalty) public initializer {
        __ERC721_init(_name, _symbol);
        __Ownable_init();
        transferOwnership(_owner);
        
        _tokenURIs[0] = _contractUri;

        if (_defaultReceiverRoyalty != address(0)) {
            defaultRoyaltyInfo = RoyaltyInfo(_defaultReceiverRoyalty, _defaultPercentageRoyalty);
            _setDefaultRoyalty(_defaultReceiverRoyalty, _defaultPercentageRoyalty);
        }

        emit ContractDeployed(_owner, _contractUri, _name, _symbol, _defaultReceiverRoyalty, _defaultPercentageRoyalty);
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

    // ============ OWNER-ONLY ADMIN FUNCTIONS ============

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

    // ============ PUBLIC MINT FUNCTIONS ============

    /**
     * @notice This function mints a token to a specified address.
     * @param _to The address where the token will be minted to.
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    function mint(address _to, string memory _tokenUri) public payable returns (uint256 tokenId) {
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
    function mintBatch(address _to, string[] memory _tokenUris) external payable returns (uint256[] memory tokenIds) {
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
     * @param _crossmintQuantity The number of tokens to be minted and transferred to the specified address. 
     * This parameter is required by the Crossmint service even though it is not used in the function's logic.
     * It should be set to a non-zero value for the transaction to be successful.
     * 
     * @param _to The address where the token will be minted to.
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @param _receiverRoyalty The address that will receive the royalty for the token being minted.
     * @param _percentageRoyalty The percentage of royalty that will be applied to the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    // solc-ignore-next-line unused-param
    function mintWithRoyalty(uint256 _crossmintQuantity, address _to, string memory _tokenUri, address _receiverRoyalty, uint96 _percentageRoyalty) external payable returns (uint256 tokenId) {
        tokenId = mint(_to, _tokenUri);
        _setTokenRoyalty(tokenId, _receiverRoyalty, _percentageRoyalty);
        emit MintWithRoyalty(_to, tokenId, _tokenUri, _receiverRoyalty, _percentageRoyalty);
    }

    /**
     * @notice This function performs the action of minting a batch of tokens,
     * while also calculating and distributing the specified royalty percentage to the designated receiver.
     * 
     * @param _crossmintQuantity The number of tokens to be minted and transferred to the specified address. 
     * This parameter is required by the Crossmint service even though it is not used in the function's logic.
     * It should be set to a non-zero value for the transaction to be successful.
     * 
     * @param _to The address where the tokens will be minted to.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @param _royaltyInputs.receiver -> The addresses that will receive the royalties for the tokens being minted.
     * @param _royaltyInputs.percentage -> The percentage of royalties that will be applied to each token being minted.
     * @return tokenIds The list of unique identifiers of the tokens that were minted, assigned to the owner's address.
     */
    // solc-ignore-next-line unused-param
    function mintBatchWithRoyalty(uint256 _crossmintQuantity, address _to, string[] memory _tokenUris, RoyaltyInput[] memory _royaltyInputs) external payable returns (uint256[] memory tokenIds) {
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

    /**
     * @notice Withdraw all funds from the contract
     */
    function withdrawFund() external nonReentrant {
        uint256 withdrawable = address(this).balance;
        require(withdrawable > 0, "Amount exceeds balance");
        Helper.safeTransferNative(owner(), withdrawable);
        emit WithdrawnFund(owner(), withdrawable);
    }

    // ===========Thirdweb=============

   /**
     *  This function returns who is authorized to set platform fee info for your contract.
     *
     *  As an EXAMPLE, we'll only allow the contract deployer to set the platform fee info.
     *
     *  You MUST complete the body of this function to use the `PlatformFee` extension.
     */
    function _canSetPlatformFeeInfo() internal view virtual override returns (bool) {
        return _msgSender() == owner();
    }
}