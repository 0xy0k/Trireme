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
    error NotLocked(address user);
    error AlreadyLocked(address user);

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

        // Update user stake
        Stake storage stake = stakes[msg.sender];
        if (stake.amount > 0) revert AlreadyLocked(msg.sender);

        uint256 shares = calculateShares(amount, stakingPeriod);
        stake.amount = amount;
        stake.shares = shares;
        stake.stakingPeriod = stakingPeriod;
        stake.startTime = block.timestamp;
        stake.rewardDebt = (stake.shares * rewardPerShare) / 1e18;

        totalStaked += amount;
        totalShares += shares;

        emit Staked(msg.sender, amount, stakingPeriod);
    }

    function unlock() external nonReentrant {
        _updateRewards();

        Stake storage stake = stakes[msg.sender];

        if (stake.amount == 0) revert NoStaking(msg.sender);
        if (!isUnlocked(msg.sender)) revert NotUnlocked(msg.sender);

        uint256 amount = stake.amount;
        uint256 shares = stake.shares;

        // Calculate the user's pending rewards
        _claimRewards(msg.sender);

        // Reset the user's stake
        delete stakes[msg.sender];

        totalStaked -= amount;
        totalShares -= shares;

        // Transfer the staked tokens and pending rewards back to the user
        stakingToken.transfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function claim() external nonReentrant {
        Stake storage stake = stakes[msg.sender];
        if (stake.amount == 0) revert NoStaking(msg.sender);

        _updateRewards();
        _claimRewards(msg.sender);
    }

    function addMoreStaking(uint256 amount) external nonReentrant {
        _updateRewards();

        // Transfer staking tokens from the user to the contract
        stakingToken.transferFrom(msg.sender, address(this), amount);

        Stake storage stake = stakes[msg.sender];
        if (stake.amount == 0) revert NoStaking(msg.sender);
        if (isUnlocked(msg.sender)) revert NotLocked(msg.sender);

        uint256 additionalShares = calculateShares(
            amount,
            stake.startTime + stake.stakingPeriod - block.timestamp
        );

        totalShares += additionalShares;
        totalStaked += amount;

        stake.amount += amount;
        stake.shares += additionalShares;
        stake.rewardDebt =
            (additionalShares * rewardPerShare) /
            1e18 +
            stake.rewardDebt;

        emit Staked(msg.sender, amount, stake.stakingPeriod);
    }

    function extendStakingPeriod(
        uint256 newStakingPeriod
    ) external nonReentrant {
        Stake storage stake = stakes[msg.sender];

        if (stake.amount == 0) revert NoStaking(msg.sender);
        if (isUnlocked(msg.sender)) revert NotLocked(msg.sender);
        if (
            newStakingPeriod < MIN_STAKING_PERIOD ||
            newStakingPeriod <
            stake.startTime + stake.stakingPeriod - block.timestamp ||
            newStakingPeriod > MAX_STAKING_PERIOD
        ) revert InvalidStakingPeriod();

        _updateRewards();
        _claimRewards(msg.sender);

        uint256 newShares = calculateShares(stake.amount, newStakingPeriod);

        totalShares = totalShares - stake.shares + newShares;
        stake.shares = newShares;
        stake.stakingPeriod += newStakingPeriod;
        stake.rewardDebt = (newShares * rewardPerShare) / 1e18;

        emit ExtendsPeriod(msg.sender, newStakingPeriod);
    }

    function relock(uint256 newStakingPeriod) external nonReentrant {
        if (
            newStakingPeriod < MIN_STAKING_PERIOD ||
            newStakingPeriod > MAX_STAKING_PERIOD
        ) revert InvalidStakingPeriod();

        Stake storage stake = stakes[msg.sender];

        if (stake.amount == 0) revert NoStaking(msg.sender);
        if (!isUnlocked(msg.sender)) revert NotUnlocked(msg.sender);

        _updateRewards();
        _claimRewards(msg.sender);

        uint256 newShares = calculateShares(stake.amount, newStakingPeriod);

        totalShares = totalShares - stake.shares + newShares;

        stake.shares = newShares;
        stake.stakingPeriod = newStakingPeriod;
        stake.startTime = block.timestamp;
        stake.rewardDebt = (newShares * rewardPerShare) / 1e18;

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

    function updateRewards() external {
        _updateRewards();
    }

    function _updateRewards() internal {
        if (totalShares > 0 && lastRewardAmount > 0) {
            rewardPerShare += (lastRewardAmount * 1e18) / totalShares;
            lastRewardAmount = 0;
        }
    }

    function _claimRewards(address user) internal {
        Stake storage stake = stakes[user];
        uint pendingReward = pendingRewards(user);
        if (pendingReward > 0) {
            rewardToken.transfer(user, pendingReward);
            stake.rewardDebt = (stake.shares * rewardPerShare) / 1e18;
            emit Claimed(user, pendingReward);
        }
    }

    function calculateShares(
        uint256 amount,
        uint256 stakingPeriod
    ) public pure returns (uint256) {
        return (amount * stakingPeriod) / MAX_STAKING_PERIOD;
    }

    function pendingRewards(address user) public view returns (uint) {
        Stake storage stake = stakes[user];
        uint256 rewards = (stake.shares * rewardPerShare) /
            1e18 -
            stake.rewardDebt;
        return rewards;
    }

    function isUnlocked(address user) public view returns (bool) {
        Stake storage stake = stakes[user];

        return block.timestamp >= stake.startTime + stake.stakingPeriod;
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
