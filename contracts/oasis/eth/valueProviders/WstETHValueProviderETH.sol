// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC20ValueProviderETH.sol';

import '../../../interfaces/wsteth/IWstETH.sol';

contract WstETHValueProvider is ERC20ValueProviderETH {
    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The token oracles aggregator (stETH/ETH)
    /// @param _token The token address
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
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
    }

    /// @return priceETH The value for the collection, in ETH.
    function getPriceETH() public view override returns (uint256 priceETH) {
        (, int256 answer, , uint256 timestamp, ) = aggregator.latestRoundData();

        if (answer == 0 || timestamp == 0) revert InvalidOracleResults();

        uint8 decimals = aggregator.decimals();

        priceETH = decimals > 18
            ? uint256(answer) / 10 ** (decimals - 18)
            : uint256(answer) * 10 ** (18 - decimals);

        priceETH =
            (priceETH * IWstETH(address(token)).getStETHByWstETH(1 ether)) /
            1 ether;
    }
}
