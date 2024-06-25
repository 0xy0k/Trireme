// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC20ValueProviderETH.sol';

import '../../../interfaces/etherfi/IWeETH.sol';
import '../../../interfaces/origin/IOETH.sol';
import '../../../interfaces/origin/IOETHVault.sol';

contract OETHValueProviderETH is ERC20ValueProviderETH {
    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The token oracles aggregator
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
    function getPriceETH() public view override returns (uint256) {
        uint256 totalSupply = IOETH(address(token)).totalSupply();
        address vaultAddress = IOETH(address(token)).vaultAddress();
        uint256 totalValue = IOETHVault(vaultAddress).totalValue();
        return (totalValue * 1 ether) / totalSupply;
    }
}
