// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../helios/usd/valueProviders/NormalERC20ValueProvider.sol';

contract MockERC20ValueProvider is NormalERC20ValueProvider {
    uint tempPrice;

    function setPriceUSD(uint amount) external {
        tempPrice = amount;
    }

    /// @return The value for the collection, in USD.
    function getPriceUSD() public view override returns (uint) {
        if (tempPrice > 0) return tempPrice;
        else return super.getPriceUSD();
    }
}
