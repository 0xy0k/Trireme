// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC20ValueProviderETH.sol';

import '../../../interfaces/yieldnest/IYnETH.sol';

contract YnETHValueProviderETH is ERC20ValueProviderETH {
    error OutOfPriceRange();

    uint256 public minPrice;
    uint256 public maxPrice;

    /// @notice This function is only called once during deployment of the proxy contract. It's not called after upgrades.
    /// @param _aggregator The token oracles aggregator
    /// @param _token The token address
    /// @param _baseCreditLimitRate The base credit limit rate
    /// @param _baseLiquidationLimitRate The base liquidation limit rate
    function initialize(
        IChainlinkV3Aggregator _aggregator,
        IERC20MetadataUpgradeable _token,
        RateLib.Rate calldata _baseCreditLimitRate,
        RateLib.Rate calldata _baseLiquidationLimitRate,
        uint256 _minPrice,
        uint256 _maxPrice
    ) external initializer {
        __initialize(
            _aggregator,
            _token,
            _baseCreditLimitRate,
            _baseLiquidationLimitRate
        );
        minPrice = _minPrice;
        maxPrice = _maxPrice;
    }

    function setMinMaxPrice(
        uint256 _minPrice,
        uint256 _maxPrice
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minPrice = _minPrice;
        maxPrice = _maxPrice;
    }

    /// @return priceETH The value for the collection, in ETH.
    function getPriceETH() public view override returns (uint256 priceETH) {
        uint256 totalSupply = IYnETH(address(token)).totalSupply();
        uint256 totalValue = IYnETH(address(token)).totalAssets();

        priceETH = (totalValue * 1 ether) / totalSupply;

        if (priceETH < minPrice || priceETH > maxPrice) {
            revert OutOfPriceRange();
        }
    }
}
