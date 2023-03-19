//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

interface IOSB1155 is IERC1155Upgradeable {
    function mint(address _to, uint256 _amount, string memory _tokenUri) external returns (uint256);
    function mintWithRoyalty(address _to, uint256 _amount, string memory _tokenUri, address _receiverRoyalty, uint96 _percentageRoyalty) external returns (uint256);
    function setController(address _account, bool _allow) external;
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice) external view returns (address, uint256);
}