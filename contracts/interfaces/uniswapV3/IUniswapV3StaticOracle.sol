// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.17;

interface IUniswapV3StaticOracle {
    function quoteSpecificFeeTiersWithTimePeriod(
        uint128 _baseAmount,
        address _baseToken,
        address _quoteToken,
        uint24[] calldata _feeTiers,
        uint32 _period
    )
        external
        view
        returns (uint256 _quoteAmount, address[] memory _queriedPools);
}
