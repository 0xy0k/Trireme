// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface ISfrxEthWethDualOracle {
    function getPrices()
        external
        view
        returns (bool _isBadData, uint256 _priceLow, uint256 _priceHigh);
}
