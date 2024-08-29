// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

interface ISwapRouter {
    enum Dex {
        NONE,
        CURVE,
        UNISWAP_V2,
        UNISWAP_V3
    }

    struct SwapRoute {
        address fromToken;
        address toToken;
        address pool;
        Dex dex;
        uint fee;
    }

    function swap(
        SwapRoute memory route,
        uint fromAmount
    ) external returns (uint toOutput);
}
