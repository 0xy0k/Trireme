// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ERC1155} from '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';
import {ERC1155Pausable} from '@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

import {IRewardRecipient} from '../interfaces/IRewardRecipient.sol';
import {IUniswapV2Router02} from '../interfaces/IUniswapV2Router02.sol';
import {IERC20MintableBurnable} from '../interfaces/IERC20MintableBurnable.sol';

error INVALID_ADDRESS();
error INVALID_AMOUNT();

contract Guardian is ERC1155Pausable, Ownable, IRewardRecipient {
    using SafeERC20 for IERC20;

    /* ======== STORAGE ======== */
    struct RewardRate {
        uint256 rewardPerSec;
        uint256 numberOfGuardians;
    }

    struct RewardInfo {
        uint256 debt;
        uint256 pending;
    }

    /// @notice TRIREME
    IERC20MintableBurnable public immutable TRIREME;

    /// @notice Fee Token (USDC)
    IERC20 public immutable USDC;

    /// @notice Uniswap Router
    IUniswapV2Router02 public immutable ROUTER;

    /// @notice price per guardian
    uint256 public immutable pricePerGuardian;

    /// @notice mint limit in one txn
    uint256 public mintLimit;

    /// @notice mapping account => total balance
    mapping(address => uint256) public totalBalanceOf;

    /// @notice total supply
    uint256 public totalSupply;

    /// @notice reward rate
    RewardRate public rewardRate;

    /// @dev TYPE
    uint8 private constant TYPE = 6;

    /// @dev SIZE for each TYPE
    uint8[6] private SIZES;

    /// @dev reward accTokenPerShare
    uint256 private accTokenPerShare;

    /// @dev reward lastUpdate
    uint256 private lastUpdate;

    /// @dev mapping account => reward info
    mapping(address => RewardInfo) private rewardInfoOf;

    /// @dev USDC dividendsPerShare
    uint256 private dividendsPerShare;

    /// @dev mapping account => dividends info
    mapping(address => RewardInfo) private dividendsInfoOf;

    /// @dev dividends multiplier
    uint256 private constant MULTIPLIER = 1e18;

    /* ======== EVENTS ======== */

    event MintLimit(uint256 oldLimit, uint256 newLimit);
    event Mint(address indexed from, address indexed to, uint256 amount);
    event Claim(address indexed from, uint256 reward, uint256 dividends);

    /* ======== INITIALIZATION ======== */

    constructor(
        IERC20MintableBurnable trireme,
        IERC20 usdc,
        IUniswapV2Router02 router
    ) ERC1155('https://trireme.co/guardian') {
        TRIREME = trireme;
        USDC = usdc;
        ROUTER = router;

        // 1 Guardian: Craftsman
        // 5 Guardian: Scribe
        // 10 Guardian: High Priest
        // 25 Guardian: Nobles
        // 50 Guardians: Viziers
        // 100 Guardian: Pharaoh
        SIZES = [1, 5, 10, 25, 50, 100];

        // 12 Trireme per Guardian
        pricePerGuardian = 12 ether;

        // option how many can mint in one txn
        mintLimit = 100;

        // 0.1 Trireme per day for first 250,000 guardians
        rewardRate.rewardPerSec = uint256(0.1 ether) / uint256(1 days);
        rewardRate.numberOfGuardians = 250000;
    }

    /* ======== MODIFIERS ======== */

    modifier update() {
        if (totalSupply > 0) {
            accTokenPerShare +=
                rewardRate.rewardPerSec *
                (block.timestamp - lastUpdate);
        }
        lastUpdate = block.timestamp;

        _;
    }

    /* ======== POLICY FUNCTIONS ======== */

    function setMintLimit(uint256 limit) external onlyOwner {
        if (limit == 0) revert INVALID_AMOUNT();

        uint256 old = mintLimit;
        mintLimit = limit;

        emit MintLimit(old, limit);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /* ======== INTERNAL FUNCTIONS ======== */

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _sync(address account) internal {
        uint256 totalBalance = totalBalanceOf[account];

        uint256[] memory ids = new uint256[](TYPE);
        uint256[] memory mintAmounts = new uint256[](TYPE);
        uint256[] memory burnAmounts = new uint256[](TYPE);

        unchecked {
            for (uint256 i = TYPE - 1; i >= 0; --i) {
                uint256 newBalance = totalBalance / SIZES[i];
                uint256 oldBalance = balanceOf(account, i);

                ids[i] = i;
                if (newBalance > oldBalance) {
                    mintAmounts[i] = newBalance - oldBalance;
                } else if (newBalance < oldBalance) {
                    burnAmounts[i] = oldBalance - newBalance;
                }

                totalBalance = totalBalance % SIZES[i];
            }
        }

        _mintBatch(account, ids, mintAmounts, '');
        _burnBatch(account, ids, burnAmounts);
    }

    function _updateReward(
        address account
    )
        internal
        returns (
            RewardInfo storage rewardInfo,
            RewardInfo storage dividendsInfo
        )
    {
        uint256 totalBalance = totalBalanceOf[account];

        rewardInfo = rewardInfoOf[account];
        rewardInfo.pending += accTokenPerShare * totalBalance - rewardInfo.debt;

        dividendsInfo = dividendsInfoOf[account];
        dividendsInfo.pending +=
            (dividendsPerShare * totalBalance) /
            MULTIPLIER -
            dividendsInfo.debt;
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override update {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);

        if (from == address(0) || to == address(0)) {
            return;
        }

        // update reward
        (
            RewardInfo storage fromRewardInfo,
            RewardInfo storage fromDividendsInfo
        ) = _updateReward(from);
        (
            RewardInfo storage toRewardInfo,
            RewardInfo storage toDividendsInfo
        ) = _updateReward(to);

        // calculate number of Guardians
        uint256 amount;
        unchecked {
            for (uint256 i = 0; i < ids.length; ++i) {
                amount += SIZES[ids[i]] * amounts[i];
            }
        }

        // update total balance
        unchecked {
            totalBalanceOf[from] -= amount;
            totalBalanceOf[to] += amount;
        }

        // update reward debt
        fromRewardInfo.debt = accTokenPerShare * totalBalanceOf[from];
        fromDividendsInfo.debt =
            (dividendsPerShare * totalBalanceOf[from]) /
            MULTIPLIER;
        toRewardInfo.debt = accTokenPerShare * totalBalanceOf[to];
        toDividendsInfo.debt =
            (dividendsPerShare * totalBalanceOf[to]) /
            MULTIPLIER;
    }

    /* ======== PUBLIC FUNCTIONS ======== */

    function stake(address to, uint256 amount) external update {
        if (to == address(0)) revert INVALID_ADDRESS();
        if (amount == 0 || amount > mintLimit) revert INVALID_AMOUNT();

        // burn Trireme
        TRIREME.burnFrom(_msgSender(), amount * pricePerGuardian);

        // update reward
        (
            RewardInfo storage rewardInfo,
            RewardInfo storage dividendsInfo
        ) = _updateReward(to);

        // mint Guardian
        unchecked {
            totalBalanceOf[to] += amount;
            totalSupply += amount;
        }

        // update reward rate if exceeds the Guardians number
        if (totalSupply > rewardRate.numberOfGuardians) {
            rewardRate.rewardPerSec /= 2;
            rewardRate.numberOfGuardians *= 2;
        }

        // update reward debt
        rewardInfo.debt = accTokenPerShare * totalBalanceOf[to];
        dividendsInfo.debt =
            (dividendsPerShare * totalBalanceOf[to]) /
            MULTIPLIER;

        // sync Guardians
        _sync(to);

        emit Mint(_msgSender(), to, amount);
    }

    function claim() external update {
        address account = _msgSender();
        uint256 totalBalance = totalBalanceOf[account];

        if (totalBalance == 0) return;

        // update reward
        (
            RewardInfo storage rewardInfo,
            RewardInfo storage dividendsInfo
        ) = _updateReward(account);

        rewardInfo.debt = accTokenPerShare * totalBalance;
        dividendsInfo.debt = (dividendsPerShare * totalBalance) / MULTIPLIER;

        // transfer pending (Trireme)
        uint256 reward = rewardInfo.pending;
        if (reward > 0) {
            rewardInfo.pending = 0;
            TRIREME.mint(account, reward);
        }

        // transfer pending (USDC)
        uint256 dividends = _min(
            dividendsInfo.pending,
            USDC.balanceOf(address(this))
        );
        if (dividends > 0) {
            unchecked {
                dividendsInfo.pending -= dividends;
            }
            USDC.safeTransfer(account, dividends);
        }

        emit Claim(account, reward, dividends);
    }

    function receiveReward() external payable override {
        if (msg.value == 0) return;

        address[] memory path = new address[](2);
        path[0] = ROUTER.WETH();
        path[1] = address(USDC);

        uint256 balanceBefore = USDC.balanceOf(address(this));
        ROUTER.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: msg.value
        }(0, path, address(this), block.timestamp);

        uint256 rewardAmount = USDC.balanceOf(address(this)) - balanceBefore;

        if (totalSupply > 0 && rewardAmount > 0) {
            dividendsPerShare += (rewardAmount * MULTIPLIER) / totalSupply;
        }
    }

    /* ======== PUBLIC FUNCTIONS ======== */

    function pendingReward(
        address account
    ) external view returns (uint256 reward, uint256 dividends) {
        uint256 totalBalance = totalBalanceOf[account];

        if (totalBalance > 0) {
            reward =
                (accTokenPerShare +
                    rewardRate.rewardPerSec *
                    (block.timestamp - lastUpdate)) *
                totalBalance -
                rewardInfoOf[account].debt;
            dividends =
                (dividendsPerShare * totalBalance) /
                MULTIPLIER -
                dividendsInfoOf[account].debt;
        }
    }
}
