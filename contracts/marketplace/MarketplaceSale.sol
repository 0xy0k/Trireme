// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';

import {RateLib} from '../utils/RateLib.sol';
import './MarketplaceBase.sol';

abstract contract MarketplaceSale is Initializable, MarketplaceBase {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using RateLib for RateLib.Rate;

    error InvalidSale(uint256 index);

    event NewSale(
        uint256 indexed saleId,
        address indexed nft,
        uint256 indexed index,
        uint256 price
    );
    event SaleCanceled(uint256 indexed saleId);
    event SaleUpdated(uint256 indexed saleId, uint price);
    event BoughtSale(uint256 indexed saleId, address from);
    event SaleDiscountRateChanged(
        RateLib.Rate newDiscountRate,
        RateLib.Rate oldDiscountRate
    );

    struct Sale {
        address owner;
        address nftAddress;
        uint256 nftIndex;
        uint256 price;
        address buyer;
    }

    bytes32 public constant SALE_PREFIX = keccak256('SALE_PREFIX');

    uint256 public salesLength;
    RateLib.Rate public saleDiscountRate;

    mapping(address => EnumerableSetUpgradeable.UintSet) internal userSales;
    mapping(uint256 => Sale) public sales;

    function __Sale_init(
        RateLib.Rate memory _saleDiscountRate
    ) internal onlyInitializing {
        _setSalesDiscountRate(_saleDiscountRate);
    }

    /// @notice Create a new sale
    /// @param _nft The address of the NFT to sell
    /// @param _idx The index of the NFT to sell
    /// @param _price The price of sale
    function _listSale(
        address _owner,
        address _nft,
        uint256 _idx,
        uint256 _price
    ) internal {
        if (address(_nft) == address(0)) revert ZeroAddress();
        uint256 premiumPrice = _getPremiumPrice(_nft, _idx, saleDiscountRate);
        if (_price < premiumPrice || _price == 0) revert InvalidAmount();

        uint saleId = salesLength++;
        _transferAsset(_owner, address(this), _nft, _idx, SALE_PREFIX, saleId);

        Sale storage sale = sales[saleId];
        sale.owner = _owner;
        sale.nftAddress = _nft;
        sale.nftIndex = _idx;
        sale.price = _price;

        userSales[_owner].add(saleId);

        emit NewSale(saleId, _nft, _idx, _price);
    }

    /// @notice Allows the admin to cancel an ongoing sale with no offers
    /// @param _saleIndex The index of the sale to cancel
    /// @param _nftRecipient The address to send the NFT back to
    function _cancelSale(uint256 _saleIndex, address _nftRecipient) internal {
        if (_nftRecipient == address(0)) revert ZeroAddress();

        Sale storage sale = sales[_saleIndex];
        address _nft = sale.nftAddress;
        uint256 _nftIndex = sale.nftIndex;
        if (_nft == address(0)) revert InvalidSale(_saleIndex);
        if (sale.owner != msg.sender || sale.buyer != address(0))
            revert Unauthorized();

        delete sales[_saleIndex];
        userSales[sale.owner].remove(_saleIndex);

        _transferAsset(
            address(this),
            _nftRecipient,
            _nft,
            _nftIndex,
            SALE_PREFIX,
            _saleIndex
        );

        emit SaleCanceled(_saleIndex);
    }

    /// @notice Allows the admin to update an ongoing sale with no offers
    /// @param _saleIndex The index of the sale to update
    /// @param _price The new price of sale
    function _updateSale(uint256 _saleIndex, uint _price) internal {
        Sale storage sale = sales[_saleIndex];
        address _nft = sale.nftAddress;
        if (_nft == address(0)) revert InvalidSale(_saleIndex);
        uint256 _maxPremiumPrice = _getPremiumPrice(
            _nft,
            sale.nftIndex,
            saleDiscountRate
        );
        if (_price < _maxPremiumPrice || _price == 0) revert InvalidAmount();

        if (sale.owner != msg.sender || sale.buyer != address(0))
            revert Unauthorized();

        sale.price = _price;

        emit SaleUpdated(_saleIndex, _price);
    }

    /// @notice Allows admins to buy Sale
    /// @param _saleIndex The sale index to deal
    function _buy(uint256 _saleIndex) internal {
        Sale storage sale = sales[_saleIndex];
        address _nft = sale.nftAddress;
        if (_nft == address(0)) revert InvalidSale(_saleIndex);
        if (sale.buyer != address(0)) revert InvalidSale(_saleIndex);
        if (msg.value < sale.price) revert InvalidAmount();

        sale.buyer = msg.sender;
        userSales[sale.owner].remove(_saleIndex);

        emit BoughtSale(_saleIndex, msg.sender);

        _transferAsset(
            address(this),
            msg.sender,
            sale.nftAddress,
            sale.nftIndex,
            SALE_PREFIX,
            _saleIndex
        );

        uint taxFee = _cutTax(sale.price);
        (bool _sent, ) = payable(sale.owner).call{value: sale.price - taxFee}(
            ''
        );
        assert(_sent);

        // Refund dust
        uint dust = msg.value - sale.price;
        if (dust > 0) {
            (_sent, ) = payable(msg.sender).call{value: dust}('');
            assert(_sent);
        }
    }

    /// @return The list of active sales for an account.
    /// @param _account The address to check.
    function getActiveSales(
        address _account
    ) external view returns (uint256[] memory) {
        return userSales[_account].values();
    }

    /// @notice Allows admins to set the maximum discount rate for sales.
    /// @param _newDiscountRate The new discount rate.
    function _setSalesDiscountRate(
        RateLib.Rate memory _newDiscountRate
    ) internal {
        if (!_newDiscountRate.isValid() || !_newDiscountRate.isBelowOne())
            revert RateLib.InvalidRate();

        emit SaleDiscountRateChanged(_newDiscountRate, saleDiscountRate);

        saleDiscountRate = _newDiscountRate;
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
    ) internal virtual returns (uint price);
}
