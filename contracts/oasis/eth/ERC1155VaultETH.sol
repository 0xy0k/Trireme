// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import '../../interfaces/IStableCoin.sol';
import '../../utils/RateLib.sol';
import {ERC1155ValueProviderETH} from './ERC1155ValueProviderETH.sol';
import '../usd/ERC1155Vault.sol';

/// @title ERC1155 lending vault
/// @notice This contracts allows users to borrow TriremeETH using ERC1155 as collateral.
/// The floor price of the NFT collection is fetched using a chainlink oracle, while some other more valuable traits
/// can have an higher price set by the DAO. Users can also increase the price (and thus the borrow limit) of their
/// NFT by submitting a governance proposal. If the proposal is approved the user can lock a percentage of the new price
/// worth of Trireme to make it effective
contract ERC1155VaultETH is ERC1155Vault {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using SafeERC20Upgradeable for IStableCoin;
    using RateLib for RateLib.Rate;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _stablecoin TriremeETH address
    /// @param _tokenContract The collateral token address
    /// @param _valueProvider The collateral token value provider
    /// @param _settings Initial settings used by the contract
    function initialize(
        IStableCoin _stablecoin,
        IERC1155Upgradeable _tokenContract,
        uint256 _tokenIndex,
        address _valueProvider,
        VaultSettings calldata _settings
    ) external override initializer {
        __initialize(_stablecoin, _settings);
        tokenContract = _tokenContract;
        tokenIndex = _tokenIndex;
        valueProvider = _valueProvider;
    }

    /// @dev Returns the credit limit
    /// @param _owner The position owner
    /// @param _colAmount The collateral amount
    /// @return The credit limit
    function _getCreditLimit(
        address _owner,
        uint256 _colAmount
    ) internal view override returns (uint256) {
        uint256 creditLimitETH = ERC1155ValueProviderETH(valueProvider)
            .getCreditLimitETH(_owner, _colAmount);
        return creditLimitETH;
    }

    /// @dev Returns the minimum amount of debt necessary to liquidate the position
    /// @param _owner The position owner
    /// @param _colAmount The collateral amount
    /// @return The minimum amount of debt to liquidate the position
    function _getLiquidationLimit(
        address _owner,
        uint256 _colAmount
    ) internal view override returns (uint256) {
        uint256 liquidationLimitETH = ERC1155ValueProviderETH(valueProvider)
            .getLiquidationLimitETH(_owner, _colAmount);
        return liquidationLimitETH;
    }
}
