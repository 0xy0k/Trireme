// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';
import '../interfaces/IChainlinkV3Aggregator.sol';

contract MockChainlinkV3Aggregator is IChainlinkV3Aggregator, Ownable {
    uint8 public override decimals;
    int256 public price;

    constructor(uint8 _decimals, int256 _price) Ownable() {
        decimals = _decimals;
        price = _price;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256 answer, uint256, uint256 timestamp, uint80)
    {
        answer = price;
        timestamp = block.timestamp;
    }

    function setDecimals(uint8 _decimals) external onlyOwner {
        decimals = _decimals;
    }

    function setPrice(int256 _price) external onlyOwner {
        price = _price;
    }
}
