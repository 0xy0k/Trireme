// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface IUniswapV2Factory {
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
}
