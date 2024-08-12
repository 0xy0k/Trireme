// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts/interfaces/IERC20.sol';
import '../interfaces/silo/ISilo.sol';

contract MockSilo is ISilo {
    mapping(address => AssetStorage) _assetStorage;
    uint public totalSupply;

    function setAssetStorage(address asset) external {
        _assetStorage[asset].collateralToken = IERC20(address(this));
    }

    function deposit(
        address _asset,
        uint256 _amount,
        bool
    ) external returns (uint256 collateralAmount, uint256 collateralShare) {
        IERC20(_asset).transferFrom(msg.sender, address(this), _amount);
        _assetStorage[_asset].totalDeposits += _amount;
        totalSupply += _amount;
        return (_amount, _amount);
    }

    function withdraw(
        address _asset,
        uint256 _amount,
        bool
    ) external returns (uint256 withdrawnAmount, uint256 withdrawnShare) {
        IERC20(_asset).transfer(msg.sender, _amount);
        _assetStorage[_asset].totalDeposits -= _amount;
        totalSupply -= _amount;
        return (_amount, _amount);
    }

    function assetStorage(
        address _asset
    ) external view returns (AssetStorage memory) {
        return _assetStorage[_asset];
    }
}
