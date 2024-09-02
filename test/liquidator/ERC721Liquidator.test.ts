import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, expect, upgrades } from 'hardhat';
import {
  ERC721Liquidator,
  ERC721TriremeAuction,
  ERC721ValueProvider,
  ERC721Vault,
  MockERC721,
  TriUSDStabilityPool,
  TriremeUSD,
} from '../../types';
import { BigNumber, constants } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { evm_increaseTime } from '../helper';

describe('ERC721 Liquidator', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let liquidator: ERC721Liquidator;
  let pool: TriUSDStabilityPool;
  let stablecoin: TriremeUSD;
  let provider: ERC721ValueProvider;
  let vault: ERC721Vault;
  let mockNFT: MockERC721;
  let auction: ERC721TriremeAuction;

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);
  const borrowAmountCap = parseEther('10000');
  const minBorrowAmount = parseEther('1');
  const auctionDuration = BigNumber.from(10);
  const bidTimeIncrement = BigNumber.from(10);
  const chainlinkAzukiAggregator = '0xA8B9A447C73191744D5B79BcE864F343455E1150';
  const chainlinkUSDTAggregator = '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D';

  const LIQUIDATOR_ROLE =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';
  const WHITELISTED_ROLE =
    '0x8429d542926e6695b59ac6fbdcd9b37e8b1aeb757afab06ab60b1bb5878c3b49';

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    const stablecoinFactory = await ethers.getContractFactory('TriremeUSD');
    stablecoin = <TriremeUSD>await stablecoinFactory.deploy();

    const mockTokenFactory = await ethers.getContractFactory('MockERC721');
    mockNFT = <MockERC721>await mockTokenFactory.deploy('Mock', 'Mock', '');

    const poolFactory = await ethers.getContractFactory('TriUSDStabilityPool');
    pool = <TriUSDStabilityPool>(
      await upgrades.deployProxy(poolFactory, [
        stablecoin.address,
        { numerator: BigNumber.from(900), denominator },
      ])
    );

    const providerFactory = await ethers.getContractFactory(
      'ERC721ValueProvider'
    );
    provider = <ERC721ValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkAzukiAggregator,
        {
          numerator: BigNumber.from(700),
          denominator,
        },
        {
          numerator: BigNumber.from(900),
          denominator,
        },
      ]
    );

    const factory = await ethers.getContractFactory('ERC721Vault');
    vault = <ERC721Vault>await upgrades.deployProxy(factory, [
      stablecoin.address,
      mockNFT.address,
      provider.address,
      chainlinkUSDTAggregator,
      {
        debtInterestApr: {
          numerator,
          denominator,
        },
        organizationFeeRate: {
          numerator,
          denominator,
        },
        insurancePurchaseRate: {
          numerator,
          denominator,
        },
        insuranceLiquidationPenaltyRate: {
          numerator,
          denominator,
        },
        insuranceRepurchaseTimeLimit: 100,
        borrowAmountCap,
        minBorrowAmount,
      },
    ]);
  });

  describe('Initialization', () => {
    it('should revert initialization with invalid auction addr', async () => {
      const factory = await ethers.getContractFactory('ERC721Liquidator');
      await expect(
        upgrades.deployProxy(factory, [constants.AddressZero])
      ).to.be.revertedWith('ZeroAddress');
    });
    it('should be able to initialize erc721 liquidator', async () => {
      const factory = await ethers.getContractFactory('ERC721Liquidator');
      const liquidator = <ERC721Liquidator>(
        await upgrades.deployProxy(factory, [alice.address])
      );

      expect(await liquidator.auction()).to.be.equal(alice.address);
    });
  });

  describe('Add Vault', () => {
    beforeEach(async () => {
      const auctionFactory = await ethers.getContractFactory(
        'ERC721TriremeAuction'
      );
      const auction = await upgrades.deployProxy(auctionFactory, [
        auctionDuration,
        bidTimeIncrement,
        { numerator, denominator },
      ]);

      const factory = await ethers.getContractFactory('ERC721Liquidator');
      liquidator = <ERC721Liquidator>(
        await upgrades.deployProxy(factory, [auction.address])
      );
    });

    it('should revert adding vault from non owner', async () => {
      await expect(
        liquidator
          .connect(alice)
          .addNFTVault(vault.address, pool.address, mockNFT.address, false)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert adding zero vault or zero nft', async () => {
      await expect(
        liquidator.addNFTVault(
          constants.AddressZero,
          pool.address,
          mockNFT.address,
          false
        )
      ).to.be.revertedWith('ZeroAddress');
      await expect(
        liquidator.addNFTVault(
          vault.address,
          pool.address,
          constants.AddressZero,
          false
        )
      ).to.be.revertedWith('ZeroAddress');
    });
    it('owner should be able to add vault', async () => {
      await liquidator.addNFTVault(
        vault.address,
        pool.address,
        mockNFT.address,
        false
      );
      const vaultInfo = await liquidator.vaultInfo(vault.address);
      expect(vaultInfo.stablecoin).to.be.equal(stablecoin.address);
      expect(vaultInfo.stabilityPool).to.be.equal(pool.address);
      expect(vaultInfo.nftOrWrapper).to.be.equal(mockNFT.address);
    });
  });

  describe('Remove Vault', () => {
    beforeEach(async () => {
      const auctionFactory = await ethers.getContractFactory(
        'ERC721TriremeAuction'
      );
      const auction = await upgrades.deployProxy(auctionFactory, [
        auctionDuration,
        bidTimeIncrement,
        { numerator, denominator },
      ]);

      const factory = await ethers.getContractFactory('ERC721Liquidator');
      liquidator = <ERC721Liquidator>(
        await upgrades.deployProxy(factory, [auction.address])
      );
      await liquidator.addNFTVault(
        vault.address,
        pool.address,
        mockNFT.address,
        false
      );
    });
    it('should revert removing vault from non owner', async () => {
      await expect(
        liquidator.connect(alice).removeNFTVault(vault.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('owner should be able to remove vault', async () => {
      let vaultInfo = await liquidator.vaultInfo(vault.address);
      expect(vaultInfo.stablecoin).to.be.equal(stablecoin.address);

      await liquidator.removeNFTVault(vault.address);

      vaultInfo = await liquidator.vaultInfo(vault.address);
      expect(vaultInfo.stablecoin).to.be.equal(constants.AddressZero);
    });
  });
  describe('Liquidate', () => {
    let tokenId: BigNumber;
    const collAmount = parseEther('700');
    const borrowAmount = parseEther('90');

    beforeEach(async () => {
      await provider.overrideFloor(collAmount);

      const auctionFactory = await ethers.getContractFactory(
        'ERC721TriremeAuction'
      );
      auction = <ERC721TriremeAuction>(
        await upgrades.deployProxy(auctionFactory, [
          auctionDuration,
          bidTimeIncrement,
          { numerator, denominator },
        ])
      );

      const factory = await ethers.getContractFactory('ERC721Liquidator');
      liquidator = <ERC721Liquidator>(
        await upgrades.deployProxy(factory, [auction.address])
      );
      await auction.grantRole(WHITELISTED_ROLE, liquidator.address);

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);
      await liquidator.addNFTVault(
        vault.address,
        pool.address,
        mockNFT.address,
        false
      );

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, false);

      await vault.grantRole(LIQUIDATOR_ROLE, liquidator.address);
      await pool.grantRole(LIQUIDATOR_ROLE, liquidator.address);
    });

    it('should revert when given vault address is not set', async () => {
      await expect(liquidator.liquidate([], owner.address)).to.be.revertedWith(
        'UnknownVault'
      );
    });
    it('should revert when length of liquidatee`s array is zero', async () => {
      await expect(liquidator.liquidate([], vault.address)).to.be.revertedWith(
        'InvalidLength'
      );
    });
    it('should be able to liquidate positions under water floor and list on auction for non-insured positions', async () => {
      await stablecoin.approve(pool.address, constants.MaxUint256);
      await pool.deposit(
        await stablecoin.balanceOf(owner.address),
        owner.address
      );

      const price = await provider.getFloorETH();
      await provider.overrideFloor(price.div(8));
      expect(await vault.isLiquidatable(tokenId)).to.be.true;

      const position = await vault.positions(tokenId);
      await expect(liquidator.liquidate([tokenId], vault.address)).to.be.emit(
        vault,
        'Liquidated'
      );

      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(auction.address);
      expect((await vault.positions(tokenId)).debtPortion).to.be.equal(0);
      expect(await pool.totalDebt()).to.be.gt(position.debtPortion);
      expect(
        await liquidator.debtFromStabilityPool(vault.address, tokenId)
      ).to.be.equal(await pool.totalDebt());

      await provider.disableFloorOverride();
    });
    it('should be able to liquidate positions water floor for insured positions', async () => {
      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, true);

      const price = await provider.getFloorETH();
      await provider.overrideFloor(price.div(8));

      expect(await vault.isLiquidatable(tokenId)).to.be.true;

      const position = await vault.positions(tokenId);
      await expect(liquidator.liquidate([tokenId], vault.address)).to.be.emit(
        vault,
        'Liquidated'
      );
      const afterPosition = await vault.positions(tokenId);

      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(vault.address);
      expect(afterPosition.debtPortion).to.be.equal(0);
      expect(await pool.totalDebt()).to.be.gt(position.debtPortion);
      expect(
        await liquidator.debtFromStabilityPool(vault.address, tokenId)
      ).to.be.lt(await pool.totalDebt());

      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.repurchase(
        tokenId,
        afterPosition.debtAmountForRepurchase.div(2)
      );

      await provider.disableFloorOverride();
    });
    it('should be able to repay debt', async () => {
      await stablecoin.approve(pool.address, constants.MaxUint256);
      await pool.deposit(
        await stablecoin.balanceOf(owner.address),
        owner.address
      );
      await mockNFT.mint(alice.address, 1);
      const aliceTokenId = await mockNFT.tokenId();
      await mockNFT.connect(alice).approve(vault.address, aliceTokenId);
      await vault
        .connect(alice)
        .borrow(aliceTokenId, borrowAmount.mul(2), false);

      const price = await provider.getFloorETH();
      await provider.overrideFloor(price.div(8));
      expect(await vault.isLiquidatable(tokenId)).to.be.true;
      await liquidator.liquidate([tokenId], vault.address);

      const debt = await liquidator.debtFromStabilityPool(
        vault.address,
        tokenId
      );

      const beforePoolDebt = await pool.totalDebt();
      await stablecoin.connect(alice).transfer(liquidator.address, debt);
      await liquidator.repayFromLiquidation(vault.address, tokenId, debt);

      expect(
        await liquidator.debtFromStabilityPool(vault.address, tokenId)
      ).to.be.equal(0);
      expect(await pool.totalDebt()).to.be.equal(beforePoolDebt.sub(debt));
      expect(await liquidator.totalDebtFromStabilityPool()).to.be.equal(0);
    });
  });
  describe('Claim Expired InsuranceNFT', () => {
    let tokenId: BigNumber;
    const collAmount = parseEther('700');
    const borrowAmount = parseEther('90');

    beforeEach(async () => {
      await provider.overrideFloor(collAmount);

      const auctionFactory = await ethers.getContractFactory(
        'ERC721TriremeAuction'
      );
      auction = <ERC721TriremeAuction>(
        await upgrades.deployProxy(auctionFactory, [
          auctionDuration,
          bidTimeIncrement,
          { numerator, denominator },
        ])
      );

      const factory = await ethers.getContractFactory('ERC721Liquidator');
      liquidator = <ERC721Liquidator>(
        await upgrades.deployProxy(factory, [auction.address])
      );
      await auction.grantRole(WHITELISTED_ROLE, liquidator.address);

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);
      await liquidator.addNFTVault(
        vault.address,
        pool.address,
        mockNFT.address,
        false
      );

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, true);

      await vault.grantRole(LIQUIDATOR_ROLE, liquidator.address);
      await pool.grantRole(LIQUIDATOR_ROLE, liquidator.address);

      await stablecoin.approve(pool.address, constants.MaxUint256);
      await pool.deposit(
        await stablecoin.balanceOf(owner.address),
        owner.address
      );
    });
    it('should revert when given vault address is not set', async () => {
      await expect(
        liquidator.claimExpiredInsuranceNFT([], owner.address)
      ).to.be.revertedWith('UnknownVault');
    });
    it('should revert when length of liquidatee`s array is zero', async () => {
      await expect(
        liquidator.claimExpiredInsuranceNFT([], vault.address)
      ).to.be.revertedWith('InvalidLength');
    });
    it('should be able to claim expired insured nft from the vault and list on auction', async () => {
      const price = await provider.getFloorETH();
      await provider.overrideFloor(price.div(8));

      expect(await vault.isLiquidatable(tokenId)).to.be.true;
      await liquidator.liquidate([tokenId], vault.address);

      await evm_increaseTime(101);
      await liquidator.claimExpiredInsuranceNFT([tokenId], vault.address);

      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(auction.address);
    });
  });
});
