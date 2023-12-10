// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IOptionTrireme {
    function MULTIPLIER() external view returns (uint256);

    function discount() external view returns (uint256);

    function addressProvider() external view returns (address);
}
