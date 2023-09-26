// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import {PausableUpgradeable} from '@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol';
import {EnumerableSet} from '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IERC20Metadata} from '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import {IAddressProvider} from '../interfaces/IAddressProvider.sol';
import {IPriceOracleAggregator} from '../interfaces/IPriceOracleAggregator.sol';

contract BondV2 is OwnableUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;

    /* ======== STORAGE ======== */

    struct Bond {
        uint256 depositId; // deposit Id
        address principal; // token used to create bond
        uint256 amount; // princial deposited amount
        uint256 payout; // trireme remaining to be paid
        uint256 vesting; // Blocks left to vest
        uint256 lastBlockAt; // Last interaction
        uint256 pricePaid; // In DAI, for front end viewing
        address depositor; //deposit address
    }

    /// @notice percent multiplier (100%)
    uint256 public constant MULTIPLIER = 10000;

    /// @notice trireme decimals
    uint256 public constant UNIT = 1e18;

    /// @notice address provider
    IAddressProvider public addressProvider;

    /// @dev tokens used to create bond
    EnumerableSet.AddressSet private principals;

    /// @notice id of deposit
    uint256 public depositId;

    /// @notice mapping depositId => bond info
    mapping(uint256 => Bond) public bondInfo;

    /// @dev mapping account => depositId array
    mapping(address => EnumerableSet.UintSet) private ownedDeposits;

    /// @notice stores locking periods of discounts
    uint256[] public lockingPeriods;

    /// @notice mapping locking period => discount
    mapping(uint256 => uint256) public lockingDiscounts;

    /// @notice total remaining payout for bonding
    uint256 public totalRemainingPayout;

    /// @notice total amount of payout assets sold to the bonders
    uint256 public totalBondedValue;

    /// @notice mapping principal => total bonded amount
    mapping(address => uint256) public totalPrincipals;

    /* ======== EVENTS ======== */

    event BondCreated(
        uint256 depositId,
        address principal,
        uint256 deposit,
        uint256 indexed payout,
        uint256 indexed expires,
        uint256 indexed priceInUSD
    );
    event BondRedeemed(
        uint256 depositId,
        address indexed recipient,
        uint256 payout,
        uint256 remaining
    );

    /* ======== ERRORS ======== */

    error INVALID_ADDRESS();
    error INVALID_AMOUNT();
    error INVALID_PERIOD();
    error INVALID_PRINCIPAL();
    error LIMIT_SLIPPAGE();
    error TOO_SMALL();
    error INSUFFICIENT_BALANCE();
    error NOT_OWNED_DEPOSIT();
    error NOT_FULLY_VESTED();

    /* ======== INITIALIZATION ======== */

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _addressProvider) external initializer {
        if (_addressProvider == address(0)) revert INVALID_ADDRESS();

        // address provider
        addressProvider = IAddressProvider(_addressProvider);

        // deposit index
        depositId = 1;

        // init
        __Ownable_init();
        __Pausable_init();
    }

    /* ======== MODIFIER ======== */

    modifier onlyPrincipal(address _principal) {
        if (!principals.contains(_principal)) revert INVALID_PRINCIPAL();
        _;
    }

    /* ======== POLICY FUNCTIONS ======== */

    /**
     * @notice set discount for locking period
     * @param _lockingPeriod uint
     * @param _discount uint
     */
    function setLockingDiscount(
        uint256 _lockingPeriod,
        uint256 _discount
    ) external onlyOwner {
        if (_lockingPeriod == 0) revert INVALID_PERIOD();
        if (_discount >= MULTIPLIER) revert INVALID_AMOUNT();

        // remove locking period
        if (_discount == 0) {
            uint256 length = lockingPeriods.length;

            for (uint256 i = 0; i < length; i++) {
                if (lockingPeriods[i] == _lockingPeriod) {
                    lockingPeriods[i] = lockingPeriods[length - 1];
                    delete lockingPeriods[length - 1];
                    lockingPeriods.pop();
                }
            }
        }
        // push if new locking period
        else if (lockingDiscounts[_lockingPeriod] == 0) {
            lockingPeriods.push(_lockingPeriod);
        }

        lockingDiscounts[_lockingPeriod] = _discount;
    }

    /**
     * @notice set address provider
     * @param _addressProvider address
     */
    function setAddressProvider(address _addressProvider) external onlyOwner {
        if (_addressProvider == address(0)) revert INVALID_ADDRESS();
        addressProvider = IAddressProvider(_addressProvider);
    }

    /**
     * @notice add principals
     * @param _principals address[]
     */
    function addPrincipals(address[] calldata _principals) external onlyOwner {
        uint256 length = _principals.length;

        for (uint256 i = 0; i < length; i++) {
            address principal = _principals[i];
            if (principal == address(0)) revert INVALID_PRINCIPAL();

            principals.add(principal);
        }
    }

    /**
     * @notice remove principals
     * @param _principals address[]
     */
    function removePrincipals(
        address[] calldata _principals
    ) external onlyOwner {
        uint256 length = _principals.length;

        for (uint256 i = 0; i < length; i++) {
            address principal = _principals[i];
            if (principal == address(0)) revert INVALID_PRINCIPAL();

            principals.remove(principal);
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

    /* ======== USER FUNCTIONS ======== */

    /**
     *  @notice deposit bond
     *  @param _principal address
     *  @param _amount uint
     *  @param _maxPrice uint
     *  @param _lockingPeriod uint
     *  @return uint
     */
    function deposit(
        address _principal,
        uint256 _amount,
        uint256 _maxPrice,
        uint256 _lockingPeriod
    ) external onlyPrincipal(_principal) whenNotPaused returns (uint256) {
        if (_amount == 0) revert INVALID_AMOUNT();

        uint256 discount = lockingDiscounts[_lockingPeriod];
        if (discount == 0) revert INVALID_PERIOD();

        uint256 priceInUSD = (bondPrice() * (MULTIPLIER - discount)) /
            MULTIPLIER; // Stored in bond info
        if (priceInUSD > _maxPrice) revert LIMIT_SLIPPAGE();

        uint256 payout = payoutFor(_principal, _amount, discount); // payout to bonder is computed
        if (payout < UNIT / 100) revert TOO_SMALL(); // must be > 0.01 trireme

        // total remaining payout is increased
        totalRemainingPayout = totalRemainingPayout + payout;
        if (
            totalRemainingPayout >
            IERC20(addressProvider.getTrireme()).balanceOf(address(this))
        ) revert INSUFFICIENT_BALANCE();

        // total bonded value is increased
        totalBondedValue = totalBondedValue + payout;

        // principal is transferred
        IERC20(_principal).safeTransferFrom(
            msg.sender,
            addressProvider.getTreasury(),
            _amount
        );

        totalPrincipals[_principal] = totalPrincipals[_principal] + _amount;

        // depositor info is stored
        bondInfo[depositId] = Bond({
            depositId: depositId,
            principal: _principal,
            amount: _amount,
            payout: payout,
            vesting: _lockingPeriod,
            lastBlockAt: block.timestamp,
            pricePaid: priceInUSD,
            depositor: msg.sender
        });

        ownedDeposits[msg.sender].add(depositId);

        // event
        emit BondCreated(
            depositId,
            _principal,
            _amount,
            payout,
            block.timestamp + _lockingPeriod,
            priceInUSD
        );

        // increase deposit index
        depositId += 1;

        return payout;
    }

    /**
     *  @notice redeem bond for user
     *  @param _depositId uint
     *  @return uint
     */
    function redeem(
        uint256 _depositId
    ) external whenNotPaused returns (uint256) {
        Bond memory info = bondInfo[_depositId];
        address _recipient = info.depositor;
        if (msg.sender != _recipient) revert NOT_OWNED_DEPOSIT();

        // (blocks since last interaction / vesting term remaining)
        if (percentVestedFor(_depositId) < MULTIPLIER)
            revert NOT_FULLY_VESTED();

        // delete user info
        delete bondInfo[_depositId];
        ownedDeposits[_recipient].remove(_depositId);

        // total remaining payout is decreased
        totalRemainingPayout -= info.payout;

        // send payout
        IERC20(addressProvider.getTrireme()).safeTransfer(
            _recipient,
            info.payout
        );

        // event
        emit BondRedeemed(_depositId, _recipient, info.payout, 0);

        return info.payout;
    }

    /* ======== VIEW FUNCTIONS ======== */

    /**
     *  @return price_ uint
     */
    function bondPrice() public view returns (uint256 price_) {
        price_ = IPriceOracleAggregator(
            addressProvider.getPriceOracleAggregator()
        ).viewPriceInUSD(addressProvider.getTrireme());
    }

    /**
     *  @notice calculate interest due for new bond
     *  @param _principal address
     *  @param _amount uint
     *  @param _discount uint
     *  @return uint
     */
    function payoutFor(
        address _principal,
        uint256 _amount,
        uint256 _discount
    ) public view returns (uint256) {
        uint256 nativePrice = (bondPrice() * (MULTIPLIER - _discount)) /
            MULTIPLIER;

        return
            (_amount *
                IPriceOracleAggregator(
                    addressProvider.getPriceOracleAggregator()
                ).viewPriceInUSD(_principal) *
                UNIT) /
            (nativePrice * 10 ** IERC20Metadata(_principal).decimals());
    }

    /**
     *  @notice calculate how far into vesting a depositor is
     *  @param _depositId uint
     *  @return percentVested_ uint
     */
    function percentVestedFor(
        uint256 _depositId
    ) public view returns (uint256 percentVested_) {
        Bond memory bond = bondInfo[_depositId];
        uint256 timestampSinceLast = block.timestamp - bond.lastBlockAt;
        uint256 vesting = bond.vesting;

        if (vesting > 0) {
            percentVested_ = (timestampSinceLast * MULTIPLIER) / vesting;
        } else {
            percentVested_ = 0;
        }
    }

    /**
     *  @notice calculate amount of trireme available for claim by depositor
     *  @param _depositId uint
     *  @return pendingPayout_ uint
     */
    function pendingPayoutFor(
        uint256 _depositId
    ) public view returns (uint256 pendingPayout_) {
        uint256 percentVested = percentVestedFor(_depositId);
        uint256 payout = bondInfo[_depositId].payout;

        if (percentVested >= MULTIPLIER) {
            pendingPayout_ = payout;
        } else {
            pendingPayout_ = (payout * percentVested) / MULTIPLIER;
        }
    }

    /**
     *  @notice return minimum principal amount to deposit
     *  @param _principal address
     *  @param _discount uint
     *  @param amount_ principal amount
     */
    function minimumPrincipalAmount(
        address _principal,
        uint256 _discount
    ) external view onlyPrincipal(_principal) returns (uint256 amount_) {
        uint256 nativePrice = (bondPrice() * (MULTIPLIER - _discount)) /
            MULTIPLIER;

        amount_ =
            ((UNIT / 100) *
                nativePrice *
                10 ** IERC20Metadata(_principal).decimals()) /
            (IPriceOracleAggregator(addressProvider.getPriceOracleAggregator())
                .viewPriceInUSD(_principal) * UNIT);
    }

    /**
     *  @notice show all tokens used to create bond
     *  @return principals_ address[]
     *  @return prices_ uint256[]
     */
    function allPrincipals()
        external
        view
        returns (address[] memory principals_, uint256[] memory prices_)
    {
        principals_ = principals.values();

        uint256 length = principals.length();
        prices_ = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            prices_[i] = IPriceOracleAggregator(
                addressProvider.getPriceOracleAggregator()
            ).viewPriceInUSD(principals.at(i));
        }
    }

    /**
     *  @notice show all bond infos for a particular owner
     *  @param _owner address
     *  @return bondInfos_ Bond[]
     *  @return pendingPayouts_ uint256[]
     */
    function allBondInfos(
        address _owner
    )
        external
        view
        returns (Bond[] memory bondInfos_, uint256[] memory pendingPayouts_)
    {
        uint256 length = ownedDeposits[_owner].length();
        bondInfos_ = new Bond[](length);
        pendingPayouts_ = new uint256[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 depositId_ = ownedDeposits[_owner].at(i);

            bondInfos_[i] = bondInfo[depositId_];
            pendingPayouts_[i] = pendingPayoutFor(depositId_);
        }
    }
}
