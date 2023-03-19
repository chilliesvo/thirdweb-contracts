//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "./interfaces/ISetting.sol";

contract OSBSoul is ERC721Upgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter public lastId;

    ISetting public setting;

    /**
     * @dev Mapping from wallet address to token ID.
     */
    mapping(address => uint256) public tokenIds;

    /**
     * @dev Mapping for token metadata URIs.
     */
    mapping(uint256 => string) private _tokenURIs;

    // ============ EVENTS ============

    /// @dev Emit an event when mint success.
    event Mint(uint256 indexed tokenId, address indexed account, string tokenUri);

    /// @dev Emit an event when mintBatch success.
    event MintBatch(address[] accounts, uint256[] tokenIdList, string[] tokenUris);

    /// @dev Emit an event when updated new token URI.
    event SetTokenURI(uint256 indexed tokenId, string oldUri, string newUri);

    /**
     * @notice This function sets the initial states of the contract and is only called once at deployment.
     * @param _setting Setting contract address.
     * @param _name The name of the token.
     * @param _symbol The symbol used to represent the token.
     */
    function initialize(address _setting, string memory _name, string memory _symbol) public initializer {
        __ERC721_init(_name, _symbol);
        setting = ISetting(_setting);
    }

    // ============ ACCESS CONTROL/SANITY MODIFIERS ============

    /**
     * @dev To check caller is admin
     */
    modifier onlyAdmin() {
        setting.checkOnlyAdmin(_msgSender());
        _;
    }

    /**
     * @notice This function mints a token to a specified address.
     * @param _to The address where the token will be minted to.
     * @param _tokenUri The metadata URI associated with the token being minted.
     * @return tokenId The unique identifier of the token that was minted, assigned to the owner's address.
     */
    function mint(address _to, string memory _tokenUri) public onlyAdmin returns(uint256 tokenId) {
        require(balanceOf(_to) == 0, "Address already has a token");
        require(bytes(_tokenUri).length > 0, "Invalid tokenUri");

        lastId.increment();
        _tokenURIs[lastId.current()] = _tokenUri;
        tokenId = lastId.current();
        tokenIds[_to] = lastId.current();
        _safeMint(_to, lastId.current());

        emit Mint(tokenId, _to, _tokenUri);
    }

    /**
     * @notice This function mints multiple tokens and assigns them to the specified addresses.
     * @param _accounts The addresses to which the tokens will be minted.
     * @param _tokenUris The metadata URIs associated with each token being minted.
     * @return tokenIdList The list of unique identifiers assigned to each token that was minted and assigned to its respective owner's address.
     */
    function mintBatch(address[] memory _accounts, string[] memory _tokenUris) external onlyAdmin returns (uint256[] memory tokenIdList) {
        require(_accounts.length > 0 && _accounts.length == _tokenUris.length, "Invalid parameters");
        tokenIdList = new uint256[](_accounts.length);

        for (uint256 i = 0; i < _accounts.length; i++) {
            tokenIdList[i] = mint(_accounts[i], _tokenUris[i]);
        }

        emit MintBatch(_accounts, tokenIdList, _tokenUris);
    }

    /**
     * @notice Sets the metadata URI for the specified token ID.
     * @param _tokenId Token ID.
     * @param _tokenUri New Metadata URI.
     * Requirements:
     * - The specified "tokenId" must exist.
     */
    function setTokenURI(uint256 _tokenId, string memory _tokenUri) external onlyAdmin {
        require(_tokenId > 0 && _tokenId <= lastId.current(), "URI set of nonexistent token");
        require(bytes(_tokenUri).length > 0, "Invalid tokenUri");

        string memory oldUri = _tokenURIs[_tokenId];
        _tokenURIs[_tokenId] = _tokenUri;
        
        emit SetTokenURI(_tokenId, oldUri, _tokenUri);
    }

    function _beforeTokenTransfer(address from, address to, uint256, uint256) internal virtual override {
        require(from == address(0) || to == address(0), "This a Soulbound token. It cannot be transferred");
    }

    /**
     * @notice Takes a tokenId and returns base64 string to represent the token metadata.
     * @param _tokenId Id of the token.
     * @return string base64
     */
    function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
        return _tokenURIs[_tokenId];
    }
}
