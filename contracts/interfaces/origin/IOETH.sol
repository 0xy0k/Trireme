// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface IOETH {
    function totalSupply() external view returns (uint256);

    function vaultAddress() external view returns (address);
}
