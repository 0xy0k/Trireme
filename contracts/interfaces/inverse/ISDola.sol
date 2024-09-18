// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

interface ISDola {
    function convertToAssets(uint shares) external view returns (uint);

    function convertToShares(uint assets) external view returns (uint);
}
