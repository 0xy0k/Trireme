// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IAddressProvider {
    function getTreasury() external view returns (address);

    function getTrireme() external view returns (address);

    function getGuardian() external view returns (address);

    function getPriceOracleAggregator() external view returns (address);

    function getBond() external view returns (address);

    function getObelisk() external view returns (address);

    function getOptionTrireme() external view returns (address);

    function getFarming() external view returns (address);
}
