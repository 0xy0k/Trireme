// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import '../../interfaces/IStableCoin.sol';
import '../../utils/RateLib.sol';
import {AbstractAssetVault} from '../usd/AbstractAssetVault.sol';
import '../usd/ERC20Vault.sol';
import {ERC20ValueProviderETH} from './ERC20ValueProviderETH.sol';

/// @title ERC20 lending vault
/// @notice This contracts allows users to borrow TriremeUSD using ERC20 tokens as collateral.
/// The price of the collateral token is fetched using a chainlink oracle
contract ERC20VaultETH is ERC20Vault {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeERC20Upgradeable for IStableCoin;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using RateLib for RateLib.Rate;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _stablecoin TriUSD address
    /// @param _tokenContract The collateral token address
    /// @param _valueProvider The collateral token value provider
    /// @param _settings Initial settings used by the contract
    function initialize(
        IStableCoin _stablecoin,
        IERC20Upgradeable _tokenContract,
        IStrategy _strategy,
        address _valueProvider,
        VaultSettings calldata _settings
    ) external override initializer {
        __initialize(_stablecoin, _settings);
        tokenContract = _tokenContract;
        valueProvider = _valueProvider;
        strategy = _strategy;
    }

    /// @dev Returns the credit limit
    /// @param _owner The position owner
    /// @param _colAmount The collateral amount
    /// @return creditLimitETH The credit limit
    function _getCreditLimit(
        address _owner,
        uint256 _colAmount
    ) internal view override returns (uint256 creditLimitETH) {
        uint _uAmount = _colAmount;
        if (address(strategy) != address(0)) {
            _uAmount = strategy.toAmount(_colAmount);
        }
        creditLimitETH = ERC20ValueProviderETH(valueProvider).getCreditLimitETH(
                _owner,
                _uAmount
            );
    }

    /// @dev Returns the minimum amount of debt necessary to liquidate the position
    /// @param _owner The position owner
    /// @param _colAmount The collateral amount
    /// @return liquidationLimitETH The minimum amount of debt to liquidate the position
    function _getLiquidationLimit(
        address _owner,
        uint256 _colAmount
    ) internal view override returns (uint256 liquidationLimitETH) {
        uint _uAmount = _colAmount;
        if (address(strategy) != address(0)) {
            _uAmount = strategy.toAmount(_colAmount);
        }
        liquidationLimitETH = ERC20ValueProviderETH(valueProvider)
            .getLiquidationLimitETH(_owner, _uAmount);
    }
}
