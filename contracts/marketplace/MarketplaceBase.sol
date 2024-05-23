// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

import {RateLib} from '../utils/RateLib.sol';

abstract contract MarketplaceBase {
    error InvalidAmount();
    error ZeroAddress();
    error Unauthorized();
}
