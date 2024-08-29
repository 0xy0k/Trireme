// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '../utils/RateLib.sol';

interface IValueProviderBTC {
    function getCreditLimitRate(
        address _owner,
        uint256 _colAmount
    ) external view returns (RateLib.Rate memory);

    function getLiquidationLimitRate(
        address _owner,
        uint256 _colAmount
    ) external view returns (RateLib.Rate memory);

    function getCreditLimitBTC(
        address _owner,
        uint256 _colAmount
    ) external view returns (uint256);

    function getLiquidationLimitBTC(
        address _owner,
        uint256 _colAmount
    ) external view returns (uint256);

    function getPriceBTC(uint256 colAmount) external view returns (uint256);
}
