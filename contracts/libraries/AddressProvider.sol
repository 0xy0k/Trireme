// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import {OwnableUpgradeable} from '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import {IAddressProvider} from '../interfaces/IAddressProvider.sol';

contract AddressProvider is OwnableUpgradeable, IAddressProvider {
    bytes32 private constant TREASURY = 'TREASURY';
    bytes32 private constant TRIREME = 'TRIREME';
    bytes32 private constant GUARDIAN = 'GUARDIAN';
    bytes32 private constant PRICE_ORACLE_AGGREGATOR =
        'PRICE_ORACLE_AGGREGATOR';
    bytes32 private constant BOND = 'BOND';

    /// @notice address storage
    mapping(bytes32 => address) private _addresses;

    bytes32 private constant OBELISK = 'OBELISK';
    bytes32 private constant OPTION_TRIREME = 'OPTION_TRIREME';
    bytes32 private constant FARMING = 'FARMING';

    /* ======== ERRORS ======== */

    error ZERO_ADDRESS();

    /* ======== INITIALIZATION ======== */

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        // init
        __Ownable_init();
    }

    /* ======== POLICY FUNCTIONS ======== */

    function setTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert ZERO_ADDRESS();

        _addresses[TREASURY] = treasury;
    }

    function setTrireme(address trireme) external onlyOwner {
        if (trireme == address(0)) revert ZERO_ADDRESS();

        _addresses[TRIREME] = trireme;
    }

    function setGuardian(address guardian) external onlyOwner {
        if (guardian == address(0)) revert ZERO_ADDRESS();

        _addresses[GUARDIAN] = guardian;
    }

    function setPriceOracleAggregator(
        address priceOracleAggregator
    ) external onlyOwner {
        if (priceOracleAggregator == address(0)) revert ZERO_ADDRESS();

        _addresses[PRICE_ORACLE_AGGREGATOR] = priceOracleAggregator;
    }

    function setBond(address bond) external onlyOwner {
        if (bond == address(0)) revert ZERO_ADDRESS();

        _addresses[BOND] = bond;
    }

    function setObelisk(address obelisk) external onlyOwner {
        if (obelisk == address(0)) revert ZERO_ADDRESS();

        _addresses[OBELISK] = obelisk;
    }

    function setOptionTrireme(address optionTrireme) external onlyOwner {
        if (optionTrireme == address(0)) revert ZERO_ADDRESS();

        _addresses[OPTION_TRIREME] = optionTrireme;
    }

    function setFarming(address farming) external onlyOwner {
        if (farming == address(0)) revert ZERO_ADDRESS();

        _addresses[FARMING] = farming;
    }

    /* ======== VIEW FUNCTIONS ======== */

    function getTreasury() external view returns (address) {
        return _addresses[TREASURY];
    }

    function getTrireme() external view returns (address) {
        return _addresses[TRIREME];
    }

    function getGuardian() external view returns (address) {
        return _addresses[GUARDIAN];
    }

    function getPriceOracleAggregator() external view returns (address) {
        return _addresses[PRICE_ORACLE_AGGREGATOR];
    }

    function getBond() external view returns (address) {
        return _addresses[BOND];
    }

    function getObelisk() external view returns (address) {
        return _addresses[OBELISK];
    }

    function getOptionTrireme() external view returns (address) {
        return _addresses[OPTION_TRIREME];
    }

    function getFarming() external view returns (address) {
        return _addresses[FARMING];
    }
}
