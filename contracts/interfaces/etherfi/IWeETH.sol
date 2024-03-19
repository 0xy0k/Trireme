// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface IWeETH {
    function getEETHByWeETH(
        uint256 _weETHAmount
    ) external view returns (uint256);
}
