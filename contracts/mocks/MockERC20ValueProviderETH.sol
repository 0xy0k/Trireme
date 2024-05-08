// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../helios/eth/valueProviders/NormalERC20ValueProviderETH.sol';

contract MockERC20ValueProviderETH is NormalERC20ValueProviderETH {
    uint tempPrice;

    function setPriceETH(uint amount) external {
        tempPrice = amount;
    }

    /// @return The value for the collection, in USD.
    function getPriceETH() public view override returns (uint) {
        if (tempPrice > 0) return tempPrice;
        else return super.getPriceETH();
    }
}
