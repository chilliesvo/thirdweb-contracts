// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts/utils/Context.sol";
import "./interfaces/IRandomizer.sol";
import "./interfaces/ISetting.sol";

// Single implementation of randomizer that uses CL for a random number. 1 Random number per commit.
// This is not an upgradeable contract as CL relies on the constructor.
contract Randomizer is IRandomizer, Context {
    ISetting public setting;

    uint256 public randomResult;

    mapping(address => bool) public admins;

    event AdminChanged(address _account, bool _accepted);

    modifier onlyAdmin() {
        require(admins[_msgSender()], "RandomizerCL: Not admin or owner");
        _;
    }

    constructor(address _setting) {
        require(_setting != address(0), "Invalid setting address");
        setting = ISetting(_setting);
    }

    function setAdmin(address _account, bool _status) external {
        require(setting.getSuperAdmin() == _msgSender(), "Only supper admin");
        require(_account != address(0), "Invalid address");

        admins[_account] = _status;
        emit AdminChanged(_account, _status);
    }

    function getRandomNumber() external override onlyAdmin returns (bytes32) {
        bytes32 _result = keccak256(abi.encodePacked(tx.origin, blockhash(block.number - 1), block.timestamp));
        randomResult = uint256(_result);
        return _result;
    }

    function random(uint256 _seed) external override onlyAdmin returns (uint256) {
        uint256 randomNumber = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), msg.sender, _seed, randomResult)));
        randomResult = randomNumber;
        return randomNumber;
    }
}
