// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155ReceiverUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol';

import {RateLib} from '../utils/RateLib.sol';

import './MarketplaceAuction.sol';
import './MarketplaceSale.sol';
import './MarketplaceEscrow.sol';

contract ERC1155Marketplace is
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    IERC1155ReceiverUpgradeable,
    MarketplaceAuction,
    MarketplaceSale
{
    error NoEscrow(uint tokenId);

    bytes32 public constant WHITELISTED_ROLE = keccak256('WHITELISTED_ROLE');
    mapping(bytes => address) public escrows;

    function initialize(
        uint256 _bidTimeIncrement,
        RateLib.Rate memory _incrementRate
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Auction_init(_bidTimeIncrement, _incrementRate);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        setBidTimeIncrement(_bidTimeIncrement);
        setMinimumIncrementRate(_incrementRate);
    }

    /// @notice Allows whitelisted addresses to create a new auction in the next slot.
    /// @param _nft The address of the NFT to sell
    /// @param _idx The index of the NFT to sell
    /// @param _minBid The minimum bid value
    function newAuction(
        address _owner,
        address _nft,
        uint256 _idx,
        uint256 _duration,
        uint256 _minBid
    ) external nonReentrant {
        _newAuction(_owner, _nft, _idx, _duration, _minBid);
    }

    /// @notice Allows the admin to cancel an ongoing auction with no bids
    /// @param _auctionIndex The index of the auction to cancel
    /// @param _nftRecipient The address to send the auctioned NFT to
    function cancelAuction(
        uint256 _auctionIndex,
        address _nftRecipient
    ) external nonReentrant {
        _cancelAuction(_auctionIndex, _nftRecipient);
    }

    /// @notice Allows users to bid on an auction. In case of multiple bids by the same user,
    /// the actual bid value is the sum of all bids.
    /// @param _auctionIndex The index of the auction to bid on
    function bid(uint256 _auctionIndex) public payable nonReentrant {
        _bid(_auctionIndex);
    }

    /// @notice Allows the highest bidder to claim the NFT they bid on if the auction is already over.
    /// @param _auctionIndex The index of the auction to claim the NFT from
    function claimNFT(uint256 _auctionIndex) external nonReentrant {
        _claimNFT(_auctionIndex);
    }

    /// @notice Allows bidders to withdraw their bid. Only works if `msg.sender` isn't the highest bidder.
    /// @param _auctionIndex The auction to claim the bid from.
    function withdrawBid(uint256 _auctionIndex) public nonReentrant {
        _withdrawBid(_auctionIndex);
    }

    /// @notice Allows bidders to withdraw multiple bids. Only works if `msg.sender` isn't the highest bidder.
    /// @param _indexes The auctions to claim the bids from.
    function withdrawBids(uint256[] calldata _indexes) external {
        for (uint256 i; i < _indexes.length; i++) {
            withdrawBid(_indexes[i]);
        }
    }

    /// @notice Allows admins to withdraw ETH after a successful auction.
    /// @param _auctionIndex The auction to withdraw the ETH from
    function withdrawETH(uint256 _auctionIndex) external nonReentrant {
        _withdrawETH(_auctionIndex);
    }

    /// @notice Allows admins to withdraw an unsold NFT
    /// @param _auctionIndex The auction to withdraw the NFT from.
    function withdrawUnsoldNFT(uint256 _auctionIndex) external nonReentrant {
        _withdrawUnsoldNFT(_auctionIndex);
    }

    /// @notice Allows admins to set the amount of time to increase an auction by if a bid happens in the last few minutes
    /// @param _newTime The new amount of time
    function setBidTimeIncrement(
        uint256 _newTime
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setBidTimeIncrement(_newTime);
    }

    /// @notice Allows admins to set the minimum increment rate from the last highest bid.
    /// @param _newIncrementRate The new increment rate.
    function setMinimumIncrementRate(
        RateLib.Rate memory _newIncrementRate
    ) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setMinimumIncrementRate(_newIncrementRate);
    }

    /// @notice Create a new sale
    /// @param _nft The address of the NFT to sell
    /// @param _idx The index of the NFT to sell
    /// @param _price The price of sale
    function listSale(
        address _owner,
        address _nft,
        uint256 _idx,
        uint256 _price
    ) external nonReentrant {
        _listSale(_owner, _nft, _idx, _price);
    }

    /// @notice Allows the admin to cancel an ongoing sale with no offers
    /// @param _saleIndex The index of the sale to cancel
    /// @param _nftRecipient The address to send the NFT back to
    function cancelSale(
        uint256 _saleIndex,
        address _nftRecipient
    ) external nonReentrant {
        _cancelSale(_saleIndex, _nftRecipient);
    }

    /// @notice Allows the admin to update an ongoing sale with no offers
    /// @param _saleIndex The index of the sale to update
    /// @param _price The new price of sale
    function updateSale(uint256 _saleIndex, uint _price) external nonReentrant {
        _updateSale(_saleIndex, _price);
    }

    /// @notice Allows admins to buy Sale
    /// @param _saleIndex The sale index to deal
    function buy(uint256 _saleIndex) external payable nonReentrant {
        _buy(_saleIndex);
    }

    function _transferAsset(
        address from,
        address to,
        address nft,
        uint tokenId,
        bytes32 prefix,
        uint index
    ) internal override(MarketplaceAuction, MarketplaceSale) {
        bytes memory key = abi.encode(prefix, nft, tokenId, index);

        if (to == address(this)) {
            // Create a new escrow
            MarketplaceEscrow escrow = new MarketplaceEscrow();
            escrows[key] = address(escrow);
            IERC1155Upgradeable(nft).safeTransferFrom(
                from,
                address(escrow),
                tokenId,
                1,
                ''
            );
        }
        if (from == address(this)) {
            MarketplaceEscrow escrow = MarketplaceEscrow(escrows[key]);
            if (address(escrow) == address(0)) revert NoEscrow(tokenId);

            escrow.refundAsset(nft, tokenId, to);
        }
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
}
