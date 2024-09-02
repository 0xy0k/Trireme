// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

import {RateLib} from '../utils/RateLib.sol';

interface IMarketplaceOracle {
    function getFloorETH() external view returns (uint);
}

abstract contract MarketplaceDiscount is Initializable {
    using RateLib for RateLib.Rate;

    bool public discountEnabled;
    mapping(address => address) public oracles;

    event EnabledDiscount(bool enabled);
    event OracleUpdated(address indexed nft, address oracle);

    error InvalidOracle();

    function __Discount_init(bool _discountEnabled) internal onlyInitializing {
        _enableDiscount(_discountEnabled);
    }

    function _enableDiscount(bool enable) internal {
        discountEnabled = enable;
        emit EnabledDiscount(enable);
    }

    function _setOracle(address nft, address oracle) internal {
        if (nft == address(0) || oracle == address(0)) revert InvalidOracle();

        oracles[nft] = oracle;
        emit OracleUpdated(nft, oracle);
    }

    function getNftPriceInETH(address nft) public view returns (uint) {
        return IMarketplaceOracle(oracles[nft]).getFloorETH();
    }
}
