// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../utils/RateLib.sol';

interface IValueProvider {
    function getCreditLimitRate(
        address _owner,
        uint256 _colAmount
    ) external view returns (RateLib.Rate memory);

    function getLiquidationLimitRate(
        address _owner,
        uint256 _colAmount
    ) external view returns (RateLib.Rate memory);

    function getCreditLimit(
        address _owner,
        uint256 _colAmount
    ) external view returns (uint256);

    function getLiquidationLimit(
        address _owner,
        uint256 _colAmount
    ) external view returns (uint256);
}
