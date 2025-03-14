// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';

import {RateLib} from '../utils/RateLib.sol';
import './MarketplaceBase.sol';

abstract contract MarketplaceAuction is Initializable, MarketplaceBase {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using RateLib for RateLib.Rate;

    error InvalidBid(uint256 bidAmount);
    error InvalidAuction(uint256 index);

    event NewAuction(
        uint256 indexed auctionId,
        address indexed nft,
        uint256 indexed index,
        uint256 startTime
    );
    event NewBid(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 bidValue
    );
    event AuctionCanceled(uint256 indexed auctionId);
    event AuctionFailed(uint256 indexed auctionId);
    event NFTClaimed(uint256 indexed auctionId);
    event ETHClaimed(uint256 indexed auctionId);
    event BidWithdrawn(
        uint256 indexed auctionId,
        address indexed account,
        uint256 bidValue
    );
    event BidTimeIncrementChanged(uint256 newTime, uint256 oldTime);
    event MinimumIncrementRateChanged(
        RateLib.Rate newIncrementRate,
        RateLib.Rate oldIncrementRate
    );
    event AuctionDiscountRateChanged(
        RateLib.Rate newDiscountRate,
        RateLib.Rate oldDiscountRate
    );
    event DurationChanged(uint256 newDuration, uint256 oldDuration);

    struct Auction {
        address owner;
        address nftAddress;
        uint256 nftIndex;
        uint256 startTime;
        uint256 endTime;
        uint256 minBid;
        address highestBidOwner;
        bool ownerClaimed;
        mapping(address => uint256) bids;
    }

    bytes32 public constant AUCTION_PREFIX = keccak256('AUCTION_PREFIX');

    uint256 public bidTimeIncrement;
    uint256 public auctionsLength;

    RateLib.Rate public minIncrementRate;
    RateLib.Rate public auctionDiscountRate;

    mapping(address => EnumerableSetUpgradeable.UintSet) internal userAuctions;
    mapping(uint256 => Auction) public auctions;

    function __Auction_init(
        uint256 _bidTimeIncrement,
        RateLib.Rate memory _incrementRate,
        RateLib.Rate memory _auctionDiscountRate
    ) internal onlyInitializing {
        _setBidTimeIncrement(_bidTimeIncrement);
        _setMinimumIncrementRate(_incrementRate);
        _setAuctionDiscountRate(_auctionDiscountRate);
    }

    function _newAuction(
        address _owner,
        address _nft,
        uint256 _idx,
        uint256 _duration,
        uint256 _minBid
    ) internal {
        if (address(_nft) == address(0)) revert ZeroAddress();
        if (_duration < 1 days || _minBid == 0) revert InvalidAmount();

        uint auctionId = auctionsLength++;
        _transferAsset(
            msg.sender,
            address(this),
            _nft,
            _idx,
            AUCTION_PREFIX,
            auctionId
        );

        Auction storage auction = auctions[auctionId];
        auction.owner = _owner;
        auction.nftAddress = _nft;
        auction.nftIndex = _idx;
        auction.startTime = block.timestamp;
        auction.endTime = block.timestamp + _duration;
        auction.minBid = _minBid;

        emit NewAuction(auctionsLength - 1, _nft, _idx, block.timestamp);
    }

    /// @notice Allows the admin to cancel an ongoing auction with no bids
    /// @param _auctionIndex The index of the auction to cancel
    /// @param _nftRecipient The address to send the auctioned NFT to
    function _cancelAuction(
        uint256 _auctionIndex,
        address _nftRecipient
    ) internal {
        if (_nftRecipient == address(0)) revert ZeroAddress();

        Auction storage auction = auctions[_auctionIndex];
        address _nft = auction.nftAddress;
        if (_nft == address(0)) revert InvalidAuction(_auctionIndex);
        if (auction.owner != msg.sender) revert Unauthorized();
        if (auction.highestBidOwner != address(0)) revert Unauthorized();

        uint256 _nftIndex = auction.nftIndex;
        delete auctions[_auctionIndex];

        _transferAsset(
            address(this),
            _nftRecipient,
            _nft,
            _nftIndex,
            AUCTION_PREFIX,
            _auctionIndex
        );

        emit AuctionCanceled(_auctionIndex);
    }

    /// @notice Allows users to bid on an auction. In case of multiple bids by the same user,
    /// the actual bid value is the sum of all bids.
    /// @param _auctionIndex The index of the auction to bid on
    function _bid(uint256 _auctionIndex) internal {
        Auction storage auction = auctions[_auctionIndex];
        uint256 _endTime = auction.endTime;

        if (
            auction.startTime > block.timestamp ||
            block.timestamp >= auction.endTime
        ) revert Unauthorized();

        uint256 _previousBid = auction.bids[msg.sender];
        uint256 _bidValue = msg.value + _previousBid;
        uint256 _currentMinBid = auction.bids[auction.highestBidOwner];
        _currentMinBid += minIncrementRate.calculate(_currentMinBid);
        uint256 _maxPremiumPrice = _getPremiumPrice(
            auction.nftAddress,
            auction.nftIndex,
            auctionDiscountRate
        );

        if (
            _currentMinBid > _bidValue ||
            auction.minBid > _bidValue ||
            _maxPremiumPrice > _bidValue
        ) revert InvalidBid(_bidValue);

        auction.highestBidOwner = msg.sender;
        auction.bids[msg.sender] = _bidValue;

        if (_previousBid == 0)
            assert(userAuctions[msg.sender].add(_auctionIndex));

        uint256 _bidIncrement = bidTimeIncrement;
        if (_bidIncrement > _endTime - block.timestamp)
            auction.endTime = block.timestamp + _bidIncrement;

        emit NewBid(_auctionIndex, msg.sender, _bidValue);
    }

    /// @notice Allows the highest bidder to claim the NFT they bid on if the auction is already over.
    /// @param _auctionIndex The index of the auction to claim the NFT from
    function _claimNFT(uint256 _auctionIndex) internal {
        Auction storage auction = auctions[_auctionIndex];

        if (
            auction.highestBidOwner != msg.sender ||
            auction.endTime > block.timestamp ||
            !userAuctions[msg.sender].remove(_auctionIndex)
        ) revert Unauthorized();

        _transferAsset(
            address(this),
            msg.sender,
            auction.nftAddress,
            auction.nftIndex,
            AUCTION_PREFIX,
            _auctionIndex
        );

        emit NFTClaimed(_auctionIndex);
    }

    /// @notice Allows bidders to withdraw their bid. Only works if `msg.sender` isn't the highest bidder.
    /// @param _auctionIndex The auction to claim the bid from.
    function _withdrawBid(uint256 _auctionIndex) internal {
        Auction storage auction = auctions[_auctionIndex];

        if (auction.highestBidOwner == msg.sender) revert Unauthorized();

        uint256 _bidAmount = auction.bids[msg.sender];
        if (_bidAmount == 0) revert Unauthorized();

        delete auction.bids[msg.sender];
        assert(userAuctions[msg.sender].remove(_auctionIndex));

        (bool _sent, ) = payable(msg.sender).call{value: _bidAmount}('');
        assert(_sent);

        emit BidWithdrawn(_auctionIndex, msg.sender, _bidAmount);
    }

    /// @return The list of active bids for an account.
    /// @param _account The address to check.
    function getActiveBids(
        address _account
    ) external view returns (uint256[] memory) {
        return userAuctions[_account].values();
    }

    /// @return The active bid of an account for an auction.
    /// @param _auctionIndex The auction to retrieve the bid from.
    /// @param _account The bidder's account
    function getAuctionBid(
        uint256 _auctionIndex,
        address _account
    ) external view returns (uint256) {
        return auctions[_auctionIndex].bids[_account];
    }

    /// @notice Allows admins to withdraw ETH after a successful auction.
    /// @param _auctionIndex The auction to withdraw the ETH from
    function _withdrawETH(uint256 _auctionIndex) internal {
        Auction storage auction = auctions[_auctionIndex];
        if (auction.owner != msg.sender) revert Unauthorized();

        address _highestBidder = auction.highestBidOwner;
        if (
            auction.endTime > block.timestamp ||
            _highestBidder == address(0) ||
            auction.ownerClaimed
        ) revert Unauthorized();

        auction.ownerClaimed = true;

        emit ETHClaimed(_auctionIndex);

        uint bidAmount = auction.bids[_highestBidder];
        uint taxFee = _cutTax(bidAmount);
        (bool _sent, ) = payable(msg.sender).call{value: bidAmount - taxFee}(
            ''
        );
        assert(_sent);
    }

    /// @notice Allows admins to withdraw an unsold NFT
    /// @param _auctionIndex The auction to withdraw the NFT from.
    function _withdrawUnsoldNFT(uint256 _auctionIndex) internal {
        Auction storage auction = auctions[_auctionIndex];
        if (auction.owner != msg.sender) revert Unauthorized();

        address _highestBidder = auction.highestBidOwner;
        if (
            auction.endTime > block.timestamp ||
            _highestBidder != address(0) ||
            auction.ownerClaimed
        ) revert Unauthorized();

        auction.ownerClaimed = true;

        _transferAsset(
            address(this),
            msg.sender,
            auction.nftAddress,
            auction.nftIndex,
            AUCTION_PREFIX,
            _auctionIndex
        );

        emit AuctionFailed(_auctionIndex);
    }

    /// @notice Allows admins to set the amount of time to increase an auction by if a bid happens in the last few minutes
    /// @param _newTime The new amount of time
    function _setBidTimeIncrement(uint256 _newTime) internal {
        if (_newTime == 0) revert InvalidAmount();

        emit BidTimeIncrementChanged(_newTime, bidTimeIncrement);

        bidTimeIncrement = _newTime;
    }

    /// @notice Allows admins to set the minimum increment rate from the last highest bid.
    /// @param _newIncrementRate The new increment rate.
    function _setMinimumIncrementRate(
        RateLib.Rate memory _newIncrementRate
    ) internal {
        if (!_newIncrementRate.isValid() || !_newIncrementRate.isBelowOne())
            revert RateLib.InvalidRate();

        emit MinimumIncrementRateChanged(_newIncrementRate, minIncrementRate);

        minIncrementRate = _newIncrementRate;
    }

    /// @notice Allows admins to set the maximum discount rate for auction bids.
    /// @param _newDiscountRate The new discount rate.
    function _setAuctionDiscountRate(
        RateLib.Rate memory _newDiscountRate
    ) internal {
        if (!_newDiscountRate.isValid() || !_newDiscountRate.isBelowOne())
            revert RateLib.InvalidRate();

        emit AuctionDiscountRateChanged(_newDiscountRate, auctionDiscountRate);

        auctionDiscountRate = _newDiscountRate;
    }

    function _transferAsset(
        address from,
        address to,
        address nft,
        uint tokenId,
        bytes32 prefix,
        uint256 index
    ) internal virtual;

    function _cutTax(uint amount) internal virtual returns (uint fee);

    function _getPremiumPrice(
        address nft,
        uint tokenId,
        RateLib.Rate memory rate
    ) internal view virtual returns (uint price);
}
