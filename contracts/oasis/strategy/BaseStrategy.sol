// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts/interfaces/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

abstract contract BaseStrategy {
    using SafeERC20 for IERC20;

    struct UserInfo {
        uint amount;
        uint rewardDebt;
    }

    address public vault;
    IERC20 public stakingToken;
    IERC20 public rewardToken;

    mapping(address => UserInfo) public userInfos;

    uint public totalStaked;
    uint public rewardPerShare;
    uint public lastRewardRate;
    uint public lastRewardTime;

    modifier onlyVault() {
        require(msg.sender == vault, 'Not from vault');
        _;
    }

    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }

    function deposit(address account, uint amount) external {
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        _updateRewards(0);
    }

    function withdraw(uint amount) external virtual;

    function _harvest() external virtual;

    function _updateRewards(uint _newRewards) internal {
        if (totalStaked > 0 && _newRewards > 0) {
            rewardPerShare += (_newRewards * 1e18) / totalStaked;
            lastRewardRate = _newRewards / (block.timestamp - lastRewardTime);
            lastRewardTime = block.timestamp;
        }
    }

    function _depositExternal(uint amount) internal virtual;
}
