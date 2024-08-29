// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import 'contracts/interfaces/ISwapRouter.sol';
import 'contracts/interfaces/uniswapV2/IUniswapV2Router02.sol';
import 'contracts/interfaces/uniswapV3/IUniswapV3Router.sol';
import 'contracts/interfaces/curve/ICurveStableSwapNG.sol';

contract SwapRouter is ISwapRouter, AccessControlUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 internal constant DAO_ROLE = keccak256('DAO_ROLE');

    IUniswapV2Router02 public constant uniV2Router =
        IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    IUniswapV3Router public constant uniV3Router =
        IUniswapV3Router(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    error No_Routes(address from, address to);
    error Invalid_Route();

    function initialize() external initializer {
        __AccessControl_init();

        _setupRole(DAO_ROLE, msg.sender);
        _setRoleAdmin(DAO_ROLE, DAO_ROLE);
    }

    function swap(
        SwapRoute memory route,
        uint fromAmount
    ) external returns (uint toOutput) {
        IERC20Upgradeable(route.fromToken).safeTransferFrom(
            msg.sender,
            address(this),
            fromAmount
        );

        if (route.dex == Dex.CURVE) {
            toOutput = _swapStableOnCurve(
                route.pool,
                route.fromToken,
                fromAmount
            );
        } else if (route.dex == Dex.UNISWAP_V2) {
            toOutput = _swapStableOnUniswapV2(
                route.fromToken,
                route.toToken,
                fromAmount
            );
        } else if (route.dex == Dex.UNISWAP_V3) {
            toOutput = _swapStableOnUniswapV3(
                route.fromToken,
                route.toToken,
                fromAmount,
                route.fee
            );
        } else {
            revert No_Routes(route.fromToken, route.toToken);
        }

        IERC20Upgradeable(route.toToken).safeTransfer(msg.sender, toOutput);
    }

    /**
     * Swap TriStablecoins to paired stablecoins on Curve
     * @param pool Curve pool address
     * @param fromToken TriStablecoin address
     * @param fromAmount Amount of tri stablecoin
     */
    function _swapStableOnCurve(
        address pool,
        address fromToken,
        uint fromAmount
    ) internal returns (uint toOutput) {
        IERC20Upgradeable(fromToken).approve(pool, fromAmount);

        /// @dev Tri stablecoins are all 0 index on TriUSD and TriETH curve pools.
        toOutput = ICurveStableSwapNG(pool).exchange(0, 1, fromAmount, 0);
    }

    function _swapStableOnUniswapV2(
        address fromToken,
        address toToken,
        uint fromAmount
    ) internal returns (uint toOutput) {
        IERC20Upgradeable(fromToken).approve(address(uniV2Router), fromAmount);

        uint beforeToBal = IERC20Upgradeable(toToken).balanceOf(address(this));
        address[] memory path = new address[](2);
        path[0] = fromToken;
        path[1] = toToken;

        uniV2Router.swapExactTokensForTokens(
            fromAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
        uint afterToBal = IERC20Upgradeable(toToken).balanceOf(address(this));

        toOutput = afterToBal - beforeToBal;
    }

    function _swapStableOnUniswapV3(
        address fromToken,
        address toToken,
        uint fromAmount,
        uint fee
    ) internal returns (uint toOutput) {
        IERC20Upgradeable(fromToken).approve(address(uniV3Router), fromAmount);

        uint beforeToBal = IERC20Upgradeable(toToken).balanceOf(address(this));
        IUniswapV3Router.ExactInputSingleParams memory params;
        params.tokenIn = fromToken;
        params.tokenOut = toToken;
        params.fee = uint24(fee);
        params.recipient = address(this);
        params.deadline = block.timestamp;
        params.amountIn = fromAmount;
        params.amountOutMinimum = 1;
        params.sqrtPriceLimitX96 = 0;
        uniV3Router.exactInputSingle(params);
        uint afterToBal = IERC20Upgradeable(toToken).balanceOf(address(this));

        toOutput = afterToBal - beforeToBal;
    }
}
