// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ConfidentialERC7984Token} from "./ConfidentialERC7984Token.sol";

contract ConfidentialTokenFactory {
    event TokenCreated(
        address indexed creator,
        address indexed token,
        string name,
        string symbol,
        uint64 totalSupplyClear,
        uint256 pricePerTokenWei
    );

    address[] private _allTokens;
    mapping(address creator => address[] tokens) private _tokensByCreator;

    function allTokensLength() external view returns (uint256) {
        return _allTokens.length;
    }

    function getAllTokens() external view returns (address[] memory) {
        return _allTokens;
    }

    function getTokensByCreator(address creator) external view returns (address[] memory) {
        return _tokensByCreator[creator];
    }

    function createToken(
        string calldata name_,
        string calldata symbol_,
        uint64 totalSupplyClear_,
        uint256 pricePerTokenWei_
    ) external returns (address token) {
        ConfidentialERC7984Token deployed = new ConfidentialERC7984Token(
            name_,
            symbol_,
            totalSupplyClear_,
            pricePerTokenWei_,
            "",
            msg.sender
        );

        token = address(deployed);
        _allTokens.push(token);
        _tokensByCreator[msg.sender].push(token);

        emit TokenCreated(msg.sender, token, name_, symbol_, totalSupplyClear_, pricePerTokenWei_);
    }
}

