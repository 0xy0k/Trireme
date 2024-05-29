// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface IUniETHExchangeRate {
    function exchangeRatio() external view returns (uint256);
}
