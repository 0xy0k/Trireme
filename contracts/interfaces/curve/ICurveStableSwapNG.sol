// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

interface ICurveStableSwapNG {
    function coins(uint) external view returns (address);

    function exchange(
        int128 i,
        int128 j,
        uint _dx,
        uint _min_dy
    ) external returns (uint);
}
