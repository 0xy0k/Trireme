// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';

import 'contracts/interfaces/IVault.sol';
import 'contracts/interfaces/IValueProvider.sol';
import 'contracts/interfaces/ISwapRouter.sol';

contract LeverageBooster is
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 internal constant DAO_ROLE = keccak256('DAO_ROLE');

    string public description;
    IVault public vault;
    IERC20Upgradeable public collateralToken;
    IERC20Upgradeable public stablecoin;
    IValueProvider public valueProvider;
    ISwapRouter public swapRouter;

    function initialize(
        string memory _description,
        address _vault,
        address _swapRouter
    ) external initializer {
        __ReentrancyGuard_init();
        __AccessControl_init();

        _setupRole(DAO_ROLE, msg.sender);
        _setRoleAdmin(DAO_ROLE, DAO_ROLE);

        description = _description;
        vault = IVault(_vault);
        valueProvider = IValueProvider(vault.valueProvider());
        collateralToken = IERC20Upgradeable(vault.tokenContract());
        stablecoin = IERC20Upgradeable(vault.stablecoin());
        swapRouter = ISwapRouter(_swapRouter);
    }

    function leveragePosition(
        uint collAmount,
        uint borrowRatio,
        uint leverage
    ) external nonReentrant {
        collateralToken.safeTransferFrom(msg.sender, address(this), collAmount);

        for (uint i = 0; i < leverage; i++) {
            uint borrowAmount = _openPosition(
                msg.sender,
                collAmount,
                borrowRatio
            );

            // Not buying collateral tokens again at final loop to return tri stablecoins to user.
            if (i < leverage - 1) {
                collAmount = _swapStableTokenToCollateral(borrowAmount);
            }
        }

        // return final collateral tokens swapped out
        collateralToken.safeTransfer(
            msg.sender,
            collateralToken.balanceOf(address(this))
        );
        stablecoin.safeTransfer(
            msg.sender,
            stablecoin.balanceOf(address(this))
        );
    }

    /**
     * @dev Add collaterals to given vault and borrow stablecoins
     * @param account Account to open a position on behalf of
     * @param collAmount Collateral amount to open a position on behalf
     * @param borrowRatio Borrow ratio of position
     */
    function _openPosition(
        address account,
        uint collAmount,
        uint borrowRatio
    ) internal returns (uint borrowAmount) {
        collateralToken.approve(address(vault), collAmount);
        vault.addCollateralFor(collAmount, account);

        uint beforeStableBal = stablecoin.balanceOf(address(this));
        uint collValue = valueProvider.getPriceUSD(collAmount);
        borrowAmount = (collValue * borrowRatio) / 10000;
        vault.borrowFor(borrowAmount, account);
        uint afterStableBal = stablecoin.balanceOf(address(this));

        borrowAmount = afterStableBal - beforeStableBal;
    }

    /**
     * @dev Swap given amount of stablecoins tokens to collateral token
     * @param stableAmount Amount of stablecoins to swap to collateral tokens
     */
    function _swapStableTokenToCollateral(
        uint stableAmount
    ) internal returns (uint collOutput) {
        stablecoin.approve(address(swapRouter), stableAmount);
        return
            swapRouter.swap(
                address(stablecoin),
                address(collateralToken),
                stableAmount
            );
    }
}
