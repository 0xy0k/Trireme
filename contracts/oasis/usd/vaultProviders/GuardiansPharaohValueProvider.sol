// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC1155ValueProvider.sol';
import '../../../token/Guardian.sol';
import '../../../oracle/PriceOracleAggregator.sol';
import '../../../libraries/AddressProvider.sol';

contract GuardiansPharaohValueProvider is ERC1155ValueProvider {
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
    function getFloorUSD() public view override returns (uint256) {
        if (daoFloorOverride) {
            return overriddenFloorValueUSD;
        }

        uint256 mintAmount = Guardian(addressProvider.getGuardian())
            .pricePerGuardian() * 100; // decimals 18

        uint256 triremePrice = PriceOracleAggregator(
            addressProvider.getPriceOracleAggregator()
        ).viewPriceInUSD(addressProvider.getTrireme()); // decimals 6

        return (mintAmount * triremePrice) / 1e6;
    }
}
