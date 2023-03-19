// SPDX-License-Identifier: MIT 
pragma solidity 0.8.16; 
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol"; 
import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol"; 
import "@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol"; 
import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol"; 
import "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import "../interfaces/INFTChecker.sol";

contract NFTChecker is INFTChecker, IERC165Upgradeable { 
    using ERC165CheckerUpgradeable for address; 
    bytes4 public constant IID_INFTCHECKER = type(INFTChecker).interfaceId; 
    bytes4 public constant IID_IERC165     = type(IERC165Upgradeable).interfaceId; 
    bytes4 public constant IID_IERC1155    = type(IERC1155Upgradeable).interfaceId; 
    bytes4 public constant IID_IERC721     = type(IERC721Upgradeable).interfaceId; 
    bytes4 public constant IID_IERC2981    = type(IERC2981Upgradeable).interfaceId; 
     
    function isERC1155(address _contractAddr) public view override returns (bool) { 
        return _contractAddr.supportsInterface(IID_IERC1155); 
    }     
     
    function isERC721(address _contractAddr) public view override returns (bool) { 
        return _contractAddr.supportsInterface(IID_IERC721); 
    }

    function isERC165(address _contractAddr) public view override returns (bool) {
        return _contractAddr.supportsInterface(IID_IERC165);
    }

    function isNFT(address _contractAddr) public view override returns (bool) {
        return isERC721(_contractAddr) || isERC1155(_contractAddr);
    }

    function isImplementRoyalty(address _contractAddr) public view override returns (bool) { 
        return _contractAddr.supportsInterface(IID_IERC2981); 
    } 
     
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) { 
        return interfaceId == IID_INFTCHECKER || interfaceId == IID_IERC165; 
    } 
}