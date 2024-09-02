// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {PausableUpgradeable} from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import {ReentrancyGuardUpgradeable} from '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import {Babylonian} from '../libraries/Babylonian.sol';

import {IUniswapV2Pair} from '../interfaces/IUniswapV2Pair.sol';
import {IUniswapV2Factory} from '../interfaces/IUniswapV2Factory.sol';
import {IUniswapV2Router02} from '../interfaces/IUniswapV2Router02.sol';
import {IAddressProvider} from '../interfaces/IAddressProvider.sol';

contract Zap is
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    /// @notice address provider
    IAddressProvider public addressProvider;

    /// @notice Uniswap Router
    IUniswapV2Router02 public router;

    /// @notice Uniswap fee
    uint256 public uniswapFee;

    /* ======== ERRORS ======== */

    error INVALID_ADDRESS();
    error INVALID_AMOUNT();

    /* ======== INITIALIZATION ======== */

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _addressProvider,
        address _router
    ) external initializer {
        if (_addressProvider == address(0) || _router == address(0))
            revert INVALID_ADDRESS();

        // address provider
        addressProvider = IAddressProvider(_addressProvider);

        // uniswap router
        router = IUniswapV2Router02(_router);

        IERC20(addressProvider.getTrireme()).approve(_router, type(uint256).max);
        uniswapFee = 3; // 0.3% (1000 = 100%)

        __Ownable_init();
        __ReentrancyGuard_init();
        __Pausable_init();
    }

    receive() external payable {}

    /* ======== VIEW FUNCTIONS ======== */

    function lpToken() public view returns (address) {
        return
            IUniswapV2Factory(router.factory()).getPair(
                addressProvider.getTrireme(),
                router.WETH()
            );
    }

    /* ======== POLICY FUNCTIONS ======== */

    /**
     * @notice set address provider
     * @param _addressProvider address
     */
    function setAddressProvider(address _addressProvider) external onlyOwner {
        if (_addressProvider == address(0)) revert INVALID_ADDRESS();
        addressProvider = IAddressProvider(_addressProvider);
    }

    function setUniswapFee(uint256 fee) external onlyOwner {
        uniswapFee = fee;
    }

    /**
     * @notice recover tokens
     */
    function recoverERC20(IERC20 _token) external onlyOwner {
        uint256 amount = _token.balanceOf(address(this));

        if (amount > 0) {
            _token.safeTransfer(msg.sender, amount);
        }
    }

    /**
     * @notice recover ETH
     */
    function recoverETH() external onlyOwner {
        uint256 amount = address(this).balance;

        if (amount > 0) {
            payable(msg.sender).call{value: amount}('');
        }
    }

    /**
     * @notice pause
     */
    function pause() external onlyOwner whenNotPaused {
        return _pause();
    }

    /**
     * @notice unpause
     */
    function unpause() external onlyOwner whenPaused {
        return _unpause();
    }

    /* ======== PUBLIC FUNCTIONS ======== */

    function addLiquidity(
        uint256 _triremeAmount
    )
        external
        payable
        nonReentrant
        returns (uint256 amountTrireme, uint256 amountETH, uint256 liquidity)
    {
        if (_triremeAmount == 0 || msg.value == 0) revert INVALID_AMOUNT();

        IERC20 trireme = IERC20(addressProvider.getTrireme());
        trireme.safeTransferFrom(msg.sender, address(this), _triremeAmount);

        (amountTrireme, amountETH, liquidity) = router.addLiquidityETH{
            value: msg.value
        }(address(trireme), _triremeAmount, 0, 0, msg.sender, block.timestamp);

        uint256 remainingTrireme = _triremeAmount - amountTrireme;
        if (remainingTrireme > 0) {
            trireme.safeTransfer(msg.sender, remainingTrireme);
        }

        uint256 remainingETH = msg.value - amountETH;
        if (remainingETH > 0) {
            payable(msg.sender).call{value: remainingETH}('');
        }
    }

    function removeLiquidity(
        uint256 _liquidity
    ) external nonReentrant returns (uint256 amountTrireme, uint256 amountETH) {
        if (_liquidity == 0) revert INVALID_AMOUNT();

        IERC20 token = IERC20(lpToken());
        token.safeTransferFrom(msg.sender, address(this), _liquidity);
        token.approve(address(router), _liquidity);

        (amountTrireme, amountETH) = router.removeLiquidityETH(
            addressProvider.getTrireme(),
            _liquidity,
            0,
            0,
            msg.sender,
            block.timestamp
        );
    }

    function zapInToken(
        uint256 _triremeAmount
    )
        external
        nonReentrant
        returns (uint256 amountTrireme, uint256 amountETH, uint256 liquidity)
    {
        if (_triremeAmount == 0) revert INVALID_AMOUNT();

        address trireme = addressProvider.getTrireme();
        IERC20(trireme).safeTransferFrom(
            msg.sender,
            address(this),
            _triremeAmount
        );

        IUniswapV2Pair pair = IUniswapV2Pair(
            IUniswapV2Factory(router.factory()).getPair(trireme, router.WETH())
        );

        (uint256 rsv0, uint256 rsv1, ) = pair.getReserves();
        uint256 sellAmount = _calculateSwapInAmount(
            pair.token0() == trireme ? rsv0 : rsv1,
            _triremeAmount
        );

        address[] memory path = new address[](2);
        path[0] = trireme;
        path[1] = router.WETH();
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            sellAmount,
            0,
            path,
            address(this),
            block.timestamp
        );

        (amountTrireme, amountETH, liquidity) = router.addLiquidityETH{
            value: address(this).balance
        }(
            trireme,
            _triremeAmount - sellAmount,
            0,
            0,
            msg.sender,
            block.timestamp
        );

        uint256 remainingTrireme = _triremeAmount - amountTrireme - sellAmount;
        if (remainingTrireme > 0) {
            IERC20(trireme).safeTransfer(msg.sender, remainingTrireme);
        }
    }

    function zapInETH()
        external
        payable
        nonReentrant
        returns (uint256 amountTrireme, uint256 amountETH, uint256 liquidity)
    {
        if (msg.value == 0) revert INVALID_AMOUNT();

        address trireme = addressProvider.getTrireme();

        IUniswapV2Pair pair = IUniswapV2Pair(
            IUniswapV2Factory(router.factory()).getPair(trireme, router.WETH())
        );

        (uint256 rsv0, uint256 rsv1, ) = pair.getReserves();
        uint256 sellAmount = _calculateSwapInAmount(
            pair.token0() == trireme ? rsv1 : rsv0,
            msg.value
        );

        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = trireme;
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: sellAmount
        }(0, path, address(this), block.timestamp);

        (amountTrireme, amountETH, liquidity) = router.addLiquidityETH{
            value: msg.value - sellAmount
        }(
            trireme,
            IERC20(trireme).balanceOf(address(this)),
            0,
            0,
            msg.sender,
            block.timestamp
        );

        uint256 remainingETH = msg.value - amountETH - sellAmount;
        if (remainingETH > 0) {
            payable(msg.sender).call{value: remainingETH}('');
        }
    }

    function zapInToken(
        address token,
        uint amount,
        address receiver
    )
        external
        returns (uint256 amountTrireme, uint256 amountETH, uint256 liquidity)
    {
        if (receiver == address(0)) revert INVALID_ADDRESS();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(address(router), amount);

        // Swap token to ETH
        address[] memory path = new address[](2);
        path[0] = address(token);
        path[1] = router.WETH();
        router.swapExactTokensForETH(
            amount,
            0,
            path,
            address(this),
            block.timestamp
        );

        uint ethBal = address(this).balance;

        // Swap half in tri and add liquidity
        address trireme = addressProvider.getTrireme();
        uint256 sellAmount = _getRequiredSellAmount(ethBal);

        path[0] = router.WETH();
        path[1] = trireme;
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: sellAmount
        }(0, path, address(this), block.timestamp);

        (amountTrireme, amountETH, liquidity) = router.addLiquidityETH{
            value: ethBal - sellAmount
        }(
            trireme,
            IERC20(trireme).balanceOf(address(this)),
            0,
            0,
            receiver,
            block.timestamp
        );
        uint256 remainingETH = ethBal - amountETH - sellAmount;
        if (remainingETH > 0) {
            payable(receiver).call{value: remainingETH}('');
        }
    }

    /* ======== INTERNAL FUNCTIONS ======== */

    function _getRequiredSellAmount(
        uint ethAmount
    ) internal view returns (uint) {
        address trireme = addressProvider.getTrireme();
        IUniswapV2Pair pair = IUniswapV2Pair(
            IUniswapV2Factory(router.factory()).getPair(trireme, router.WETH())
        );

        (uint256 rsv0, uint256 rsv1, ) = pair.getReserves();
        uint256 sellAmount = _calculateSwapInAmount(
            pair.token0() == trireme ? rsv1 : rsv0,
            ethAmount
        );
        return sellAmount;
    }

    function _calculateSwapInAmount(
        uint256 reserveIn,
        uint256 userIn
    ) internal view returns (uint256) {
        return
            (Babylonian.sqrt(
                reserveIn *
                    ((userIn * (uint256(4000) - (4 * uniswapFee)) * 1000) +
                        (reserveIn *
                            ((uint256(4000) - (4 * uniswapFee)) *
                                1000 +
                                uniswapFee *
                                uniswapFee)))
            ) - (reserveIn * (2000 - uniswapFee))) / (2000 - 2 * uniswapFee);
    }
}
