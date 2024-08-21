// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface ISwBTC {
    function convertToAssets(uint amount) external view returns (uint);
}
