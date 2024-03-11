// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import {IChainlinkV3Aggregator} from '../../../interfaces/IChainlinkV3Aggregator.sol';
import {IStabilityPool} from '../../../interfaces/IStabilityPool.sol';
import {ERC20Vault} from '../../usd/ERC20Vault.sol';

/// @title Liquidator escrow contract
/// @notice Liquidator contract that allows liquidator bots to liquidate positions without holding any stablecoins.
/// It's only meant to be used by DAO bots.
contract ERC20Liquidator is OwnableUpgradeable {
    using AddressUpgradeable for address;

    error ZeroAddress();
    error InvalidLength();
    error UnknownVault(ERC20Vault vault);
    error InsufficientBalance(IERC20Upgradeable stablecoin);

    struct VaultInfo {
        IERC20Upgradeable stablecoin;
        IStabilityPool stabilityPool;
        address tokenContract;
    }

    mapping(ERC20Vault => VaultInfo) public vaultInfo;

    // vault => user => debtAmount
    mapping(ERC20Vault => mapping(address => uint256))
        public debtFromStabilityPool;
    uint256 public totalDebtFromStabilityPool;

    function initialize() external initializer {
        __Ownable_init();
    }

    /// @notice Allows any address to liquidate multiple positions at once.
    /// It assumes enough stablecoin is in the contract.
    /// This function can be called by anyone, however the address calling it doesn't get any stablecoins.
    /// @dev This function doesn't revert if one of the positions is not liquidatable.
    /// This is done to prevent situations in which multiple positions can't be liquidated
    /// because of one not liquidatable position.
    /// It reverts on insufficient balance.
    /// @param _toLiquidate The user addresses to liquidate
    /// @param _vault The address of the ERC20Vault
    function liquidate(
        address[] memory _toLiquidate,
        ERC20Vault _vault
    ) external {
        VaultInfo memory _vaultInfo = vaultInfo[_vault];
        if (_vaultInfo.tokenContract == address(0)) revert UnknownVault(_vault);

        uint256 _length = _toLiquidate.length;
        if (_length == 0) revert InvalidLength();

        for (uint256 i; i < _length; ++i) {
            address _user = _toLiquidate[i];

            (, uint256 debtPrincipal, ) = _vault.positions(_user);
            uint256 _interest = _vault.getDebtInterest(_user);
            uint256 debtAmount = debtPrincipal + _interest;

            // borrow from stability pool
            _vaultInfo.stabilityPool.borrowForLiquidation(debtAmount);

            uint256 _balance = _vaultInfo.stablecoin.balanceOf(address(this));
            _vaultInfo.stablecoin.approve(address(_vault), _balance);

            _vault.liquidate(_user, address(this));

            totalDebtFromStabilityPool += debtAmount;
            debtFromStabilityPool[_vault][_user] += debtAmount;

            //reset appoval
            _vaultInfo.stablecoin.approve(address(_vault), 0);
        }
    }

    /// @notice Allows the owner to repay for stability pool
    /// @dev This will happen after auction close and sell it on market
    function repayFromLiquidation(
        ERC20Vault _vault,
        address _user,
        uint256 _repayAmount
    ) external onlyOwner {
        VaultInfo memory _vaultInfo = vaultInfo[_vault];
        if (_vaultInfo.tokenContract == address(0)) {
            revert UnknownVault(_vault);
        }

        uint256 debtAmount = debtFromStabilityPool[_vault][_user];
        debtFromStabilityPool[_vault][_user] = 0;
        totalDebtFromStabilityPool -= debtAmount;
        _vaultInfo.stabilityPool.repayFromLiquidation(debtAmount, _repayAmount);
    }

    /// @notice Allows the owner to add information about a Vault
    function addVault(
        ERC20Vault _vault,
        IStabilityPool _stabilityPool
    ) external onlyOwner {
        if (address(_vault) == address(0)) revert ZeroAddress();

        vaultInfo[_vault] = VaultInfo(
            IERC20Upgradeable(_vault.stablecoin()),
            _stabilityPool,
            address(_vault.tokenContract())
        );
    }

    /// @notice Allows the owner to remove a Vault
    function removeVault(ERC20Vault _vault) external onlyOwner {
        delete vaultInfo[_vault];
    }

    /// @notice Allows the DAO to perform multiple calls using this contract (recovering funds/NFTs stuck in this contract)
    /// @param _targets The target addresses
    /// @param _calldatas The data to pass in each call
    /// @param _values The ETH value for each call
    function doCalls(
        address[] memory _targets,
        bytes[] memory _calldatas,
        uint256[] memory _values
    ) external payable onlyOwner {
        for (uint256 i = 0; i < _targets.length; i++) {
            _targets[i].functionCallWithValue(_calldatas[i], _values[i]);
        }
    }
}
