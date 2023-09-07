// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

import {IERC20MintableBurnable} from '../interfaces/IERC20MintableBurnable.sol';
import {IERC20Pausable} from '../interfaces/IERC20Pausable.sol';
import {IUniswapV2Router02} from '../interfaces/IUniswapV2Router02.sol';

error INVALID_AMOUNT();
error INVALID_ETHER();

contract Activate is Ownable {
    using SafeERC20 for IERC20;

    /// @notice ADMIN
    address public constant ADMIN = 0xA004e4ceDea8497d6f028463e6756a5e6296bAd3;

    /// @notice TRIREME
    IERC20 public constant TRIREME =
        IERC20(0x5fE72ed557d8a02FFf49B3B826792c765d5cE162);

    /// @notice UniswapRouter
    IUniswapV2Router02 public constant ROUTER =
        IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);

    /// @notice Trireme amount of Liquidity
    uint256 public triremeForLiquidity = 16000 ether;

    /// @notice Eth amount of Liquidity
    uint256 public ethForLiquidity = 10 ether;

    /// @notice Trireme amount for burning
    uint256 public burnAmount = 60000 ether;

    /* ======== INITIALIZATION ======== */

    constructor() {
        _transferOwnership(ADMIN);
    }

    receive() external payable {}

    /* ======== POLICY FUNCTIONS ======== */

    function setLiquidity(uint256 trireme, uint256 eth) external onlyOwner {
        if (trireme == 0 || eth == 0) revert INVALID_AMOUNT();

        triremeForLiquidity = trireme;
        ethForLiquidity = eth;
    }

    function setBurn(uint256 trireme) external onlyOwner {
        burnAmount = trireme;
    }

    function activate() external payable onlyOwner {
        if (msg.value != ethForLiquidity) revert INVALID_ETHER();

        address account = _msgSender();

        // Unpause Trireme
        if (IERC20Pausable(address(TRIREME)).paused())
            IERC20Pausable(address(TRIREME)).unpause();

        // Burn Trireme
        if (burnAmount > 0) {
            IERC20MintableBurnable(address(TRIREME)).burnFrom(
                account,
                burnAmount
            );
        }

        // Transfer Trireme
        TRIREME.safeTransferFrom(account, address(this), triremeForLiquidity);
        TRIREME.approve(address(ROUTER), triremeForLiquidity);

        // Add Liquidity
        ROUTER.addLiquidityETH{value: ethForLiquidity}(
            address(TRIREME),
            triremeForLiquidity,
            0,
            0,
            account,
            block.timestamp
        );
    }
}
