// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import 'contracts/interfaces/ISwapRouter.sol';
import 'contracts/interfaces/curve/ICurveStableSwapNG.sol';

contract SwapRouter is ISwapRouter, AccessControlUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct SwapRoute {
        address fromToken;
        address toToken;
        address pool;
        Dex dex;
    }

    mapping(address => SwapRoute) public triRoutes;
    mapping(address => mapping(address => SwapRoute)) public routes;

    error No_Routes();

    // TODO: Add routes setting function

    function swap(
        address fromToken,
        address toToken,
        uint fromAmount
    ) external returns (uint toOutput) {
        SwapRoute memory triRoute = triRoutes[fromToken];
        if (triRoute.dex != Dex.CURVE) revert No_Routes();

        // Swap tri-stablecoin to stablecoins on curve (triUSD -> USDC, triETH -> WETH)
        uint stableOutput = _swapStableOnCurve(
            triRoute.pool,
            fromToken,
            fromAmount
        );

        // Swap stablecoins to toToken on uniswap
        if (triRoute.toToken == toToken) {
            // No need to swap again
            return stableOutput;
        } else {
            SwapRoute storage collRoute = routes[triRoute.toToken][toToken];
            if (triRoute.dex == Dex.UNISWAP_V2) {
                toOutput = _swapStableOnUniswapV2(collRoute.pool, fromAmount);
            } else {
                revert No_Routes();
            }
        }
    }

    function _swapStableOnCurve(
        address pool,
        address fromToken,
        uint fromAmount
    ) internal returns (uint toOutput) {
        IERC20Upgradeable(fromToken).safeTransferFrom(
            msg.sender,
            address(this),
            fromAmount
        );
        IERC20Upgradeable(fromToken).approve(pool, fromAmount);

        /// @dev Tri stablecoins are all 0 index on TriUSD and TriETH curve pools.
        toOutput = ICurveStableSwapNG(pool).exchange(0, 1, fromAmount, 0);
    }

    function _swapStableOnUniswapV2(
        address pool,
        uint fromAmount
    ) internal returns (uint toOutput) {}
}
