// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MockSwBTC is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {}

    function mint(address _account, uint256 _amount) public returns (bool) {
        _mint(_account, _amount);

        return true;
    }

    function burnFrom(address _account, uint256 _amount) public returns (bool) {
        _burn(_account, _amount);

        return true;
    }

    function convertToAssets(uint amount) external pure returns (uint) {
        return amount;
    }
}
