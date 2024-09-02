import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, expect, upgrades } from 'hardhat';
import { ERC1155Marketplace, MockERC1155, MockERC721 } from '../../types';
import { BigNumber, constants } from 'ethers';
import { AbiCoder, Interface, keccak256, parseEther } from 'ethers/lib/utils';
import { evm_increaseTime } from '../helper';

describe('ERC1155 Marketplace', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let treasury: SignerWithAddress;

  let mockNFT: MockERC1155;
  let marketplace: ERC1155Marketplace;

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);

  const auctionDuration = BigNumber.from(60 * 60 * 24);
  const bidTimeIncrement = BigNumber.from(10);
  const minimumBid = parseEther('10');
  const bidAmount = parseEther('20');

  const WHITELISTED_ROLE =
    '0x8429d542926e6695b59ac6fbdcd9b37e8b1aeb757afab06ab60b1bb5878c3b49';

  const tokenId = 0;

  before(async () => {
    [owner, alice, treasury] = await ethers.getSigners();

    const factory = await ethers.getContractFactory('MockERC1155');
    mockNFT = <MockERC1155>await factory.deploy('');
  });

  describe('Previlige Actions', async () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
    });
    it('default admin should be able to set bid time increment', async () => {
      await expect(
        marketplace.connect(alice).setBidTimeIncrement(bidTimeIncrement)
      ).to.be.revertedWith('AccessControl');

      await expect(marketplace.setBidTimeIncrement(0)).to.be.revertedWith(
        'InvalidAmount'
      );

      await expect(
        marketplace.setBidTimeIncrement(bidTimeIncrement.mul(2))
      ).to.be.emit(marketplace, 'BidTimeIncrementChanged');
      expect(await marketplace.bidTimeIncrement()).to.be.equal(
        bidTimeIncrement.mul(2)
      );
    });
    it('default admin should be able to set minimum increment rate', async () => {
      await expect(
        marketplace
          .connect(alice)
          .setMinimumIncrementRate({ numerator, denominator })
      ).to.be.revertedWith('AccessControl');

      await expect(
        marketplace.setMinimumIncrementRate({ numerator, denominator: 0 })
      ).to.be.revertedWith('InvalidRate');
      await expect(
        marketplace.setMinimumIncrementRate({
          numerator: numerator.add(denominator),
          denominator,
        })
      ).to.be.revertedWith('InvalidRate');

      await expect(
        marketplace.setMinimumIncrementRate({
          numerator: numerator.mul(2),
          denominator,
        })
      ).to.be.emit(marketplace, 'MinimumIncrementRateChanged');

      const rate = await marketplace.minIncrementRate();
      expect(rate.numerator).to.be.equal(numerator.mul(2));
      expect(rate.denominator).to.be.equal(denominator);
    });
  });

  describe('New Auction', () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );

      await mockNFT.mint(owner.address, tokenId, 1);
    });

    it('should revert creating a new auction for invalid nft address', async () => {
      await expect(
        marketplace.newAuction(
          owner.address,
          constants.AddressZero,
          tokenId,
          auctionDuration,
          minimumBid
        )
      ).to.be.revertedWith('ZeroAddress');
    });
    it('should revert creating a new auction when minimum bid is zero', async () => {
      await expect(
        marketplace.newAuction(
          owner.address,
          mockNFT.address,
          tokenId,
          auctionDuration,
          0
        )
      ).to.be.revertedWith('InvalidAmount');
    });
    it('whitelisted role should be able to create new auction', async () => {
      await mockNFT.setApprovalForAll(marketplace.address, true);
      await expect(
        marketplace.newAuction(
          owner.address,
          mockNFT.address,
          tokenId,
          auctionDuration,
          minimumBid
        )
      ).to.be.emit(marketplace, 'NewAuction');

      expect(await mockNFT.balanceOf(marketplace.address, tokenId)).to.be.equal(
        0
      );

      const auctionId = (await marketplace.auctionsLength()).sub(1);
      const auctionInfo = await marketplace.auctions(auctionId);
      expect(auctionInfo.minBid).to.be.equal(minimumBid);
      expect(auctionInfo.owner).to.be.equal(owner.address);
      expect(auctionInfo.nftAddress).to.be.equal(mockNFT.address);
      expect(auctionInfo.nftIndex).to.be.equal(tokenId);
      expect(auctionInfo.startTime).to.be.gt(0);
      expect(auctionInfo.endTime).to.be.equal(
        auctionInfo.startTime.add(auctionDuration)
      );

      const prefix = await marketplace.AUCTION_PREFIX();
      const escrowId = Interface.getAbiCoder().encode(
        ['bytes32', 'address', 'uint256', 'uint256'],
        [prefix, mockNFT.address, tokenId, auctionId]
      );
      const escrow = await marketplace.escrows(escrowId);
      expect(await mockNFT.balanceOf(escrow, tokenId)).to.be.equal(1);
    });
  });
  describe('Discount', () => {
    const oracle = '0x33b2CBD4cE2bc31f8650CEAbfB471A6ff8d6AFC9';

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          mockNFT.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);
      await marketplace.enableDiscount(true);
      await marketplace.setOracle(mockNFT.address, oracle);

      await mockNFT.mint(owner.address, tokenId, 1);
      await mockNFT.setApprovalForAll(marketplace.address, true);
    });
    it('should be able to list nft', async () => {
      const nftPrice = await marketplace.getNftPriceInETH(mockNFT.address);
      await marketplace.listSale(
        owner.address,
        mockNFT.address,
        tokenId,
        nftPrice
      );
    });
    it('should be reverted when listing under premium price', async () => {
      const nftPrice = await marketplace.getNftPriceInETH(mockNFT.address);
      const listingPrice = nftPrice.mul(numerator).div(denominator);

      await expect(
        marketplace.listSale(
          owner.address,
          mockNFT.address,
          tokenId,
          listingPrice.sub(1)
        )
      ).to.be.revertedWith('InvalidAmount');
    });
  });
  describe('Bid', async () => {
    let auctionId: BigNumber;
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.newAuction(
        owner.address,
        mockNFT.address,
        tokenId,
        auctionDuration,
        minimumBid
      );
      auctionId = (await marketplace.auctionsLength()).sub(1);
    });
    it('should revert when auction is expired', async () => {
      await expect(
        marketplace.bid(auctionId.add(10), { value: bidAmount })
      ).to.be.revertedWith('Unauthorized');
      await evm_increaseTime(auctionDuration.mul(2).toNumber());
      await expect(
        marketplace.bid(auctionId.add(auctionId), { value: bidAmount })
      ).to.be.revertedWith('Unauthorized');
    });
    it('should revert when bid amount is below min bid or last bid', async () => {
      await evm_increaseTime(auctionDuration.div(2).toNumber());
      await expect(
        marketplace.bid(auctionId, { value: minimumBid.div(2) })
      ).to.be.revertedWith('InvalidBid');

      await marketplace.bid(auctionId, { value: bidAmount });
      await expect(
        marketplace.connect(alice).bid(auctionId, { value: bidAmount.div(2) })
      ).to.be.revertedWith('InvalidBid');
    });
    it('should be able to bid to current active auction', async () => {
      await expect(marketplace.bid(auctionId, { value: bidAmount })).to.be.emit(
        marketplace,
        'NewBid'
      );
      const auctionInfo = await marketplace.auctions(auctionId);
      expect(auctionInfo.highestBidOwner).to.be.equal(owner.address);

      await marketplace
        .connect(alice)
        .bid(auctionId, { value: bidAmount.mul(2) });
      expect(
        (await marketplace.auctions(auctionId)).highestBidOwner
      ).to.be.equal(alice.address);

      expect(
        await marketplace.getAuctionBid(auctionId, owner.address)
      ).to.be.equal(bidAmount);
      expect(
        await marketplace.getAuctionBid(auctionId, alice.address)
      ).to.be.equal(bidAmount.mul(2));
    });
  });
  describe('Claim NFT', () => {
    let auctionId: BigNumber;
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.newAuction(
        owner.address,
        mockNFT.address,
        tokenId,
        auctionDuration,
        minimumBid
      );

      auctionId = (await marketplace.auctionsLength()).sub(1);
      const startTime = (await marketplace.auctions(auctionId)).startTime;
      const blockNumber = await ethers.provider.getBlockNumber();
      await evm_increaseTime(
        startTime.toNumber() -
          (
            await ethers.provider.getBlock(blockNumber)
          ).timestamp +
          1
      );
      await marketplace.bid(auctionId, { value: bidAmount.mul(2) });
    });
    it('should revert claiming nft from not highest bidder', async () => {
      await expect(
        marketplace.connect(alice).claimNFT(auctionId)
      ).to.be.revertedWith('Unauthorized');
    });
    it('should revert claiming nft when active', async () => {
      await expect(marketplace.claimNFT(auctionId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
    it('highest bidder should be able to claim nft', async () => {
      await evm_increaseTime(auctionDuration.toNumber());
      const beforeBal = await mockNFT.balanceOf(owner.address, tokenId);
      await expect(marketplace.claimNFT(auctionId)).to.be.emit(
        marketplace,
        'NFTClaimed'
      );
      const afterBal = await mockNFT.balanceOf(owner.address, tokenId);
      expect(afterBal).to.be.equal(beforeBal.add(1));
    });
  });
  describe('Withdraw ETH', () => {
    let auctionId: BigNumber;
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.newAuction(
        owner.address,
        mockNFT.address,
        tokenId,
        auctionDuration,
        minimumBid
      );

      auctionId = (await marketplace.auctionsLength()).sub(1);
      const startTime = (await marketplace.auctions(auctionId)).startTime;
      const blockNumber = await ethers.provider.getBlockNumber();
      await evm_increaseTime(
        startTime.toNumber() -
          (
            await ethers.provider.getBlock(blockNumber)
          ).timestamp +
          1
      );
      await marketplace.bid(auctionId, { value: bidAmount.mul(2) });
    });
    it("highest bidder can't withdraw his bid", async () => {
      const auctionInfo = await marketplace.auctions(auctionId);
      expect(auctionInfo.highestBidOwner).to.be.equal(owner.address);
      await expect(marketplace.withdrawBid(auctionId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
    it('should revert withdrawing bid from non bidder', async () => {
      await expect(
        marketplace.connect(alice).withdrawBid(auctionId)
      ).to.be.revertedWith('Unauthorized');
    });
    it('losers should be able to withdraw bids', async () => {
      await marketplace
        .connect(alice)
        .bid(auctionId, { value: bidAmount.mul(10) });
      const auctionInfo = await marketplace.auctions(auctionId);
      expect(auctionInfo.highestBidOwner).to.be.equal(alice.address);
      const beforeBal = await owner.getBalance();
      await expect(marketplace.withdrawBid(auctionId)).to.be.emit(
        marketplace,
        'BidWithdrawn'
      );
      const afterBal = await owner.getBalance();
      expect(afterBal).to.be.closeTo(
        beforeBal.add(bidAmount.mul(2)),
        parseEther('0.0001')
      );
    });
  });
  describe('Withdraw ETH', () => {
    let auctionId: BigNumber;
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.newAuction(
        owner.address,
        mockNFT.address,
        tokenId,
        auctionDuration,
        minimumBid
      );

      auctionId = (await marketplace.auctionsLength()).sub(1);
      const startTime = (await marketplace.auctions(auctionId)).startTime;
      const blockNumber = await ethers.provider.getBlockNumber();
      await evm_increaseTime(
        startTime.toNumber() -
          (
            await ethers.provider.getBlock(blockNumber)
          ).timestamp +
          1
      );
    });
    it('should revert withdrawing eth from non auction owner', async () => {
      await expect(
        marketplace.connect(alice).withdrawETH(auctionId)
      ).to.be.revertedWith('Unauthorized');
    });
    it('should revert withdrawing eth for active auctions', async () => {
      await marketplace.bid(auctionId, { value: bidAmount.mul(2) });
      await expect(marketplace.withdrawETH(auctionId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
    it('should revert withdrawing eth when there is no bid', async () => {
      await expect(marketplace.withdrawETH(auctionId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
    it('auction should be able to withdraw eth', async () => {
      await marketplace
        .connect(alice)
        .bid(auctionId, { value: bidAmount.mul(2) });
      await evm_increaseTime(auctionDuration.toNumber());

      const tax = bidAmount.mul(2).mul(numerator).div(denominator);
      const beforeBal = await owner.getBalance();
      const treasuryBeforeBal = await treasury.getBalance();
      await expect(marketplace.withdrawETH(auctionId)).to.be.emit(
        marketplace,
        'ETHClaimed'
      );
      const afterBal = await owner.getBalance();
      const treasuryAfterBal = await treasury.getBalance();
      expect(afterBal).to.be.closeTo(
        beforeBal.add(bidAmount.mul(2)).sub(tax),
        parseEther('0.0001')
      );
      expect(treasuryAfterBal).to.be.equal(treasuryBeforeBal.add(tax));

      await expect(marketplace.withdrawETH(auctionId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
  });
  describe('Withdraw Unsold NFT', () => {
    let auctionId: BigNumber;
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.newAuction(
        owner.address,
        mockNFT.address,
        tokenId,
        auctionDuration,
        minimumBid
      );

      auctionId = (await marketplace.auctionsLength()).sub(1);
      const startTime = (await marketplace.auctions(auctionId)).startTime;
      const blockNumber = await ethers.provider.getBlockNumber();
      await evm_increaseTime(
        startTime.toNumber() -
          (
            await ethers.provider.getBlock(blockNumber)
          ).timestamp +
          1
      );
    });
    it('should revert withdrawing nft from non auction owner', async () => {
      await expect(
        marketplace.connect(alice).withdrawUnsoldNFT(auctionId)
      ).to.be.revertedWith('Unauthorized');
    });
    it('should revert withdrawing unsold nft for active auction', async () => {
      await expect(marketplace.withdrawUnsoldNFT(auctionId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
    it('should revert withdrawing unsold nft when there is a bidder', async () => {
      await marketplace
        .connect(alice)
        .bid(auctionId, { value: bidAmount.mul(2) });
      await evm_increaseTime(auctionDuration.toNumber());
      await expect(marketplace.withdrawUnsoldNFT(auctionId)).to.be.revertedWith(
        'Unauthorized'
      );
    });
    it('auction owner should be able to withdraw unsold nft', async () => {
      await evm_increaseTime(auctionDuration.toNumber());
      const beforeBal = await mockNFT.balanceOf(owner.address, tokenId);
      await expect(marketplace.withdrawUnsoldNFT(auctionId)).to.be.emit(
        marketplace,
        'AuctionFailed'
      );

      const afterBal = await mockNFT.balanceOf(owner.address, tokenId);
      expect(afterBal).to.be.equal(beforeBal.add(1));
    });
  });
  describe('List Sale', () => {
    const listingPrice = BigNumber.from(100);
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);
    });
    it('should be revert when nft address is zero', async () => {
      await expect(
        marketplace.listSale(
          owner.address,
          constants.AddressZero,
          tokenId,
          listingPrice
        )
      ).to.be.revertedWith('ZeroAddress');
    });
    it('should revert when listing price is zero', async () => {
      await expect(
        marketplace.listSale(owner.address, mockNFT.address, tokenId, 0)
      ).to.be.revertedWith('InvalidAmount');
    });
    it('should be able to list sale', async () => {
      const beforeBal = await mockNFT.balanceOf(owner.address, tokenId);
      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.listSale(
        owner.address,
        mockNFT.address,
        tokenId,
        listingPrice
      );

      const afterBal = await mockNFT.balanceOf(owner.address, tokenId);
      expect(afterBal).to.be.equal(beforeBal.sub(1));

      const sales = await marketplace.getActiveSales(owner.address);
      expect(sales.length).to.be.equal(1);
      const saleInfo = await marketplace.sales(sales[0]);
      expect(saleInfo.owner).to.be.equal(owner.address);
      expect(saleInfo.nftAddress).to.be.equal(mockNFT.address);
      expect(saleInfo.nftIndex).to.be.equal(tokenId);
      expect(saleInfo.price).to.be.equal(listingPrice);
      expect(saleInfo.buyer).to.be.equal(constants.AddressZero);

      const prefix = await marketplace.SALE_PREFIX();
      const escrowId = Interface.getAbiCoder().encode(
        ['bytes32', 'address', 'uint256', 'uint256'],
        [prefix, mockNFT.address, tokenId, sales[0]]
      );
      const escrow = await marketplace.escrows(escrowId);
      expect(await mockNFT.balanceOf(escrow, tokenId)).to.be.equal(1);
    });
  });
  describe('Update Sale', () => {
    const listingPrice = BigNumber.from(100);
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.listSale(
        owner.address,
        mockNFT.address,
        tokenId,
        listingPrice
      );
    });
    it('should revert updating sale for invalid saleId', async () => {
      await expect(marketplace.updateSale(2, listingPrice)).to.be.revertedWith(
        'InvalidSale'
      );
    });
    it('should revert updating sale to zero price', async () => {
      await expect(marketplace.updateSale(0, 0)).to.be.revertedWith(
        'InvalidAmount'
      );
    });
    it('should revert updating price for already bought one', async () => {
      await marketplace.connect(alice).buy(0, { value: listingPrice });
      await expect(
        marketplace.updateSale(0, listingPrice.mul(2))
      ).to.be.revertedWith('Unauthorized');
    });
    it('should revert updating price from non owner', async () => {
      await expect(
        marketplace.connect(alice).updateSale(0, listingPrice)
      ).to.be.revertedWith('Unauthorized');
    });
    it('owner should be able to update price', async () => {
      await expect(marketplace.updateSale(0, listingPrice.mul(2))).to.be.emit(
        marketplace,
        'SaleUpdated'
      );
    });
  });
  describe('Cancel Sale', () => {
    const listingPrice = BigNumber.from(100);
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.listSale(
        owner.address,
        mockNFT.address,
        tokenId,
        listingPrice
      );
    });
    it('should revert canceling sale for invalid saleId', async () => {
      await expect(marketplace.cancelSale(2, owner.address)).to.be.revertedWith(
        'InvalidSale'
      );
    });
    it('should revert canceling sale to zero address', async () => {
      await expect(
        marketplace.cancelSale(0, constants.AddressZero)
      ).to.be.revertedWith('ZeroAddress');
    });
    it('should revert canceling price for already bought one', async () => {
      await marketplace.connect(alice).buy(0, { value: listingPrice });
      await expect(marketplace.cancelSale(0, owner.address)).to.be.revertedWith(
        'Unauthorized'
      );
    });
    it('should revert canceling price from non owner', async () => {
      await expect(
        marketplace.connect(alice).cancelSale(0, owner.address)
      ).to.be.revertedWith('Unauthorized');
    });
    it('owner should be able to cancel sale', async () => {
      const beforeBal = await mockNFT.balanceOf(owner.address, tokenId);
      await expect(marketplace.cancelSale(0, owner.address)).to.be.emit(
        marketplace,
        'SaleCanceled'
      );

      const afterBal = await mockNFT.balanceOf(owner.address, tokenId);
      expect(afterBal).to.be.equal(beforeBal.add(1));
    });
  });
  describe('Buy Sale', () => {
    const listingPrice = BigNumber.from(100);
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC1155Marketplace');
      marketplace = <ERC1155Marketplace>(
        await upgrades.deployProxy(factory, [
          bidTimeIncrement,
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          { numerator, denominator },
          treasury.address,
          owner.address,
        ])
      );
      await marketplace.grantRole(WHITELISTED_ROLE, owner.address);

      await mockNFT.mint(owner.address, tokenId, 1);

      await mockNFT.setApprovalForAll(marketplace.address, true);
      await marketplace.listSale(
        owner.address,
        mockNFT.address,
        tokenId,
        listingPrice
      );
    });
    it('should revert buying sale for invalid saleId', async () => {
      await expect(
        marketplace.buy(2, { value: listingPrice })
      ).to.be.revertedWith('InvalidSale');
    });
    it('should revert buying sale to insufficient value', async () => {
      await expect(
        marketplace.buy(0, { value: listingPrice.div(2) })
      ).to.be.revertedWith('InvalidAmount');
    });
    it('should revert buying sale for already bought one', async () => {
      await marketplace.connect(alice).buy(0, { value: listingPrice });
      await expect(
        marketplace.buy(0, { value: listingPrice })
      ).to.be.revertedWith('InvalidSale');
    });
    it('should be able to buy sale', async () => {
      const beforeOwnerBal = await owner.getBalance();
      const beforeTreasuryBal = await treasury.getBalance();

      const beforeAliceBal = await mockNFT.balanceOf(alice.address, tokenId);
      await expect(
        marketplace.connect(alice).buy(0, { value: listingPrice })
      ).to.be.emit(marketplace, 'BoughtSale');

      const afterAliceBal = await mockNFT.balanceOf(alice.address, tokenId);
      expect(afterAliceBal).to.be.equal(beforeAliceBal.add(1));

      const tax = listingPrice.mul(numerator).div(denominator);
      const afterOwnerBal = await owner.getBalance();
      const afterTreasuryBal = await treasury.getBalance();
      expect(afterOwnerBal.sub(beforeOwnerBal)).to.be.equal(
        listingPrice.sub(tax)
      );
      expect(afterTreasuryBal).to.be.equal(beforeTreasuryBal.add(tax));
    });
  });
});
