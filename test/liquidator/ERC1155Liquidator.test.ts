import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, expect, upgrades } from 'hardhat';
import {
  ERC1155Liquidator,
  ERC1155TriremeAuction,
  GuardiansPharaohValueProvider,
  ERC1155Vault,
  TriUSDStabilityPool,
  TriremeUSD,
  MockERC1155,
} from '../../types';
import { BigNumber, constants } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

describe('ERC1155 Liquidator', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let liquidator: ERC1155Liquidator;
  let pool: TriUSDStabilityPool;
  let stablecoin: TriremeUSD;
  let provider: GuardiansPharaohValueProvider;
  let vault: ERC1155Vault;
  let mockNFT: MockERC1155;
  let auction: ERC1155TriremeAuction;

  const tokenId = 0;
  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);
  const borrowAmountCap = parseEther('10000');
  const minBorrowAmount = parseEther('1');
  const auctionDuration = BigNumber.from(10);
  const bidTimeIncrement = BigNumber.from(10);
  const chainlinkAzukiAggregator = '0xA8B9A447C73191744D5B79BcE864F343455E1150';

  const addressProviderAddr = '0x88676F89727475339f15d97A29a68E405FEd723a';
  const LIQUIDATOR_ROLE =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';
  const WHITELISTED_ROLE =
    '0x8429d542926e6695b59ac6fbdcd9b37e8b1aeb757afab06ab60b1bb5878c3b49';

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    const stablecoinFactory = await ethers.getContractFactory('TriremeUSD');
    stablecoin = <TriremeUSD>await stablecoinFactory.deploy();

    const mockTokenFactory = await ethers.getContractFactory('MockERC1155');
    mockNFT = <MockERC1155>await mockTokenFactory.deploy('Mock');

    const poolFactory = await ethers.getContractFactory('TriUSDStabilityPool');
    pool = <TriUSDStabilityPool>(
      await upgrades.deployProxy(poolFactory, [
        stablecoin.address,
        { numerator: BigNumber.from(900), denominator },
      ])
    );

    const providerFactory = await ethers.getContractFactory(
      'GuardiansPharaohValueProvider'
    );
    provider = <GuardiansPharaohValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        addressProviderAddr,
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

    const factory = await ethers.getContractFactory('ERC1155Vault');
    vault = <ERC1155Vault>await upgrades.deployProxy(factory, [
      stablecoin.address,
      mockNFT.address,
      tokenId,
      provider.address,
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
      const factory = await ethers.getContractFactory('ERC1155Liquidator');
      const liquidator = <ERC1155Liquidator>(
        await upgrades.deployProxy(factory, [alice.address])
      );

      expect(await liquidator.auction()).to.be.equal(alice.address);
    });
  });

  describe('Add Vault', () => {
    beforeEach(async () => {
      const auctionFactory = await ethers.getContractFactory(
        'ERC1155TriremeAuction'
      );
      auction = <ERC1155TriremeAuction>(
        await upgrades.deployProxy(auctionFactory, [
          auctionDuration,
          bidTimeIncrement,
          { numerator, denominator },
        ])
      );

      const factory = await ethers.getContractFactory('ERC1155Liquidator');
      liquidator = <ERC1155Liquidator>(
        await upgrades.deployProxy(factory, [auction.address])
      );
    });

    it('should revert adding vault from non owner', async () => {
      await expect(
        liquidator.connect(alice).addNFTVault(vault.address, pool.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert adding zero vault or zero nft', async () => {
      await expect(
        liquidator.addNFTVault(constants.AddressZero, pool.address)
      ).to.be.revertedWith('ZeroAddress');
    });
    it('owner should be able to add vault', async () => {
      await liquidator.addNFTVault(vault.address, pool.address);
      const vaultInfo = await liquidator.vaultInfo(vault.address);
      expect(vaultInfo.stablecoin).to.be.equal(stablecoin.address);
      expect(vaultInfo.stabilityPool).to.be.equal(pool.address);
    });
  });

  describe('Remove Vault', () => {
    beforeEach(async () => {
      const auctionFactory = await ethers.getContractFactory(
        'ERC1155TriremeAuction'
      );
      auction = <ERC1155TriremeAuction>(
        await upgrades.deployProxy(auctionFactory, [
          auctionDuration,
          bidTimeIncrement,
          { numerator, denominator },
        ])
      );

      const factory = await ethers.getContractFactory('ERC1155Liquidator');
      liquidator = <ERC1155Liquidator>(
        await upgrades.deployProxy(factory, [auction.address])
      );
      await liquidator.addNFTVault(vault.address, pool.address);
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
    const collAmount = parseEther('700');
    const borrowAmount = parseEther('90');

    beforeEach(async () => {
      await provider.overrideFloor(collAmount);

      const auctionFactory = await ethers.getContractFactory(
        'ERC1155TriremeAuction'
      );
      auction = <ERC1155TriremeAuction>(
        await upgrades.deployProxy(auctionFactory, [
          auctionDuration,
          bidTimeIncrement,
          { numerator, denominator },
        ])
      );

      const factory = await ethers.getContractFactory('ERC1155Liquidator');
      liquidator = <ERC1155Liquidator>(
        await upgrades.deployProxy(factory, [auction.address])
      );
      await auction.grantRole(WHITELISTED_ROLE, liquidator.address);

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);
      await liquidator.addNFTVault(vault.address, pool.address);

      await mockNFT.mint(owner.address, tokenId, 1);
      await mockNFT.setApprovalForAll(vault.address, true);
      await vault.addCollateral(1);
      await vault.borrow(borrowAmount);

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
    it('should be able to liquidate positions under water floor and list on auction', async () => {
      await stablecoin.approve(pool.address, constants.MaxUint256);
      await pool.deposit(
        await stablecoin.balanceOf(owner.address),
        owner.address
      );
      await mockNFT.mint(alice.address, tokenId, 3);
      await mockNFT.connect(alice).setApprovalForAll(vault.address, true);
      await vault.connect(alice).addCollateral(3);
      await vault.connect(alice).borrow(borrowAmount);
      await stablecoin
        .connect(alice)
        .approve(pool.address, constants.MaxUint256);
      await pool
        .connect(alice)
        .deposit(await stablecoin.balanceOf(alice.address), alice.address);

      const price = await provider.getFloorUSD();
      await provider.overrideFloor(price.div(8));
      expect(await vault.isLiquidatable(owner.address)).to.be.true;

      const position = await vault.positions(owner.address);
      await expect(
        liquidator.liquidate([owner.address], vault.address)
      ).to.be.emit(vault, 'Liquidated');

      expect(await mockNFT.balanceOf(auction.address, tokenId)).to.be.equal(
        position.collateral
      );
      expect((await vault.positions(owner.address)).debtPortion).to.be.equal(0);
      expect(await pool.totalDebt()).to.be.gt(position.debtPortion);
      expect(
        await liquidator.debtFromStabilityPool(vault.address, tokenId)
      ).to.be.equal(await pool.totalDebt());

      await provider.disableFloorOverride();
    });
    it('should be able to repay debt', async () => {
      await stablecoin.approve(pool.address, constants.MaxUint256);
      await pool.deposit(
        await stablecoin.balanceOf(owner.address),
        owner.address
      );
      await mockNFT.mint(alice.address, tokenId, 3);
      await mockNFT.connect(alice).setApprovalForAll(vault.address, true);
      await vault.connect(alice).borrow(borrowAmount.mul(3));

      const price = await provider.getFloorUSD();
      await provider.overrideFloor(price.div(8));
      expect(await vault.isLiquidatable(owner.address)).to.be.true;
      await liquidator.liquidate([owner.address], vault.address);

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
});
