// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

import {RateLib} from '../utils/RateLib.sol';

abstract contract MarketplaceTax is Initializable {
    using RateLib for RateLib.Rate;

    RateLib.Rate public taxRate;
    address public treasury;

    event TaxRateChanged(RateLib.Rate newRate, RateLib.Rate oldRate);
    event TreasuryChanged(address newTreasury, address oldTreasury);

    error InvalidTreasury();

    function __Tax_init(
        RateLib.Rate memory _taxRate,
        address _treasury
    ) internal onlyInitializing {
        _setTaxRate(_taxRate);
        _setTreasury(_treasury);
    }

    /// @notice Allows admins to set the tax rate.
    /// @param _newTaxRate The new tax rate.
    function _setTaxRate(RateLib.Rate memory _newTaxRate) internal {
        if (!_newTaxRate.isValid() || !_newTaxRate.isBelowOne())
            revert RateLib.InvalidRate();

        emit TaxRateChanged(_newTaxRate, taxRate);

        taxRate = _newTaxRate;
    }

    /// @notice Allows admins to set the new treasury.
    /// @param _newTreasury The new treasury address.
    function _setTreasury(address _newTreasury) internal {
        if (_newTreasury == address(0)) revert InvalidTreasury();

        emit TreasuryChanged(_newTreasury, treasury);

        treasury = _newTreasury;
    }

    function _sendToTreasury(uint amount) internal returns (uint) {
        uint fee = taxRate.calculate(amount);
        (bool _sent, ) = payable(treasury).call{value: fee}('');
        assert(_sent);

        return fee;
    }
}
