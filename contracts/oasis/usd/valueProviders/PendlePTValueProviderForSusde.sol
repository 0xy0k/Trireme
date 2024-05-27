// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import './SUSDeValueProvider.sol';
import '../ERC20ValueProvider.sol';
import '../../../interfaces/pendle/IPMarket.sol';
import '../../../interfaces/pendle/IPendlePtOracle.sol';
import '../../../libraries/pendle/PendlePtOracleLib.sol';

contract PendlePTValueProviderForSusde is ERC20ValueProvider {
    using PendlePtOracleLib for IPMarket;

    error IncreaseCardinalityRequired();
    error OldestObservationNotSatisfied();

    struct PendlePtConfig {
        IPMarket market;
        uint32 twapDuration;
    }

    IPendlePtOracle public ptOracle;
    PendlePtConfig public ptConfig;
    address public susde;
    SUSDeValueProvider public susdeValueProvider;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The token oracles aggregator (ETH / USD)
    /// @param _token The token address
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
        PendlePtConfig memory _ptConfig,
        IPendlePtOracle _ptOracle,
        address _susde,
        SUSDeValueProvider _susdeValueProvider,
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
        susde = _susde;
        susdeValueProvider = _susdeValueProvider;
    }

    function setPtConfig(
        PendlePtConfig memory _ptConfig
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ptConfig = _ptConfig;
    }

    /// @return The value for the collection, in USD.
    function getPriceUSD() public view override returns (uint256) {
        // check PT twap
        (
            bool increaseCardinalityRequired,
            ,
            bool oldestObservationSatisfied
        ) = ptOracle.getOracleState(
                address(ptConfig.market),
                ptConfig.twapDuration
            );
        if (increaseCardinalityRequired) {
            revert IncreaseCardinalityRequired();
        }
        if (!oldestObservationSatisfied) {
            revert OldestObservationNotSatisfied();
        }

        uint256 ptRate = ptConfig.market.getPtToAssetRate(
            ptConfig.twapDuration
        ); // 18 decimals

        uint256 susdePrice = susdeValueProvider.getPriceUSD();

        unchecked {
            // converts the answer to have 18 decimals
            return (ptRate * susdePrice) / 1e18;
        }
    }
}
