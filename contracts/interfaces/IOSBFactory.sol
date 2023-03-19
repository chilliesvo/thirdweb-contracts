//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

interface IOSBFactory {
    function create(bool _isSingle, address _owner, address _controller, TokenInput memory _tokenInput) external returns (address);
}

struct TokenInfo {
    address owner;
    address token;
    address defaultReceiverRoyalty;
    uint96 defaultPercentageRoyalty;
    string contractUri;
    string name;
    string symbol;
    bool isSingle;
}

struct TokenInput {
    string contractUri;
    string name;
    string symbol;
    address defaultReceiverRoyalty;
    uint96 defaultPercentageRoyalty;
    uint256 maxTotalSupply;
}

struct RoyaltyInput {
    address receiver;
    uint96 percentage;
}