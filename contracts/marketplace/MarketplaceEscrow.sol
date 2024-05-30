// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC1155/IERC1155.sol';
import '@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol';

contract MarketplaceEscrow is Ownable, IERC1155Receiver {
    constructor() {}

    function refundAsset(
        address nft,
        uint tokenId,
        address to
    ) external onlyOwner {
        IERC1155(nft).safeTransferFrom(address(this), to, tokenId, 1, '');
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return
            bytes4(
                keccak256(
                    'onERC1155Received(address,address,uint256,uint256,bytes)'
                )
            );
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return
            bytes4(
                keccak256(
                    'onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)'
                )
            );
    }

    function supportsInterface(
        bytes4 interfaceId
    ) external pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId;
    }
}
