// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface IYnETH {
    function totalAssets() external view returns (uint256);

    function totalSupply() external view returns (uint256);
}
