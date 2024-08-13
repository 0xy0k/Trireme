// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC20ValueProvider.sol';

import '../../../interfaces/etherfi/IWeETH.sol';

contract EzETHValueProvider is ERC20ValueProvider {
    IChainlinkV3Aggregator public ezETHAggregator;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The token oracles aggregator
    /// @param _ezETHAggregator The ezETH/ETH oracles aggregator
    /// @param _token The token address
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
        IChainlinkV3Aggregator _aggregator,
        IChainlinkV3Aggregator _ezETHAggregator,
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

        ezETHAggregator = _ezETHAggregator;
    }

    /// @return priceUSD The value for the collection, in USD.
    function getPriceUSD() public view override returns (uint256 priceUSD) {
        (, int256 answer, , uint256 timestamp, ) = aggregator.latestRoundData();

        if (answer == 0 || timestamp == 0) revert InvalidOracleResults();

        uint8 decimals = aggregator.decimals();

        uint ethPriceUSD = decimals > 18
            ? uint256(answer) / 10 ** (decimals - 18)
            : uint256(answer) * 10 ** (18 - decimals);

        (, int256 ezETHAnswer, , uint256 ezETHTimestamp, ) = ezETHAggregator
            .latestRoundData();
        if (ezETHAnswer == 0 || ezETHTimestamp == 0)
            revert InvalidOracleResults();

        uint8 ezETHDecimals = ezETHAggregator.decimals();
        uint ezETHPriceETH = ezETHDecimals > 18
            ? uint256(ezETHAnswer) / 10 ** (ezETHDecimals - 18)
            : uint256(ezETHAnswer) * 10 ** (18 - ezETHDecimals);

        priceUSD = (ethPriceUSD * ezETHPriceETH) / 1e18;
    }
}
