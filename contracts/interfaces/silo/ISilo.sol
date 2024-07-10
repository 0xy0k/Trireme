// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts/interfaces/IERC20.sol';

interface ISilo {
    /// @dev Storage struct that holds all required data for a single token market
    struct AssetStorage {
        /// @dev Token that represents a share in totalDeposits of Silo
        IERC20 collateralToken;
        /// @dev Token that represents a share in collateralOnlyDeposits of Silo
        IERC20 collateralOnlyToken;
        /// @dev Token that represents a share in totalBorrowAmount of Silo
        IERC20 debtToken;
        /// @dev COLLATERAL: Amount of asset token that has been deposited to Silo with interest earned by depositors.
        /// It also includes token amount that has been borrowed.
        uint256 totalDeposits;
        /// @dev COLLATERAL ONLY: Amount of asset token that has been deposited to Silo that can be ONLY used
        /// as collateral. These deposits do NOT earn interest and CANNOT be borrowed.
        uint256 collateralOnlyDeposits;
        /// @dev DEBT: Amount of asset token that has been borrowed with accrued interest.
        uint256 totalBorrowAmount;
    }

    /// @notice Get asset storage data
    /// @param _asset asset address
    /// @return AssetStorage struct
    function assetStorage(
        address _asset
    ) external view returns (AssetStorage memory);

    /// @notice Deposit `_amount` of `_asset` tokens from `msg.sender` to the Silo
    /// @param _asset The address of the token to deposit
    /// @param _amount The amount of the token to deposit
    /// @param _collateralOnly True if depositing collateral only
    /// @return collateralAmount deposited amount
    /// @return collateralShare user collateral shares based on deposited amount
    function deposit(
        address _asset,
        uint256 _amount,
        bool _collateralOnly
    ) external returns (uint256 collateralAmount, uint256 collateralShare);

    /// @notice Withdraw `_amount` of `_asset` tokens from the Silo to `msg.sender`
    /// @param _asset The address of the token to withdraw
    /// @param _amount The amount of the token to withdraw
    /// @param _collateralOnly True if withdrawing collateral only deposit
    /// @return withdrawnAmount withdrawn amount that was transferred to user
    /// @return withdrawnShare burned share based on `withdrawnAmount`
    function withdraw(
        address _asset,
        uint256 _amount,
        bool _collateralOnly
    ) external returns (uint256 withdrawnAmount, uint256 withdrawnShare);
}
