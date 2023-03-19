//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "./interfaces/IOSB721.sol";
import "./interfaces/IOSB1155.sol";
import "./interfaces/INFTChecker.sol";

contract Gift is ContextUpgradeable {
	INFTChecker public nftChecker;

	event Gifting(address indexed token, address indexed from, address[] to, uint256[] tokenIds);

    function initialize(address _nftChecker) external initializer {
        require(_nftChecker != address(0), "Invalid nftChecker");
		ContextUpgradeable.__Context_init();
        nftChecker = INFTChecker(_nftChecker);
    }

    function gifting(address _token, uint256[] memory _tokenIds, address[] memory _accounts) external {
		require(nftChecker.isERC721(_token) || nftChecker.isERC1155(_token), "Invalid token");
		require(_tokenIds.length == _accounts.length, "tokenIds and accounts length mismatch");

		if (nftChecker.isERC721(_token)) {
			for (uint256 i = 0; i < _tokenIds.length; i++) {
				IOSB721(_token).safeTransferFrom(_msgSender(), _accounts[i], _tokenIds[i]);
			}
		} else {
			for (uint256 i = 0; i < _tokenIds.length; i++) {
				IOSB1155(_token).safeTransferFrom(_msgSender(), _accounts[i], _tokenIds[i], 1, "");
			}
		}

		emit Gifting(_token, _msgSender(), _accounts, _tokenIds);
    }
}
