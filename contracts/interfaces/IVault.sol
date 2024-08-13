// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

interface IVault {
    function addCollateral(uint256 _colAmount) external;

    function addCollateralFor(uint _colAmount, address _onBehalfOf) external;

    function borrow(uint256 _amount) external;

    function borrowFor(uint256 _amount, address _onBehalfOf) external;

    function tokenContract() external view returns (address);
}
