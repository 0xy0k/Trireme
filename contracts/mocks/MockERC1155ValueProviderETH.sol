// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../helios/eth/ERC1155ValueProviderETH.sol';

contract MockERC1155ValueProviderETH is ERC1155ValueProviderETH {
    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The NFT floor oracles aggregator
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
        IChainlinkV3Aggregator _aggregator,
        RateLib.Rate calldata _baseCreditLimitRate,
        RateLib.Rate calldata _baseLiquidationLimitRate
    ) external initializer {
        __initialize(
            _aggregator,
            _baseCreditLimitRate,
            _baseLiquidationLimitRate
        );
    }
}
