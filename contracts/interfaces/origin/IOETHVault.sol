// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface IOETHVault {
    function totalValue() external view returns (uint256 value);
}
