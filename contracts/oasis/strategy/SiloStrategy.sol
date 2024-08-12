// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';

import '../../interfaces/IStrategy.sol';
import '../../interfaces/silo/ISilo.sol';

contract SiloStrategy is IStrategy, AccessControlUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct UserInfo {
        uint share;
    }

    bytes32 internal constant DAO_ROLE = keccak256('DAO_ROLE');

    address public vault;

    /// @dev Underlying token to deposit on Silo
    IERC20Upgradeable public uToken;
    /// @dev Underlying collateral token that you receive when deposit uToken on Silo, (sth like silo share token)
    IERC20Upgradeable public uCollateralToken;
    ISilo public silo;

    uint public totalShares;

    mapping(address => UserInfo) public userInfos;

    modifier onlyVault() {
        if (msg.sender != vault) revert Unauthorized();
        _;
    }

    function initialize(address _uToken, address _silo) external initializer {
        __AccessControl_init();
        _setupRole(DAO_ROLE, msg.sender);

        uToken = IERC20Upgradeable(_uToken);
        silo = ISilo(_silo);

        uCollateralToken = IERC20Upgradeable(
            address(silo.assetStorage(_uToken).collateralToken)
        );
    }

    function setVault(address _vault) external onlyRole(DAO_ROLE) {
        vault = _vault;
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

        userInfo.share -= _shareAmount;
        totalShares -= _shareAmount;
        (withdrawn, ) = silo.withdraw(address(uToken), amountToWithdraw, false);
        uToken.transfer(msg.sender, withdrawn);
    }

    function getUnderlyingAmount(
        address _account
    ) external view returns (uint) {
        return toAmount(userInfos[_account].share);
    }

    function pendingRewards(
        address _account
    ) external view returns (address[] memory, uint256[] memory) {}

    function claimRewards(address _account) external {
        revert('SiloClaiming not supported');
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
