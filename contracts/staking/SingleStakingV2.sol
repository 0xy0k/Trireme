// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

contract SingleStakingV2 is
    ReentrancyGuardUpgradeable,
    AccessControlUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    address public stakingV1;
    IERC20Upgradeable public stakingToken;
    IERC20Upgradeable public rewardToken;

    uint256 public totalStaked;
    uint256 public totalShares;

    uint256 public constant ONE_MONTH = 4 weeks;
    uint256 public constant MIN_STAKING_PERIOD = ONE_MONTH * 3;
    uint256 public constant MAX_STAKING_PERIOD = ONE_MONTH * 12 * 4;
    uint256[4] public stakingPeriods;

    enum StakingPeriod {
        Quarter,
        HalfYear,
        OneYear,
        FourYears
    }

    struct Stake {
        uint256 amount;
        uint256 shares;
        uint256 stakingPeriod;
        uint256 startTime;
        uint256 rewardDebt;
    }

    mapping(bytes32 => Stake) public stakes;

    uint256 public rewardPerShare;
    uint256 public lastRewardTime;
    uint256 public lastRewardRate;

    bool public extendPeriodEnabled;
    bool public moreStakingEnabled;
    bool public relockEnabled;

    event Staked(address indexed user, uint amount, uint lockPeriod);
    event Withdrawn(address indexed user, uint amount);
    event Claimed(address indexed user, uint rewards);
    event ExtendsPeriod(address indexed user, uint period);
    event Relocked(address indexed user, uint period);
    event RewardsAdded(uint rewards);
    event ProfitsWithdrawn(address indexed to, uint amount);
    event StakeMoved(address indexed from, address to, uint period);

    error InvalidStakingPeriod();
    error NoStaking(address user, StakingPeriod period);
    error NotUnlocked(address user);
    error NotLocked(address user);
    error AlreadyLocked(address user, StakingPeriod period);
    error Disabled();

    modifier onlyStakingV1() {
        require(msg.sender == stakingV1, 'Not from staking v1');
        _;
    }

    function initialize(
        IERC20Upgradeable _stakingToken,
        IERC20Upgradeable _rewardToken
    ) external virtual initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        lastRewardTime = block.timestamp;
        stakingPeriods = [
            ONE_MONTH * 3,
            ONE_MONTH * 6,
            ONE_MONTH * 12,
            ONE_MONTH * 12 * 4
        ];
    }

    function lock(
        uint256 amount,
        StakingPeriod periodIndex
    ) external nonReentrant {
        uint stakingPeriod = stakingPeriods[uint8(periodIndex)];

        // Transfer staking tokens from the user to the contract
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        // Update user stake
        Stake storage stake = stakes[_getKey(msg.sender, periodIndex)];
        if (stake.amount > 0) revert AlreadyLocked(msg.sender, periodIndex);

        uint256 shares = calculateShares(amount, stakingPeriod);
        stake.amount = amount;
        stake.shares = shares;
        stake.stakingPeriod = stakingPeriod;
        stake.startTime = block.timestamp;
        stake.rewardDebt = (shares * rewardPerShare) / 1e18;

        totalStaked += amount;
        totalShares += shares;

        emit Staked(msg.sender, amount, stakingPeriod);
    }

    function unlock(StakingPeriod periodIndex) external nonReentrant {
        Stake storage stake = stakes[_getKey(msg.sender, periodIndex)];

        if (stake.amount == 0) revert NoStaking(msg.sender, periodIndex);

        bool unlocked = isUnlocked(msg.sender, periodIndex);
        uint256 amount = stake.amount;
        uint256 shares = stake.shares;
        uint256 burnAmount = 0;
        if (!unlocked) {
            burnAmount = amount / 2;
        }

        // Calculate the user's pending rewards
        _claimRewards(msg.sender, periodIndex);

        // Reset the user's stake
        delete stakes[_getKey(msg.sender, periodIndex)];

        totalStaked -= amount;
        totalShares -= shares;

        // Transfer the staked tokens and pending rewards back to the user
        stakingToken.safeTransfer(msg.sender, amount - burnAmount);
        if (burnAmount > 0) {
            stakingToken.safeTransfer(
                0x000000000000000000000000000000000000dEaD,
                burnAmount
            );
        }

        emit Withdrawn(msg.sender, amount - burnAmount);
    }

    function claim(StakingPeriod periodIndex) external nonReentrant {
        Stake storage stake = stakes[_getKey(msg.sender, periodIndex)];
        if (stake.amount == 0) revert NoStaking(msg.sender, periodIndex);

        _claimRewards(msg.sender, periodIndex);
    }

    function addMoreStaking(
        uint256 amount,
        StakingPeriod periodIndex
    ) external nonReentrant {
        if (!moreStakingEnabled) revert Disabled();
        // Transfer staking tokens from the user to the contract
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        Stake storage stake = stakes[_getKey(msg.sender, periodIndex)];
        if (stake.amount == 0) revert NoStaking(msg.sender, periodIndex);
        if (isUnlocked(msg.sender, periodIndex)) revert NotLocked(msg.sender);

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
        StakingPeriod periodIndex,
        StakingPeriod targetPeriodIndex
    ) external nonReentrant {
        if (!extendPeriodEnabled) revert Disabled();

        Stake memory stake = stakes[_getKey(msg.sender, periodIndex)];
        Stake storage targetStake = stakes[
            _getKey(msg.sender, targetPeriodIndex)
        ];

        if (stake.amount == 0) revert NoStaking(msg.sender, periodIndex);
        if (targetStake.amount > 0)
            revert AlreadyLocked(msg.sender, targetPeriodIndex);
        if (isUnlocked(msg.sender, periodIndex)) revert NotLocked(msg.sender);

        uint newStakingPeriod = stakingPeriods[uint8(targetPeriodIndex)];
        if (
            (block.timestamp + newStakingPeriod) <=
            (stake.startTime + stake.stakingPeriod)
        ) revert InvalidStakingPeriod();

        _claimRewards(msg.sender, periodIndex);
        delete stakes[_getKey(msg.sender, periodIndex)];

        uint256 newShares = calculateShares(stake.amount, newStakingPeriod);

        totalShares = totalShares - stake.shares + newShares;
        targetStake.amount = stake.amount;
        targetStake.shares = newShares;
        targetStake.startTime = block.timestamp;
        targetStake.stakingPeriod = newStakingPeriod;
        targetStake.rewardDebt = (newShares * rewardPerShare) / 1e18;

        emit ExtendsPeriod(msg.sender, newStakingPeriod);
    }

    function relock(
        StakingPeriod periodIndex,
        StakingPeriod targetPeriodIndex
    ) external nonReentrant {
        if (!relockEnabled) revert Disabled();

        Stake memory stake = stakes[_getKey(msg.sender, periodIndex)];
        Stake storage targetStake = stakes[
            _getKey(msg.sender, targetPeriodIndex)
        ];

        if (stake.amount == 0) revert NoStaking(msg.sender, periodIndex);
        if (targetStake.amount > 0)
            revert AlreadyLocked(msg.sender, targetPeriodIndex);
        if (!isUnlocked(msg.sender, periodIndex))
            revert NotUnlocked(msg.sender);

        _claimRewards(msg.sender, periodIndex);
        delete stakes[_getKey(msg.sender, periodIndex)];

        uint newStakingPeriod = stakingPeriods[uint8(targetPeriodIndex)];
        uint256 newShares = calculateShares(stake.amount, newStakingPeriod);

        totalShares = totalShares - stake.shares + newShares;

        targetStake.amount = stake.amount;
        targetStake.shares = newShares;
        targetStake.startTime = block.timestamp;
        targetStake.stakingPeriod = newStakingPeriod;
        targetStake.rewardDebt = (newShares * rewardPerShare) / 1e18;

        emit Relocked(msg.sender, newStakingPeriod);
    }

    function transferStaking(
        address to,
        StakingPeriod periodIndex
    ) external nonReentrant {
        Stake storage toStake = stakes[_getKey(to, periodIndex)];
        Stake storage fromStake = stakes[_getKey(msg.sender, periodIndex)];
        if (toStake.amount > 0) revert AlreadyLocked(to, periodIndex);

        toStake = fromStake;
        delete stakes[_getKey(msg.sender, periodIndex)];

        emit StakeMoved(msg.sender, to, toStake.stakingPeriod);
    }

    function migrateFromV1(
        address account,
        uint amount,
        uint period,
        uint startedFrom
    ) external nonReentrant onlyStakingV1 {
        StakingPeriod periodIndex;
        if (period >= stakingPeriods[uint(StakingPeriod.FourYears)])
            periodIndex = StakingPeriod.FourYears;
        else if (period >= stakingPeriods[uint(StakingPeriod.OneYear)])
            periodIndex = StakingPeriod.OneYear;
        else if (period >= stakingPeriods[uint(StakingPeriod.HalfYear)])
            periodIndex = StakingPeriod.HalfYear;
        else if (period >= stakingPeriods[uint(StakingPeriod.Quarter)])
            periodIndex = StakingPeriod.Quarter;

        uint stakingPeriod = stakingPeriods[uint8(periodIndex)];

        // Update user stake
        Stake storage stake = stakes[_getKey(account, periodIndex)];
        if (stake.amount > 0) revert AlreadyLocked(account, periodIndex);

        uint256 shares = calculateShares(amount, stakingPeriod);
        stake.amount = amount;
        stake.shares = shares;
        stake.stakingPeriod = stakingPeriod;
        stake.startTime = startedFrom;
        stake.rewardDebt = (shares * rewardPerShare) / 1e18;

        totalStaked += amount;
        totalShares += shares;

        emit Staked(account, amount, stakingPeriod);
    }

    function _claimRewards(address user, StakingPeriod periodIndex) internal {
        Stake storage stake = stakes[_getKey(user, periodIndex)];
        uint pendingReward = pendingRewards(user, periodIndex);
        if (pendingReward > 0) {
            rewardToken.safeTransfer(user, pendingReward);
            stake.rewardDebt = (stake.shares * rewardPerShare) / 1e18;
            emit Claimed(user, pendingReward);
        }
    }

    function _getKey(
        address user,
        StakingPeriod period
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, uint8(period)));
    }

    function addRewards(uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);

        if (totalShares > 0 && amount > 0) {
            rewardPerShare += (amount * 1e18) / totalShares;
        }
        lastRewardRate = amount / (block.timestamp - lastRewardTime);
        lastRewardTime = block.timestamp;

        emit RewardsAdded(amount);
    }

    function setStakingV1(
        address _stakingV1
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        stakingV1 = _stakingV1;
    }

    function enableRelock(bool enable) external onlyRole(DEFAULT_ADMIN_ROLE) {
        relockEnabled = enable;
    }

    function enableExtendPeriod(
        bool enable
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        extendPeriodEnabled = enable;
    }

    function enableMoreStaking(
        bool enable
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        moreStakingEnabled = enable;
    }

    function calculateShares(
        uint256 amount,
        uint256 stakingPeriod
    ) public pure returns (uint256) {
        return (amount * stakingPeriod) / MAX_STAKING_PERIOD;
    }

    function pendingRewards(address user) external view returns (uint) {
        uint rewards = 0;
        for (uint i = 0; i < 4; i++) {
            rewards += pendingRewards(user, StakingPeriod(i));
        }
        return rewards;
    }

    function pendingRewards(
        address user,
        StakingPeriod periodIndex
    ) public view returns (uint) {
        Stake storage stake = stakes[_getKey(user, periodIndex)];
        uint256 rewards = (stake.shares * rewardPerShare) /
            1e18 -
            stake.rewardDebt;
        return rewards;
    }

    function isUnlocked(
        address user,
        StakingPeriod periodIndex
    ) public view returns (bool) {
        Stake storage stake = stakes[_getKey(user, periodIndex)];

        return block.timestamp >= stake.startTime + stake.stakingPeriod;
    }

    function getUserStake(
        address user,
        StakingPeriod periodIndex
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
        Stake storage stake = stakes[_getKey(user, periodIndex)];

        return (
            stake.amount,
            stake.shares,
            stake.stakingPeriod,
            stake.startTime,
            stake.rewardDebt
        );
    }
}
