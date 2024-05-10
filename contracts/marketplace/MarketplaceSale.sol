// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.17;

import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';
import '@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol';

import './MarketplaceBase.sol';

abstract contract MarketplaceSale is Initializable, MarketplaceBase {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

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

    struct Sale {
        address owner;
        address nftAddress;
        uint256 nftIndex;
        uint256 startTime;
        uint256 price;
        bool bought;
    }

    bytes32 public constant SALE_PREFIX = keccak256('SALE_PREFIX');

    uint256 public salesLength;

    mapping(address => EnumerableSetUpgradeable.UintSet) internal userSales;
    mapping(uint256 => Sale) public sales;

    function __Sale_init() internal onlyInitializing {}

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
        if (_price == 0) revert InvalidAmount();

        Sale storage sale = sales[salesLength++];
        sale.owner = _owner;
        sale.nftAddress = _nft;
        sale.nftIndex = _idx;
        sale.price = _price;

        _transferAsset(msg.sender, address(this), _nft, _idx, SALE_PREFIX);

        emit NewSale(salesLength - 1, _nft, _idx, _price);
    }

    /// @notice Allows the admin to cancel an ongoing sale with no offers
    /// @param _saleIndex The index of the sale to cancel
    /// @param _nftRecipient The address to send the NFT back to
    function _cancelSale(uint256 _saleIndex, address _nftRecipient) internal {
        if (_nftRecipient == address(0)) revert ZeroAddress();

        Sale storage sale = sales[_saleIndex];
        address _nft = sale.nftAddress;
        if (_nft == address(0)) revert InvalidSale(_saleIndex);
        if (sale.owner != msg.sender) revert Unauthorized();

        uint256 _nftIndex = sale.nftIndex;
        delete sales[_saleIndex];

        _transferAsset(
            address(this),
            _nftRecipient,
            _nft,
            _nftIndex,
            SALE_PREFIX
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
        if (_price == 0) revert InvalidAmount();
        if (sale.owner != msg.sender) revert Unauthorized();

        sale.price = _price;

        emit SaleUpdated(_saleIndex, _price);
    }

    /// @notice Allows admins to buy Sale
    /// @param _saleIndex The sale index to deal
    function _buy(uint256 _saleIndex) internal {
        Sale storage sale = sales[_saleIndex];
        if (sale.bought) revert InvalidSale(_saleIndex);
        if (msg.value < sale.price) revert InvalidAmount();

        sale.bought = true;

        emit BoughtSale(_saleIndex, msg.sender);

        _transferAsset(
            address(this),
            msg.sender,
            sale.nftAddress,
            sale.nftIndex,
            SALE_PREFIX
        );

        (bool _sent, ) = payable(msg.sender).call{value: sale.price}('');
        assert(_sent);

        // Refund dust
        (_sent, ) = payable(msg.sender).call{value: msg.value - sale.price}('');
        assert(_sent);
    }

    function _transferAsset(
        address from,
        address to,
        address nft,
        uint tokenId,
        bytes32 prefix
    ) internal virtual;
}
