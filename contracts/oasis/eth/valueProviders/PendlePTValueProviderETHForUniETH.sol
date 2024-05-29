// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC20ValueProviderETH.sol';
import '../../../interfaces/bedrock/IUniETHExchangeRate.sol';
import '../../../interfaces/pendle/IPMarket.sol';
import '../../../interfaces/pendle/IPendlePtOracle.sol';
import '../../../libraries/pendle/PendlePtOracleLib.sol';

contract PendlePTValueProviderETHForUniETH is ERC20ValueProviderETH {
    using PendlePtOracleLib for IPMarket;

    error IncreaseCardinalityRequired();
    error OldestObservationNotSatisfied();

    struct PendlePtConfig {
        IPMarket market;
        uint32 twapDuration;
        uint256 minPrice;
        uint256 maxPrice;
    }

    IPendlePtOracle public ptOracle;
    PendlePtConfig public ptConfig;
    address public uniETHExchangeRate;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The token oracles aggregator (ETH / USD)
    /// @param _token The token address
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
        PendlePtConfig memory _ptConfig,
        IPendlePtOracle _ptOracle,
        address _uniETHExchangeRate,
        IChainlinkV3Aggregator _aggregator,
        IERC20MetadataUpgradeable _token,
        RateLib.Rate calldata _baseCreditLimitRate,
        RateLib.Rate calldata _baseLiquidationLimitRate
    ) external initializer {
        __initialize(
            _aggregator,
            _token,
            _baseCreditLimitRate,
            _baseLiquidationLimitRate
        );

        ptConfig = _ptConfig;
        ptOracle = _ptOracle;
        uniETHExchangeRate = _uniETHExchangeRate;
    }

    function setPtConfig(
        PendlePtConfig memory _ptConfig
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ptConfig = _ptConfig;
    }

    /// @return priceETH The value for the collection, in USD.
    function getPriceETH() public view override returns (uint256 priceETH) {
        // check PT twap
        (
            bool increaseCardinalityRequired,
            ,
            bool oldestObservationSatisfied
        ) = ptOracle.getOracleState(
                address(ptConfig.market),
                ptConfig.twapDuration
            );
        if (!oldestObservationSatisfied) {
            revert OldestObservationNotSatisfied();
        }

        uint256 ptRate = ptConfig.market.getPtToAssetRate(
            ptConfig.twapDuration
        ); // 18 decimals

        uint256 underlyingPrice = IUniETHExchangeRate(uniETHExchangeRate)
            .exchangeRatio(); // 18 decimals

        priceETH = (ptRate * uint256(underlyingPrice)) / 1e18;

        // check min/max price if increase cardinality required
        if (
            increaseCardinalityRequired &&
            (priceETH < ptConfig.minPrice || priceETH > ptConfig.maxPrice)
        ) {
            revert IncreaseCardinalityRequired();
        }
    }
}
