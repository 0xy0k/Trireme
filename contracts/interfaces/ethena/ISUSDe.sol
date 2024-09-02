// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface ISUSDe {
    function convertToAssets(uint256 shares) external view returns (uint256);
}
