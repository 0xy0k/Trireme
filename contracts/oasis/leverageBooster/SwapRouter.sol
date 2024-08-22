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

    struct SwapRoute {
        address fromToken;
        address toToken;
        address pool;
        Dex dex;
    }

    bytes32 internal constant DAO_ROLE = keccak256('DAO_ROLE');
    bytes32 internal constant ROUTE_ROLE = keccak256('ROUTE_ROLE');

    IUniswapV2Router02 public constant uniV2Router =
        IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
    IUniswapV3Router public constant uniV3Router =
        IUniswapV3Router(0xE592427A0AEce92De3Edee1F18E0157C05861564);

    mapping(address => SwapRoute) public triRoutes;
    mapping(address => mapping(address => SwapRoute)) public routes;

    error No_Routes();
    error Invalid_Route();

    function initialize() external initializer {
        __AccessControl_init();

        _setupRole(DAO_ROLE, msg.sender);
        _setRoleAdmin(DAO_ROLE, DAO_ROLE);
        _setRoleAdmin(ROUTE_ROLE, DAO_ROLE);
    }

    function setRoute(
        address from,
        address to,
        address pool,
        Dex dex
    ) external onlyRole(ROUTE_ROLE) {
        if (
            from == address(0) ||
            to == address(0) ||
            pool == address(0) ||
            dex == Dex.NONE
        ) revert Invalid_Route();

        routes[from][to] = SwapRoute({
            fromToken: from,
            toToken: to,
            pool: pool,
            dex: dex
        });
    }

    function setTriRoute(
        address from,
        address to,
        address pool,
        Dex dex
    ) external onlyRole(ROUTE_ROLE) {
        if (
            from == address(0) ||
            to == address(0) ||
            pool == address(0) ||
            dex == Dex.NONE
        ) revert Invalid_Route();

        triRoutes[from] = SwapRoute({
            fromToken: from,
            toToken: to,
            pool: pool,
            dex: dex
        });
    }

    function swap(
        address fromToken,
        address toToken,
        uint fromAmount
    ) external returns (uint toOutput) {
        SwapRoute memory triRoute = triRoutes[fromToken];
        if (triRoute.dex != Dex.CURVE) revert No_Routes();

        IERC20Upgradeable(fromToken).safeTransferFrom(
            msg.sender,
            address(this),
            fromAmount
        );

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
            if (collRoute.dex == Dex.UNISWAP_V2) {
                toOutput = _swapStableOnUniswapV2(
                    collRoute.pool,
                    triRoute.toToken,
                    toToken,
                    stableOutput
                );
            } else {
                revert No_Routes();
            }
        }

        IERC20Upgradeable(toToken).safeTransfer(msg.sender, toOutput);
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
        address,
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
}
