// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import '../../interfaces/IChainlinkV3Aggregator.sol';
import '../../interfaces/IStableCoin.sol';
import '../../utils/RateLib.sol';
import {ERC1155ValueProvider} from './ERC1155ValueProvider.sol';

/// @title ERC1155 lending vault
/// @notice This contracts allows users to borrow TriremeUSD using ERC1155 as collateral.
/// The floor price of the NFT collection is fetched using a chainlink oracle, while some other more valuable traits
/// can have an higher price set by the DAO. Users can also increase the price (and thus the borrow limit) of their
/// NFT by submitting a governance proposal. If the proposal is approved the user can lock a percentage of the new price
/// worth of Trireme to make it effective
contract ERC1155Vault is AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeERC20Upgradeable for IStableCoin;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using RateLib for RateLib.Rate;

    error InvalidAmount(uint256 amount);
    error InvalidPosition(address owner);
    error PositionLiquidated(address owner);
    error Unauthorized();
    error DebtCapReached();
    error NoDebt();
    error InsufficientCollateral();
    error ZeroAddress();
    error InvalidOracleResults();
    error UnknownAction(uint8 action);
    error InvalidLength();

    event CollateralAdded(address indexed owner, uint256 colAmount);
    event Borrowed(address indexed owner, uint256 amount);
    event Repaid(address indexed owner, uint256 amount);
    event CollateralRemoved(address indexed owner, uint256 colAmount);
    event Liquidated(
        address indexed liquidator,
        address indexed owner,
        uint256 colAmount
    );

    event Accrual(uint256 additionalInterest);
    event FeeCollected(uint256 collectedAmount);

    struct Position {
        uint256 collateral;
        uint256 debtPrincipal;
        uint256 debtPortion;
    }

    struct VaultSettings {
        RateLib.Rate debtInterestApr;
        RateLib.Rate organizationFeeRate;
        uint256 borrowAmountCap;
    }

    bytes32 private constant DAO_ROLE = keccak256('DAO_ROLE');
    bytes32 private constant LIQUIDATOR_ROLE = keccak256('LIQUIDATOR_ROLE');
    bytes32 private constant SETTER_ROLE = keccak256('SETTER_ROLE');

    //accrue required
    uint8 private constant ACTION_ADD_COLLATERAL = 0;
    uint8 private constant ACTION_REMOVE_COLLATERAL = 1;
    uint8 private constant ACTION_BORROW = 2;
    uint8 private constant ACTION_REPAY = 3;
    uint8 private constant ACTION_LIQUIDATE = 4;

    IStableCoin public stablecoin;
    /// @notice The Trireme trait boost locker contract
    ERC1155ValueProvider public valueProvider;

    IERC1155Upgradeable public tokenContract;
    uint256 public tokenIndex;

    /// @notice Total outstanding debt
    uint256 public totalDebtAmount;
    /// @dev Last time debt was accrued. See {accrue} for more info
    uint256 private totalDebtAccruedAt;
    uint256 public totalFeeCollected;
    uint256 private totalDebtPortion;

    VaultSettings public settings;

    /// @dev Keeps track of all the users
    EnumerableSetUpgradeable.AddressSet private userIndexes;

    mapping(address => Position) public positions;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _stablecoin TriUSD address
    /// @param _tokenContract The collateral token address
    /// @param _valueProvider The collateral token value provider
    /// @param _settings Initial settings used by the contract
    function initialize(
        IStableCoin _stablecoin,
        IERC1155Upgradeable _tokenContract,
        uint256 _tokenIndex,
        ERC1155ValueProvider _valueProvider,
        VaultSettings calldata _settings
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();

        _setupRole(DAO_ROLE, msg.sender);
        _setRoleAdmin(LIQUIDATOR_ROLE, DAO_ROLE);
        _setRoleAdmin(SETTER_ROLE, DAO_ROLE);
        _setRoleAdmin(DAO_ROLE, DAO_ROLE);

        if (
            !_settings.debtInterestApr.isValid() ||
            !_settings.debtInterestApr.isBelowOne()
        ) revert RateLib.InvalidRate();

        if (
            !_settings.organizationFeeRate.isValid() ||
            !_settings.organizationFeeRate.isBelowOne()
        ) revert RateLib.InvalidRate();

        stablecoin = _stablecoin;
        tokenContract = _tokenContract;
        tokenIndex = _tokenIndex;
        valueProvider = _valueProvider;

        settings = _settings;
    }

    /// @notice Returns the number of open positions
    /// @return The number of open positions
    function totalUsersLength() external view returns (uint256) {
        return userIndexes.length();
    }

    /// @notice Returns all open position owners
    /// @return The open position owners
    function totalUsers() external view returns (address[] memory) {
        return userIndexes.values();
    }

    /// @param _owner The position owner
    /// @return The TriUSD credit limit of owner
    function getCreditLimit(address _owner) external view returns (uint256) {
        return _getCreditLimit(_owner, positions[_owner].collateral);
    }

    /// @param _owner The position owner
    /// @return The TriUSD liquidation limit of owner
    function getLiquidationLimit(address _owner) public view returns (uint256) {
        return _getLiquidationLimit(_owner, positions[_owner].collateral);
    }

    /// @param _owner The position owner
    /// @return Whether the position is liquidatable or not
    function isLiquidatable(address _owner) external view returns (bool) {
        return
            positions[_owner].debtPrincipal + getDebtInterest(_owner) >=
            getLiquidationLimit(_owner);
    }

    /// @param _owner The position owner
    /// @return The TriUSD debt interest accumulated
    function getDebtInterest(address _owner) public view returns (uint256) {
        Position storage position = positions[_owner];
        uint256 principal = position.debtPrincipal;
        uint256 debt = _calculateDebt(
            totalDebtAmount + calculateAdditionalInterest(),
            position.debtPortion,
            totalDebtPortion
        );

        //_calculateDebt is prone to rounding errors that may cause
        //the calculated debt amount to be 1 or 2 units less than
        //the debt principal if no time has elapsed in between the first borrow
        //and the _calculateDebt call.
        if (principal > debt) debt = principal;

        unchecked {
            return debt - principal;
        }
    }

    /// @dev Calculates the additional global interest since last time the contract's state was updated by calling {accrue}
    /// @return The additional interest value
    function calculateAdditionalInterest() public view returns (uint256) {
        // Number of seconds since {accrue} was called
        uint256 elapsedTime = block.timestamp - totalDebtAccruedAt;
        if (elapsedTime == 0) {
            return 0;
        }

        uint256 totalDebt = totalDebtAmount;
        if (totalDebt == 0) {
            return 0;
        }

        // Accrue interest
        return
            (elapsedTime * totalDebt * settings.debtInterestApr.numerator) /
            settings.debtInterestApr.denominator /
            365 days;
    }

    /// @dev The {accrue} function updates the contract's state by calculating
    /// the additional interest accrued since the last state update
    function accrue() public {
        uint256 additionalInterest = calculateAdditionalInterest();

        totalDebtAccruedAt = block.timestamp;

        totalDebtAmount += additionalInterest;
        totalFeeCollected += additionalInterest;

        emit Accrual(additionalInterest);
    }

    /// @notice Allows to execute multiple actions in a single transaction.
    /// @param _actions The actions to execute.
    /// @param _data The abi encoded parameters for the actions to execute.
    function doActions(
        uint8[] calldata _actions,
        bytes[] calldata _data
    ) external nonReentrant {
        _doActionsFor(msg.sender, _actions, _data);
    }

    /// @notice Allows a user to add collateral
    /// @param _colAmount The collateral amount
    function addCollateral(uint256 _colAmount) external nonReentrant {
        accrue();
        _addCollateral(msg.sender, _colAmount);
    }

    /// @notice Allows users to borrow TriUSD
    /// @dev emits a {Borrowed} event
    /// @param _amount The amount of TriUSD to be borrowed. Note that the user will receive less than the amount requested,
    function borrow(uint256 _amount) external nonReentrant {
        accrue();
        _borrow(msg.sender, _amount);
    }

    /// @notice Allows users to repay a portion/all of their debt. Note that since interest increases every second,
    /// a user wanting to repay all of their debt should repay for an amount greater than their current debt to account for the
    /// additional interest while the repay transaction is pending, the contract will only take what's necessary to repay all the debt
    /// @dev Emits a {Repaid} event
    /// @param _amount The amount of debt to repay. If greater than the position's outstanding debt, only the amount necessary to repay all the debt will be taken
    function repay(uint256 _amount) external nonReentrant {
        accrue();
        _repay(msg.sender, _amount);
    }

    /// @notice Allows a user to remove collateral
    /// @dev Emits a {PositionClosed} event
    /// @param _colAmount The collateral amount
    function removeCollateral(uint256 _colAmount) external nonReentrant {
        accrue();
        _removeCollateral(msg.sender, _colAmount);
    }

    /// @notice Allows members of the `LIQUIDATOR_ROLE` to liquidate a position. Positions can only be liquidated
    /// once their debt amount exceeds the minimum liquidation debt to collateral value rate.
    /// In order to liquidate a position, the liquidator needs to repay the user's outstanding debt.
    /// @dev Emits a {Liquidated} event
    /// @param _owner The position owner
    /// @param _recipient The address to send collaterals to
    function liquidate(
        address _owner,
        address _recipient
    ) external nonReentrant {
        accrue();
        _liquidate(msg.sender, _owner, _recipient);
    }

    /// @notice Allows the DAO to collect interest and fees before they are repaid
    function collect() external nonReentrant onlyRole(DAO_ROLE) {
        accrue();

        uint256 _totalFeeCollected = totalFeeCollected;

        stablecoin.mint(msg.sender, _totalFeeCollected);
        totalFeeCollected = 0;

        emit FeeCollected(_totalFeeCollected);
    }

    /// @notice Allows the DAO to withdraw _amount of an ERC20
    function rescueToken(
        IERC20Upgradeable _token,
        uint256 _amount
    ) external nonReentrant onlyRole(DAO_ROLE) {
        _token.safeTransfer(msg.sender, _amount);
    }

    /// @notice Allows the setter contract to change fields in the `VaultSettings` struct.
    /// @dev Validation and single field setting is handled by an external contract with the
    /// `SETTER_ROLE`. This was done to reduce the contract's size.
    function setSettings(
        VaultSettings calldata _settings
    ) external onlyRole(SETTER_ROLE) {
        settings = _settings;
    }

    /// @dev See {doActions}
    function _doActionsFor(
        address _account,
        uint8[] calldata _actions,
        bytes[] calldata _data
    ) internal {
        if (_actions.length != _data.length) revert InvalidLength();
        bool accrueCalled;
        for (uint256 i; i < _actions.length; ++i) {
            uint8 action = _actions[i];
            if (!accrueCalled && action < 100) {
                accrue();
                accrueCalled = true;
            }

            if (action == ACTION_ADD_COLLATERAL) {
                uint256 colAmount = abi.decode(_data[i], (uint256));
                _addCollateral(_account, colAmount);
            } else if (action == ACTION_BORROW) {
                uint256 amount = abi.decode(_data[i], (uint256));
                _borrow(_account, amount);
            } else if (action == ACTION_REPAY) {
                uint256 amount = abi.decode(_data[i], (uint256));
                _repay(_account, amount);
            } else if (action == ACTION_REMOVE_COLLATERAL) {
                uint256 colAmount = abi.decode(_data[i], (uint256));
                _removeCollateral(_account, colAmount);
            } else if (action == ACTION_LIQUIDATE) {
                (address owner, address recipient) = abi.decode(
                    _data[i],
                    (address, address)
                );
                _liquidate(_account, owner, recipient);
            } else {
                revert UnknownAction(action);
            }
        }
    }

    /// @dev See {addCollateral}
    function _addCollateral(address _account, uint256 _colAmount) internal {
        tokenContract.safeTransferFrom(
            _account,
            address(this),
            tokenIndex,
            _colAmount,
            '0x'
        );

        Position storage position = positions[_account];

        if (!userIndexes.contains(_account)) {
            userIndexes.add(_account);
        }
        position.collateral += _colAmount;

        emit CollateralAdded(_account, _colAmount);
    }

    /// @dev See {borrow}
    function _borrow(address _account, uint256 _amount) internal {
        if (_amount == 0) revert InvalidAmount(_amount);

        Position storage position = positions[_account];
        uint256 _totalDebtAmount = totalDebtAmount;
        if (_totalDebtAmount + _amount > settings.borrowAmountCap)
            revert DebtCapReached();

        uint256 _creditLimit = _getCreditLimit(_account, position.collateral);
        uint256 _debtAmount = _getDebtAmount(_account);
        if (_debtAmount + _amount > _creditLimit) revert InvalidAmount(_amount);

        //calculate the borrow fee
        uint256 _organizationFee = (_amount *
            settings.organizationFeeRate.numerator) /
            settings.organizationFeeRate.denominator;

        uint256 _feeAmount = _organizationFee;
        totalFeeCollected += _feeAmount;

        // update debt portion
        {
            uint256 _totalDebtPortion = totalDebtPortion;
            uint256 _plusPortion = _calculatePortion(
                _totalDebtPortion,
                _amount,
                _totalDebtAmount
            );

            totalDebtPortion = _totalDebtPortion + _plusPortion;
            position.debtPortion += _plusPortion;
            position.debtPrincipal += _amount;
            totalDebtAmount = _totalDebtAmount + _amount;
        }

        //subtract the fee from the amount borrowed
        stablecoin.mint(_account, _amount - _feeAmount);

        emit Borrowed(_account, _amount);
    }

    /// @dev See {repay}
    function _repay(address _account, uint256 _amount) internal {
        if (_amount == 0) revert InvalidAmount(_amount);

        Position storage position = positions[_account];

        uint256 _debtAmount = _getDebtAmount(_account);
        if (_debtAmount == 0) revert NoDebt();

        uint256 _debtPrincipal = position.debtPrincipal;
        uint256 _debtInterest = _debtAmount - _debtPrincipal;

        _amount = _amount > _debtAmount ? _debtAmount : _amount;

        // burn all payment, the interest is sent to the DAO using the {collect} function
        stablecoin.burnFrom(_account, _amount);

        uint256 _paidPrincipal;

        unchecked {
            _paidPrincipal = _amount > _debtInterest
                ? _amount - _debtInterest
                : 0;
        }

        uint256 _totalDebtPortion = totalDebtPortion;
        uint256 _totalDebtAmount = totalDebtAmount;
        uint256 _debtPortion = position.debtPortion;
        uint256 _minusPortion = _paidPrincipal == _debtPrincipal
            ? _debtPortion
            : _calculatePortion(_totalDebtPortion, _amount, _totalDebtAmount);

        totalDebtPortion = _totalDebtPortion - _minusPortion;
        position.debtPortion = _debtPortion - _minusPortion;
        position.debtPrincipal = _debtPrincipal - _paidPrincipal;
        totalDebtAmount = _totalDebtAmount - _amount;

        emit Repaid(_account, _amount);
    }

    /// @dev See {removeCollateral}
    function _removeCollateral(address _account, uint256 _colAmount) internal {
        Position storage position = positions[_account];

        uint256 _debtAmount = _getDebtAmount(_account);
        uint256 _creditLimit = _getCreditLimit(
            _account,
            position.collateral - _colAmount
        );

        if (_debtAmount > _creditLimit) revert InsufficientCollateral();

        position.collateral -= _colAmount;

        if (position.collateral == 0) {
            delete positions[_account];
            userIndexes.remove(_account);
        }

        tokenContract.safeTransferFrom(
            address(this),
            _account,
            tokenIndex,
            _colAmount,
            '0x'
        );

        emit CollateralRemoved(_account, _colAmount);
    }

    /// @dev See {liquidate}
    function _liquidate(
        address _account,
        address _owner,
        address _recipient
    ) internal {
        _checkRole(LIQUIDATOR_ROLE, _account);

        Position storage position = positions[_owner];
        uint256 colAmount = position.collateral;

        uint256 debtAmount = _getDebtAmount(_owner);
        if (debtAmount < _getLiquidationLimit(_owner, position.collateral))
            revert InvalidPosition(_owner);

        // burn all payment
        stablecoin.burnFrom(_account, debtAmount);

        // update debt portion
        totalDebtPortion -= position.debtPortion;
        totalDebtAmount -= debtAmount;
        position.debtPortion = 0;

        // transfer collateral to liquidator
        delete positions[_owner];
        userIndexes.remove(_owner);
        tokenContract.safeTransferFrom(
            address(this),
            _recipient,
            tokenIndex,
            colAmount,
            '0x'
        );

        emit Liquidated(_account, _owner, colAmount);
    }

    /// @dev Returns the credit limit
    /// @param _owner The position owner
    /// @param _colAmount The collateral amount
    /// @return The credit limit
    function _getCreditLimit(
        address _owner,
        uint256 _colAmount
    ) internal view returns (uint256) {
        uint256 creditLimitUSD = valueProvider.getCreditLimitUSD(
            _owner,
            _colAmount
        );
        return creditLimitUSD;
    }

    /// @dev Returns the minimum amount of debt necessary to liquidate the position
    /// @param _owner The position owner
    /// @param _colAmount The collateral amount
    /// @return The minimum amount of debt to liquidate the position
    function _getLiquidationLimit(
        address _owner,
        uint256 _colAmount
    ) internal view returns (uint256) {
        uint256 liquidationLimitUSD = valueProvider.getLiquidationLimitUSD(
            _owner,
            _colAmount
        );
        return liquidationLimitUSD;
    }

    /// @dev Calculates current outstanding debt of a user
    /// @param _owner The position owner
    /// @return The outstanding debt value
    function _getDebtAmount(address _owner) internal view returns (uint256) {
        uint256 calculatedDebt = _calculateDebt(
            totalDebtAmount,
            positions[_owner].debtPortion,
            totalDebtPortion
        );

        uint256 principal = positions[_owner].debtPrincipal;

        //_calculateDebt is prone to rounding errors that may cause
        //the calculated debt amount to be 1 or 2 units less than
        //the debt principal when the accrue() function isn't called
        //in between the first borrow and the _calculateDebt call.
        return principal > calculatedDebt ? principal : calculatedDebt;
    }

    /// @dev Calculates the total debt of a position given the global debt, the user's portion of the debt and the total user portions
    /// @param total The global outstanding debt
    /// @param userPortion The user's portion of debt
    /// @param totalPortion The total user portions of debt
    /// @return The outstanding debt of the position
    function _calculateDebt(
        uint256 total,
        uint256 userPortion,
        uint256 totalPortion
    ) internal pure returns (uint256) {
        return totalPortion == 0 ? 0 : (total * userPortion) / totalPortion;
    }

    /// @dev Calculates the debt portion of a position given the global debt portion, the debt amount and the global debt amount
    /// @param _total The total user portions of debt
    /// @param _userDebt The user's debt
    /// @param _totalDebt The global outstanding debt
    /// @return _userDebt converted into a debt portion
    function _calculatePortion(
        uint256 _total,
        uint256 _userDebt,
        uint256 _totalDebt
    ) internal pure returns (uint256) {
        return _total == 0 ? _userDebt : (_total * _userDebt) / _totalDebt;
    }
}
