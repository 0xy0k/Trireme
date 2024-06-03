// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

contract SingleStaking is ReentrancyGuardUpgradeable, AccessControlUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public stakingToken;
    IERC20Upgradeable public rewardToken;

    uint256 public totalStaked;
    uint256 public totalShares;

    uint256 public constant MIN_STAKING_PERIOD = 12 weeks;
    uint256 public constant MAX_STAKING_PERIOD = 52 weeks * 4;

    struct Stake {
        uint256 amount;
        uint256 shares;
        uint256 stakingPeriod;
        uint256 startTime;
        uint256 rewardDebt;
    }

    mapping(address => Stake) public stakes;

    uint256 public rewardPerShare;
    uint256 public lastRewardAmount;
    uint256 public lastRewardTime;
    uint256 public lastRewardRate;

    event Staked(address indexed user, uint amount, uint lockPeriod);
    event Withdrawn(address indexed user, uint amount);
    event Claimed(address indexed user, uint rewards);
    event ExtendsPeriod(address indexed user, uint period);
    event Relocked(address indexed user, uint period);
    event RewardsAdded(uint rewards);

    error InvalidStakingPeriod();
    error NoStaking(address user);
    error NotUnlocked(address user);

    function initialize(
        IERC20Upgradeable _stakingToken,
        IERC20Upgradeable _rewardToken
    ) external virtual initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
    }

    function lock(uint256 amount, uint256 stakingPeriod) external nonReentrant {
        if (
            stakingPeriod < MIN_STAKING_PERIOD ||
            stakingPeriod > MAX_STAKING_PERIOD
        ) revert InvalidStakingPeriod();

        _updateRewards();

        // Transfer staking tokens from the user to the contract
        stakingToken.transferFrom(msg.sender, address(this), amount);
        uint256 shares = calculateShares(amount, stakingPeriod);

        // Update user stake
        Stake storage stake = stakes[msg.sender];
        if (stake.amount > 0) {
            stake.rewardDebt += (stake.shares * rewardPerShare) / 1e18;
        }
        stake.amount += amount;
        stake.shares += shares;
        stake.stakingPeriod = stakingPeriod;
        stake.startTime = block.timestamp;

        totalStaked += amount;
        totalShares += shares;

        emit Staked(msg.sender, amount, stakingPeriod);
    }

    function unlock() external nonReentrant {
        _updateRewards();

        Stake storage stake = stakes[msg.sender];

        if (stake.amount == 0) revert NoStaking(msg.sender);
        if (block.timestamp < stake.startTime + stake.stakingPeriod)
            revert NotUnlocked(msg.sender);

        uint256 amount = stake.amount;
        uint256 shares = stake.shares;

        // Calculate the user's pending rewards
        uint256 pendingReward = (shares * rewardPerShare) /
            1e18 -
            stake.rewardDebt;

        // Reset the user's stake
        stake.amount = 0;
        stake.shares = 0;
        stake.stakingPeriod = 0;
        stake.startTime = 0;
        stake.rewardDebt = 0;

        totalStaked -= amount;
        totalShares -= shares;

        // Transfer the staked tokens and pending rewards back to the user
        stakingToken.transfer(msg.sender, amount);

        if (pendingReward > 0) {
            rewardToken.transfer(msg.sender, pendingReward);

            emit Claimed(msg.sender, pendingReward);
        }

        emit Withdrawn(msg.sender, amount);
    }

    function claim() external nonReentrant {
        _updateRewards();

        Stake storage stake = stakes[msg.sender];

        if (stake.amount == 0) revert NoStaking(msg.sender);

        uint256 shares = stake.shares;

        // Calculate the user's pending rewards
        uint256 pendingReward = (shares * rewardPerShare) /
            1e18 -
            stake.rewardDebt;

        // Update reward debt
        stake.rewardDebt = (shares * rewardPerShare) / 1e18;

        // Transfer the pending rewards to the user
        if (pendingReward > 0) {
            rewardToken.transfer(msg.sender, pendingReward);

            emit Claimed(msg.sender, pendingReward);
        }
    }

    function extendStakingPeriod(
        uint256 newStakingPeriod
    ) external nonReentrant {
        if (
            newStakingPeriod < MIN_STAKING_PERIOD ||
            newStakingPeriod > MAX_STAKING_PERIOD
        ) revert InvalidStakingPeriod();

        Stake storage stake = stakes[msg.sender];

        if (stake.amount == 0) revert NoStaking(msg.sender);

        _updateRewards();

        uint256 additionalShares = calculateShares(
            stake.amount,
            newStakingPeriod - stake.stakingPeriod
        );

        stake.shares += additionalShares;
        stake.stakingPeriod = newStakingPeriod;
        totalShares += additionalShares;

        emit ExtendsPeriod(msg.sender, newStakingPeriod);
    }

    function addMoreStaking(
        uint256 amount,
        uint256 newStakingPeriod
    ) external nonReentrant {
        if (
            newStakingPeriod < MIN_STAKING_PERIOD ||
            newStakingPeriod > MAX_STAKING_PERIOD
        ) revert InvalidStakingPeriod();

        _updateRewards();

        // Transfer staking tokens from the user to the contract
        stakingToken.transferFrom(msg.sender, address(this), amount);

        Stake storage stake = stakes[msg.sender];
        if (stake.amount == 0) revert NoStaking(msg.sender);

        uint256 newShares = calculateShares(
            stake.amount + amount,
            newStakingPeriod
        );

        totalShares = totalShares - stake.shares + newShares;
        totalStaked += amount;

        stake.amount += amount;
        stake.shares = newShares;
        stake.stakingPeriod = newStakingPeriod;
        stake.startTime = block.timestamp;
        stake.rewardDebt = (stake.shares * rewardPerShare) / 1e18;

        emit Staked(msg.sender, amount, newStakingPeriod);
    }

    function relock(uint256 newStakingPeriod) external nonReentrant {
        if (
            newStakingPeriod < MIN_STAKING_PERIOD ||
            newStakingPeriod > MAX_STAKING_PERIOD
        ) revert InvalidStakingPeriod();

        Stake storage stake = stakes[msg.sender];

        if (stake.amount == 0) revert NoStaking(msg.sender);
        if (block.timestamp < stake.startTime + stake.stakingPeriod)
            revert NotUnlocked(msg.sender);

        _updateRewards();

        uint256 pendingReward = (stake.shares * rewardPerShare) /
            1e18 -
            stake.rewardDebt;
        uint256 newShares = calculateShares(stake.amount, newStakingPeriod);

        totalShares = totalShares - stake.shares + newShares;

        stake.shares = newShares;
        stake.stakingPeriod = newStakingPeriod;
        stake.startTime = block.timestamp;
        stake.rewardDebt = (stake.shares * rewardPerShare) / 1e18;

        // Transfer the pending rewards to the user
        if (pendingReward > 0) {
            rewardToken.transfer(msg.sender, pendingReward);

            emit Claimed(msg.sender, pendingReward);
        }

        emit Relocked(msg.sender, newStakingPeriod);
    }

    function addRewards(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewardToken.transferFrom(msg.sender, address(this), amount);
        _updateRewards();

        if (lastRewardTime != 0) {
            lastRewardRate =
                lastRewardAmount /
                (block.timestamp - lastRewardTime);
        }
        lastRewardTime = block.timestamp;
        lastRewardAmount = amount;

        emit RewardsAdded(amount);
    }

    function _updateRewards() internal {
        if (totalShares > 0 && lastRewardAmount > 0) {
            rewardPerShare += (lastRewardAmount * 1e18) / totalShares;
            lastRewardAmount = 0;
        }
    }

    function calculateShares(
        uint256 amount,
        uint256 stakingPeriod
    ) public pure returns (uint256) {
        return (amount * stakingPeriod) / MAX_STAKING_PERIOD;
    }

    function getUserStake(
        address user
    )
        external
        view
        returns (
            uint256 amount,
            uint256 shares,
            uint256 stakingPeriod,
            uint256 startTime,
            uint256 rewardDebt
        )
    {
        Stake storage stake = stakes[user];

        return (
            stake.amount,
            stake.shares,
            stake.stakingPeriod,
            stake.startTime,
            stake.rewardDebt
        );
    }
}
