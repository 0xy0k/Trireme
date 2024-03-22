// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.17;

import '@openzeppelin/contracts/token/ERC1155/ERC1155.sol';

contract MockERC1155 is ERC1155 {
    constructor(string memory uri_) ERC1155(uri_) {}

    function mint(address to, uint tokenId, uint amount) external {
        _mint(to, tokenId, amount, '');
    }
}
