// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC1155ValueProviderETH.sol';
import '../../../token/Guardian.sol';
import '../../../oracle/PriceOracleAggregator.sol';
import '../../../libraries/AddressProvider.sol';

contract GuardiansPharaohValueProviderETH is ERC1155ValueProviderETH {
    AddressProvider public addressProvider;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The NFT floor oracles aggregator
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
        address _addressProvider,
        IChainlinkV3Aggregator _aggregator,
        RateLib.Rate calldata _baseCreditLimitRate,
        RateLib.Rate calldata _baseLiquidationLimitRate
    ) external initializer {
        __initialize(
            _aggregator,
            _baseCreditLimitRate,
            _baseLiquidationLimitRate
        );
        addressProvider = AddressProvider(_addressProvider);
    }

    /// @return The floor value for the collection, in USD.
    function getFloorETH() public view override returns (uint256) {
        if (daoFloorOverride) {
            return overriddenFloorValueETH;
        }

        uint256 mintAmount = Guardian(addressProvider.getGuardian())
            .pricePerGuardian(); // decimals 18

        uint256 triremePrice = PriceOracleAggregator(
            addressProvider.getPriceOracleAggregator()
        ).viewPriceInUSD(addressProvider.getTrireme()); // decimals 8

        uint priceInUSD = ((mintAmount * triremePrice) * 100) / 1e8;

        (, int256 answer, , uint256 timestamp, ) = aggregator.latestRoundData();
        if (answer == 0 || timestamp == 0) revert InvalidOracleResults();
        uint8 decimals = aggregator.decimals();

        uint ethPriceInUSD = decimals > 18
            ? uint256(answer) / 10 ** (decimals - 18)
            : uint256(answer) * 10 ** (18 - decimals);

        return (priceInUSD * 1e18) / ethPriceInUSD;
    }
}
