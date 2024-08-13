// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../ERC20ValueProvider.sol';

import '../../../interfaces/origin/IOETH.sol';
import '../../../interfaces/origin/IOETHVault.sol';
import '../../../interfaces/origin/IWOETH.sol';

contract WOETHValueProvider is ERC20ValueProvider {
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

    /// @return priceUSD The value for the collection, in USD.
    function getPriceUSD() public view override returns (uint256 priceUSD) {
        address oETH = IWOETH(address(token)).asset();
        uint256 totalSupply = IOETH(oETH).totalSupply();
        address vaultAddress = IOETH(oETH).vaultAddress();
        uint256 totalValue = IOETHVault(vaultAddress).totalValue();
        // OETH/ETH
        uint256 priceETH = (totalValue * 1 ether) / totalSupply;

        // WOETH/ETH
        priceETH = IWOETH(address(token)).convertToAssets(priceETH);

        if (priceETH < minPrice || priceETH > maxPrice) {
            revert OutOfPriceRange();
        }

        (, int256 answer, , uint256 timestamp, ) = aggregator.latestRoundData();

        if (answer == 0 || timestamp == 0) revert InvalidOracleResults();

        uint8 decimals = aggregator.decimals();

        uint256 ethPrice = decimals > 18
            ? uint256(answer) / 10 ** (decimals - 18)
            : uint256(answer) * 10 ** (18 - decimals);

        priceUSD = ethPrice * priceETH / 1 ether;
    }
}
