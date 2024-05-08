// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IZap {
    function zapInToken(
        address token,
        uint amount,
        address receiver
    )
        external
        returns (uint256 amountTrireme, uint256 amountETH, uint256 liquidity);
}
