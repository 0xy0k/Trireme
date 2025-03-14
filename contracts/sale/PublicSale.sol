// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Pausable} from '@openzeppelin/contracts/security/Pausable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/security/ReentrancyGuard.sol';

import {IERC20MintableBurnable} from '../interfaces/IERC20MintableBurnable.sol';

error INVALID_AMOUNT();
error NO_ETHER();
error LIMIT_ETHER();
error EXCEED_SALE();
error NOT_STARTED();
error ALREADY_ENDED();

contract PublicSale is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice TRIREME
    IERC20MintableBurnable public immutable TRIREME;

    /// @notice total trireme amount
    uint256 public totalTriremeAmount;

    /// @notice total eth amount
    uint256 public totalEthAmount;

    /// @notice sold trireme amount
    uint256 public triremeAmount;

    /// @notice received eth amount
    uint256 public ethAmount;

    /// @notice start timestamp
    uint256 public startTimestamp;

    /// @notice end timestamp
    uint256 public endTimestamp;

    /// @notice limit eth per user
    uint256 public limitEth = 2 ether;

    /// @notice user => eth
    mapping(address => uint256) public userEth;

    /* ======== EVENTS ======== */

    event Sale(
        address indexed account,
        uint256 ethAmount,
        uint256 triremeAmount
    );

    /* ======== INITIALIZATION ======== */

    constructor(
        IERC20MintableBurnable trireme,
        uint256 totalTrireme,
        uint256 totalEth,
        uint256 start,
        uint256 end
    ) {
        require(totalTrireme > 0 && totalEth > 0);
        require(end > start && start > block.timestamp);

        TRIREME = trireme;
        totalTriremeAmount = totalTrireme;
        totalEthAmount = totalEth;
        startTimestamp = start;
        endTimestamp = end;
    }

    receive() external payable {}

    /* ======== POLICY FUNCTIONS ======== */

    function setTotalAmount(
        uint256 totalTrireme,
        uint256 totalEth
    ) external onlyOwner {
        if (totalTrireme == 0 || totalEth == 0) revert INVALID_AMOUNT();

        totalTriremeAmount = totalTrireme;
        totalEthAmount = totalEth;
    }

    function setTimestamp(uint256 start, uint256 end) external onlyOwner {
        if (end < block.timestamp || start >= end) revert ALREADY_ENDED();

        startTimestamp = start;
        endTimestamp = end;
    }

    function setLimitEth(uint256 eth) external onlyOwner {
        if (eth == 0) revert NO_ETHER();

        limitEth = eth;
    }

    function withdrawETH(address payable to) external onlyOwner {
        (bool sent, ) = to.call{value: address(this).balance}('');
        require(sent, 'Failed to send Ether');
    }

    function recoverERC20(IERC20 asset, address to) external onlyOwner {
        asset.safeTransfer(to, asset.balanceOf(address(this)));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /* ======== PUBLIC FUNCTIONS ======== */

    function maxEth(address account) external view returns (uint256) {
        return limitEth - userEth[account];
    }

    function buy() external payable whenNotPaused nonReentrant {
        if (startTimestamp > block.timestamp) revert NOT_STARTED();
        if (endTimestamp < block.timestamp) revert ALREADY_ENDED();

        uint256 eth = msg.value;
        if (eth == 0) revert NO_ETHER();

        address account = _msgSender();
        userEth[account] += eth;
        if (userEth[account] > limitEth) revert LIMIT_ETHER();

        uint256 amount = (eth * totalTriremeAmount) / totalEthAmount;
        triremeAmount += amount;
        ethAmount += eth;

        if (triremeAmount > totalTriremeAmount) revert EXCEED_SALE();

        TRIREME.mint(account, amount);
    }
}
