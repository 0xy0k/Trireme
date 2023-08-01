pragma solidity 0.8.17;

import {IRewardRecipient} from '../interfaces/IRewardRecipient.sol';

contract MockRewardRecipient is IRewardRecipient {
    constructor() {}

    function receiveReward() external payable override {}
}
