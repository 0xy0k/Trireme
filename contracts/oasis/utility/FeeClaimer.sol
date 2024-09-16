// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';

interface IVaultFee {
    function collect() external;
}

contract FeeClaimer is AccessControl {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    bytes32 public constant DAO_ROLE = keccak256('DAO_ROLE');

    EnumerableSet.AddressSet vaults;
    EnumerableSet.AddressSet feeTokens;
    address public treasury;

    event VaultAdded(address vault);
    event VaultRemoved(address vault);
    event TreasuryUpdated(address treasury);

    constructor(address _treasury) {
        _setupRole(DAO_ROLE, msg.sender);
        _setRoleAdmin(DAO_ROLE, DAO_ROLE);

        treasury = _treasury;
    }

    function setVault(address vault, bool add) external onlyRole(DAO_ROLE) {
        if (add) {
            vaults.add(vault);
            emit VaultAdded(vault);
        } else {
            vaults.remove(vault);
            emit VaultRemoved(vault);
        }
    }

    function setFeeTokens(address token, bool add) external onlyRole(DAO_ROLE) {
        if (add) {
            feeTokens.add(token);
        } else {
            feeTokens.remove(token);
        }
    }

    function setTreasury(address _treasury) external onlyRole(DAO_ROLE) {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function isVaultAdded(address vault) external view returns (bool) {
        return vaults.contains(vault);
    }

    function vaultsArray() external view returns (address[] memory) {
        return vaults.values();
    }

    function feeTokensArray() external view returns (address[] memory) {
        return feeTokens.values();
    }

    function claimFees() external {
        address[] memory _vaults = vaults.values();
        for (uint i = 0; i < _vaults.length; i++) {
            IVaultFee(_vaults[i]).collect();
        }

        address[] memory _feeTokens = feeTokens.values();
        for (uint i = 0; i < _feeTokens.length; i++) {
            IERC20 token = IERC20(_feeTokens[i]);
            token.transfer(treasury, token.balanceOf(address(this)));
        }
    }

    function withdraw(address token) external {
        IERC20(token).transfer(
            treasury,
            IERC20(token).balanceOf(address(this))
        );
    }
}
