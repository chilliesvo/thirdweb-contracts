//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { RoyaltyInput } from "./interfaces/IOSBFactory.sol";
import "./libraries/Helper.sol";

contract OSB1155PublicMint is ERC1155Upgradeable, ERC2981Upgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    RoyaltyInfo public defaultRoyaltyInfo;

    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter public lastId;

    /// @dev The name of the token.
    string public name;

    /// @dev The symbol of the token.
    string public symbol;

    /**
     * @dev Mapping for token metadata URIs.
     */
    mapping(uint256 => string) private _tokenURIs;

    // ============ EVENTS ============

    /// @dev Emit an event when the contract is deployed.
    event ContractDeployed(address indexed owner, string contractUri, string name, string symbol, address indexed defaultReceiverRoyalty, uint96 indexed defaultPercentageRoyalty);

    /// @dev Emit an event when mint success.
    event Mint(address indexed to, uint256 indexed tokenId, string tokenUri, uint256 amount);

    /// @dev Emit an event when mintBatch success.
    event MintBatch(address indexed to, uint256[] tokenIds, uint256[] amounts, string[] tokenUris);

    /// @dev Emit an event when mintWithRoyalty success.
    event MintWithRoyalty(address indexed to, uint256 amount, string tokenUri, address indexed receiverRoyalty, uint96 indexed percentageRoyalty);

    /// @dev Emit an event when MintBatchWithRoyalty success.
    event MintBatchWithRoyalty(address indexed to, string[] tokenUris, uint256[] tokenIds, uint256[] amounts, RoyaltyInput[] royaltyInputs);
    
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
        __ERC1155_init("");
        __Ownable_init();
        transferOwnership(_owner);

        _tokenURIs[0] = _contractUri;
        name = _name;
        symbol = _symbol;
        
        if (_defaultReceiverRoyalty != address(0)) {
            defaultRoyaltyInfo = RoyaltyInfo(_defaultReceiverRoyalty, _defaultPercentageRoyalty);
            _setDefaultRoyalty(_defaultReceiverRoyalty, _defaultPercentageRoyalty);
        }

        emit ContractDeployed(_owner, _contractUri, _name, _symbol, _defaultReceiverRoyalty, _defaultPercentageRoyalty);
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC1155Upgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
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

    // ============ OWNER OR CONTROLLER-ONLY FUNCTIONS ============

    /**
     * @notice This function mints a token to a specified address.
     * @param _to The address where the token will be minted to.
     * @param _amount The number of tokens to be minted.
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    function mint(address _to, uint256 _amount, string memory _tokenUri) public payable returns (uint256 tokenId) {
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
     * 
     * @param _crossmintQuantity The number of tokens to be minted and transferred to the specified address. 
     * This parameter is required by the Crossmint service even though it is not used in the function's logic.
     * It should be set to a non-zero value for the transaction to be successful.
     * 
     * @param _to The address where the tokens will be minted to.
     * @param _amounts An array of the number of tokens to be minted for each token.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @return tokenIds The list of unique identifiers of the tokens that were minted, assigned to the owner's address.
     */
    // solc-ignore-next-line unused-param
    function mintBatch(uint256 _crossmintQuantity, address _to, uint256[] memory _amounts, string[] memory _tokenUris) external payable returns (uint256[] memory tokenIds) {
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
    function mintWithRoyalty(address _to, uint256 _amount, string memory _tokenUri, address _receiverRoyalty, uint96 _percentageRoyalty) external payable returns (uint256 tokenId) {
        tokenId = mint(_to, _amount, _tokenUri);
        _setTokenRoyalty(tokenId, _receiverRoyalty, _percentageRoyalty);
        emit MintWithRoyalty(_to, _amount, _tokenUri, _receiverRoyalty, _percentageRoyalty);
    }

    /**
     * @notice Mint multiple tokens with specific quantities to a single address and set royalty for each token.
     * 
     * @param _crossmintQuantity The number of tokens to be minted and transferred to the specified address. 
     * This parameter is required by the Crossmint service even though it is not used in the function's logic.
     * It should be set to a non-zero value for the transaction to be successful.
     * 
     * @param _to The address where the tokens will be minted to.
     * @param _amounts The quantity of tokens to be minted.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @param _royaltyInputs.receiver -> The addresses that will receive the royalties for the tokens being minted.
     * @param _royaltyInputs.percentage -> The percentage of royalties that will be applied to each token being minted.
     * @return tokenIds The list of unique identifiers of the tokens that were minted, assigned to the owner's address.
     */
    // solc-ignore-next-line unused-param
    function mintBatchWithRoyalty(uint256 _crossmintQuantity, address _to, uint256[] memory _amounts, string[] memory _tokenUris, RoyaltyInput[] memory _royaltyInputs) external payable returns (uint256[] memory tokenIds) {
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

    /**
     * @notice Withdraw all funds from the contract
     */
    function withdrawFund() external nonReentrant {
        uint256 withdrawable = address(this).balance;
        require(withdrawable > 0, "Amount exceeds balance");
        Helper.safeTransferNative(owner(), withdrawable);
        emit WithdrawnFund(owner(), withdrawable);
    }
}
