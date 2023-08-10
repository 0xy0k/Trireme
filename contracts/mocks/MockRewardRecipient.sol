pragma solidity 0.8.17;

import {IRewardRecipient} from '../interfaces/IRewardRecipient.sol';

contract MockRewardRecipient is IRewardRecipient {
    constructor() {}

    receive() external payable {}

    function receiveReward() external payable override {}
}
