// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import '../../interfaces/IChainlinkV3Aggregator.sol';
import '../../interfaces/IStableCoin.sol';
import '../../interfaces/IERC721Liquidator.sol';
import '../../utils/RateLib.sol';
import '../usd/ERC721Vault.sol';

/// @title ERC721 lending vault
/// @notice This contracts allows users to borrow TriremeUSD using ERC721 as collateral.
/// The floor price of the NFT collection is fetched using a chainlink oracle, while some other more valuable traits
/// can have an higher price set by the DAO. Users can also increase the price (and thus the borrow limit) of their
/// NFT by submitting a governance proposal. If the proposal is approved the user can lock a percentage of the new price
/// worth of Trireme to make it effective
contract ERC721VaultETH is ERC721Vault {
    using RateLib for RateLib.Rate;

    bytes32 private constant DAO_ROLE = keccak256('DAO_ROLE');
    bytes32 private constant LIQUIDATOR_ROLE = keccak256('LIQUIDATOR_ROLE');
    bytes32 private constant SETTER_ROLE = keccak256('SETTER_ROLE');

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _stablecoin TriUSD address
    /// @param _nftContract The NFT contract address. It could also be the address of an helper contract
    /// if the target NFT isn't an ERC721 (CryptoPunks as an example)
    /// @param _valueProvider The NFT value provider
    /// @param _settings Initial settings used by the contract
    function initialize(
        IStableCoin _stablecoin,
        IERC721Upgradeable _nftContract,
        address _valueProvider,
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

        if (
            !_settings.insurancePurchaseRate.isValid() ||
            !_settings.insurancePurchaseRate.isBelowOne()
        ) revert RateLib.InvalidRate();

        if (
            !_settings.insuranceLiquidationPenaltyRate.isValid() ||
            !_settings.insuranceLiquidationPenaltyRate.isBelowOne()
        ) revert RateLib.InvalidRate();

        stablecoin = _stablecoin;
        nftContract = _nftContract;
        valueProvider = _valueProvider;

        settings = _settings;
    }

    /// @param _nftIndex The NFT to return the credit limit of
    /// @return The TriUSD credit limit of the NFT at index `_nftIndex`.
    function getCreditLimitETH(
        address _owner,
        uint256 _nftIndex
    ) external view returns (uint256) {
        return _getCreditLimit(_owner, _nftIndex);
    }

    /// @param _nftIndex The NFT to return the liquidation limit of
    /// @return The TriUSD liquidation limit of the NFT at index `_nftIndex`.
    function getLiquidationLimitETH(
        address _owner,
        uint256 _nftIndex
    ) public view returns (uint256) {
        return _getLiquidationLimit(_owner, _nftIndex);
    }

    /// @dev Returns the credit limit of an NFT
    /// @param _owner The owner of the NFT
    /// @param _nftIndex The NFT to return credit limit of
    /// @return The NFT credit limit
    function _getCreditLimit(
        address _owner,
        uint256 _nftIndex
    ) internal view override returns (uint256) {
        return
            ERC721ValueProvider(valueProvider).getCreditLimitETH(
                _owner,
                _nftIndex
            );
    }

    /// @dev Returns the minimum amount of debt necessary to liquidate an NFT
    /// @param _owner The owner of the NFT
    /// @param _nftIndex The index of the NFT
    /// @return The minimum amount of debt to liquidate the NFT
    function _getLiquidationLimit(
        address _owner,
        uint256 _nftIndex
    ) internal view override returns (uint256) {
        return
            ERC721ValueProvider(valueProvider).getLiquidationLimitETH(
                _owner,
                _nftIndex
            );
    }
}
