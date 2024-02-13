pragma solidity 0.8.17;

import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';

contract MockERC721 is ERC721 {
    uint256 private nextTokenId;

    string public baseURI;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_
    ) public ERC721(name_, symbol_) {
        baseURI = baseURI_;
    }

    function mint(address _account, uint256 count) public returns (bool) {
        for (uint256 i = 0; i < count; ++i) {
            nextTokenId++;
            _mint(_account, nextTokenId);
        }

        return true;
    }

    function burn(uint256 _tokenId) public returns (bool) {
        _burn(_tokenId);

        return true;
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
}
