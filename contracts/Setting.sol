//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/ISetting.sol";

contract Setting is ISetting, OwnableUpgradeable {
    mapping(address => bool) public admins;
    mapping(address => bool) public controllers;

    event ContractDeployed(address indexed owner);
    event SetAdmin(address indexed account, bool allow);
    event SetController(address indexed account, bool allow);

    function initialize(address _owner) external initializer {
        require(_owner != address(0), "Invalid owner");
        OwnableUpgradeable.__Ownable_init();
        transferOwnership(_owner);
        emit ContractDeployed(_owner);
    }

    function getSuperAdmin() external view returns (address) {
        return owner();
    }

    function checkOnlySuperAdmin(address _caller) external view {
        require(isSuperAdmin(_caller), "Caller is not the super admin");
    }

    function checkOnlyAdmin(address _caller) external view {
        require(isAdmin(_caller), "Caller is not the admin");
    }

    function checkOnlySuperAdminOrController(address _caller) external view {
        require(isSuperAdmin(_caller) || isController(_caller), "Caller is not the super admin or controller");
    }

    function checkOnlyController(address _caller) external view {
        require(isController(_caller), "Caller is not the controller");
    }

    function isSuperAdmin(address _account) public view returns (bool) {
        return _account == owner();
    }

    function isAdmin(address _account) public view returns (bool) {
        return _account == owner() || admins[_account];
    }

    function isController(address _account) public view returns (bool) {
        return controllers[_account];
    }
    
    /**
     * @notice Delegate admin permission to account
     * @param _account account that set the admin
     * @param _allow setting value
     */   
    function setAdmin(address _account, bool _allow) external onlyOwner {
        require(_account != address(0), "Invalid account");
        require(_account != owner(), "Account is the owner");
        require(admins[_account] != _allow, "Duplicate setting");
        admins[_account] = _allow;
        emit SetAdmin(_account, _allow);
    }

    /**
     * @notice Delegate controller permission to account
     * @param _account account that set the controller
     * @param _allow setting value
     */
    function setController(address _account, bool _allow) external onlyOwner {
        require(_account != address(0), "Invalid account");
        require(controllers[_account] != _allow, "Duplicate setting");
        controllers[_account] = _allow;

        emit SetController(_account, _allow);
    }
}
