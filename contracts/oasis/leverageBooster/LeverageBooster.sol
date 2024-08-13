// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import '../../interfaces/IVault.sol';

contract LeverageBooster is ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IVault public vault;
    IERC20Upgradeable public collateralToken;

    function initialize(address _vault) external initializer {
        __ReentrancyGuard_init();

        vault = IVault(_vault);
        collateralToken = IERC20Upgradeable(vault.tokenContract());
    }

    function leveragePosition(
        uint collAmount,
        uint borrowAmount,
        uint leverage
    ) external nonReentrant {
        for (uint i = 0; i < leverage; i++) {
            collateralToken.approve(address(vault), collAmount);
            vault.addCollateralFor(collAmount, msg.sender);

            vault.borrowFor(borrowAmount, msg.sender);
        }
    }

    function _openPosition(
        address account,
        uint collAmount,
        uint borrowAmount
    ) internal returns (uint nextCollAmount) {}

    function _swapStableTokenToCollateral() internal returns (uint output) {}
}
