// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC20ValueProviderETH.sol';

import '../../../interfaces/ethena/ISUSDe.sol';
import '../../../interfaces/uniswapV3/IUniswapV3StaticOracle.sol';

contract SUSDeValueProviderETH is ERC20ValueProviderETH {
    struct USDePriceSetting {
        address uniV3StaticOracle;
        address usde;
        address usdt;
        uint24[] fees;
        uint32 period;
        uint256 minPrice; // 6 decimals
        uint256 maxPrice; // 6 decimals
    }

    USDePriceSetting public usdePriceSetting;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The token oracles aggregator
    /// @param _token The token address
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
        USDePriceSetting memory _usdePriceSetting,
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
        usdePriceSetting = _usdePriceSetting;
    }

    function setSetting(
        USDePriceSetting memory _usdePriceSetting,
        IChainlinkV3Aggregator _usdtAggregator
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        aggregator = _usdtAggregator;
        usdePriceSetting = _usdePriceSetting;
    }

    /// @return priceETH The value for the collection, in ETH.
    function getPriceETH() public view override returns (uint256 priceETH) {
        (, int256 usdtPrice, , uint256 usdtPriceTimestamp, ) = aggregator
            .latestRoundData(); // 18 decimals

        if (usdtPrice == 0 || usdtPriceTimestamp == 0) {
            revert InvalidOracleResults();
        }

        (uint256 usdePrice, ) = IUniswapV3StaticOracle(
            usdePriceSetting.uniV3StaticOracle
        ).quoteSpecificFeeTiersWithTimePeriod(
                1 ether,
                usdePriceSetting.usde,
                usdePriceSetting.usdt,
                usdePriceSetting.fees,
                usdePriceSetting.period
            ); // 6 decimals

        if (
            usdePrice < usdePriceSetting.minPrice ||
            usdePrice > usdePriceSetting.maxPrice
        ) {
            revert InvalidOracleResults();
        }

        priceETH =
            (uint256(usdtPrice) *
                usdePrice *
                ISUSDe(address(token)).convertToAssets(1 ether)) /
            1e24;
    }
}
