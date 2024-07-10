// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

import './BaseStrategy.sol';
import '../../interfaces/IStrategy.sol';
import '../../interfaces/silo/ISilo.sol';

contract SiloStrategy is IStrategy {
    using SafeERC20 for IERC20;

    address public vault;
    IERC20 public uToken;
    IERC20 public uCollateralToken;
    ISilo public silo;

    uint public totalShares;

    struct UserInfo {
        uint share;
    }

    mapping(address => UserInfo) public userInfos;

    modifier onlyVault() {
        if (msg.sender != vault) revert Unauthorized();
        _;
    }

    constructor(address _uToken, address _silo) {
        uToken = IERC20(_uToken);
        silo = ISilo(_silo);

        uCollateralToken = silo.assetStorage(_uToken).collateralToken;
    }

    function deposit(
        address _account,
        uint _amount
    ) external onlyVault returns (uint share) {
        if (_amount == 0) revert ZeroAmount();
        if (_account == address(0)) revert ZeroAddress();

        uToken.safeTransferFrom(msg.sender, address(this), _amount);
        uToken.safeApprove(address(silo), _amount);
        (, share) = silo.deposit(address(uToken), _amount, false);

        UserInfo storage userInfo = userInfos[_account];
        userInfo.share += share;
        totalShares += share;
    }

    function withdraw(
        address _account,
        uint _shareAmount
    ) external onlyVault returns (uint withdrawn) {
        if (_account == address(0)) revert ZeroAddress();
        if (_shareAmount == 0) revert ZeroAmount();

        UserInfo storage userInfo = userInfos[_account];
        uint amountToWithdraw = toAmount(_shareAmount);

        (withdrawn, ) = silo.withdraw(address(uToken), amountToWithdraw, false);
        userInfo.share -= _shareAmount;
        totalShares -= _shareAmount;

        uToken.transfer(msg.sender, withdrawn);
    }

    function getUnderlyingAmount(
        address _account
    ) external view returns (uint) {
        return toAmount(userInfos[_account].share);
    }

    function toAmount(uint share) public view returns (uint) {
        ISilo.AssetStorage memory assetStorage = silo.assetStorage(
            address(uToken)
        );
        return
            _toAmount(
                share,
                assetStorage.totalDeposits,
                uCollateralToken.totalSupply()
            );
    }

    function _toShareRoundUp(
        uint256 amount,
        uint256 totalAmount,
        uint256 uTotalShares
    ) internal pure returns (uint256) {
        if (uTotalShares == 0 || totalAmount == 0) {
            return amount;
        }

        uint256 numerator = amount * uTotalShares;
        uint256 result = numerator / totalAmount;

        // Round up
        if (numerator % totalAmount != 0) {
            result += 1;
        }

        return result;
    }

    function _toAmount(
        uint256 share,
        uint256 totalAmount,
        uint256 uTotalShares
    ) internal pure returns (uint256) {
        if (uTotalShares == 0 || totalAmount == 0) {
            return 0;
        }

        uint256 result = (share * totalAmount) / uTotalShares;

        // Prevent rounding error
        if (result == 0 && share != 0) {
            revert();
        }

        return result;
    }
}
