// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract ConfidentialERC7984Token is ERC7984, ZamaEthereumConfig, Ownable, ReentrancyGuard {
    uint256 public constant TOKEN_BASE = 1_000_000;

    uint64 public immutable totalSupplyClear;
    uint64 public remainingForSaleClear;
    uint256 public pricePerTokenWei;

    event TokenPurchased(address indexed buyer, uint64 amount, uint256 requiredWei, uint256 paidWei);
    event PriceUpdated(uint256 oldPricePerTokenWei, uint256 newPricePerTokenWei);
    event Withdrawn(address indexed to, uint256 amountWei);

    error InvalidAmount();
    error SoldOut();
    error InsufficientPayment(uint256 requiredWei, uint256 paidWei);
    error RefundFailed();
    error InvalidWithdraw();

    constructor(
        string memory name_,
        string memory symbol_,
        uint64 totalSupply_,
        uint256 pricePerTokenWei_,
        string memory contractURI_,
        address owner_
    ) ERC7984(name_, symbol_, contractURI_) Ownable(owner_) {
        if (totalSupply_ == 0) revert InvalidAmount();

        totalSupplyClear = totalSupply_;
        remainingForSaleClear = totalSupply_;
        pricePerTokenWei = pricePerTokenWei_;

        _mint(address(this), FHE.asEuint64(totalSupply_));
    }

    function quoteBuy(uint64 amount) public view returns (uint256 requiredWei) {
        if (amount == 0) return 0;
        if (pricePerTokenWei == 0) return 0;
        requiredWei = Math.mulDiv(uint256(amount), pricePerTokenWei, TOKEN_BASE, Math.Rounding.Ceil);
    }

    function buy(uint64 amount) external payable nonReentrant returns (euint64 transferred) {
        if (amount == 0) revert InvalidAmount();
        if (amount > remainingForSaleClear) revert SoldOut();

        uint256 requiredWei = quoteBuy(amount);
        if (msg.value < requiredWei) revert InsufficientPayment(requiredWei, msg.value);

        remainingForSaleClear -= amount;
        transferred = _transfer(address(this), msg.sender, FHE.asEuint64(amount));

        uint256 refund = msg.value - requiredWei;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            if (!ok) revert RefundFailed();
        }

        emit TokenPurchased(msg.sender, amount, requiredWei, msg.value);
    }

    function setPricePerTokenWei(uint256 newPricePerTokenWei) external onlyOwner {
        emit PriceUpdated(pricePerTokenWei, newPricePerTokenWei);
        pricePerTokenWei = newPricePerTokenWei;
    }

    function withdraw(address payable to, uint256 amountWei) external onlyOwner nonReentrant {
        if (to == address(0) || amountWei == 0) revert InvalidWithdraw();
        if (amountWei > address(this).balance) revert InvalidWithdraw();

        (bool ok, ) = to.call{value: amountWei}("");
        if (!ok) revert InvalidWithdraw();

        emit Withdrawn(to, amountWei);
    }
}

