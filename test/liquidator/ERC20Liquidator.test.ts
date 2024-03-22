import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {
  ERC20Liquidator,
  ERC20Vault,
  MockERC20ValueProvider,
  MockToken,
  TriUSDStabilityPool,
  TriremeUSD,
} from '../../types';
import { ethers, expect, upgrades } from 'hardhat';
import { BigNumber, constants } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

describe('ERC20 Liquidator', async () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let liquidator: ERC20Liquidator;
  let pool: TriUSDStabilityPool;
  let stablecoin: TriremeUSD;
  let collToken: MockToken;
  let provider: MockERC20ValueProvider;
  let vault: ERC20Vault;

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);
  const borrowAmountCap = parseEther('10000');
  const minBorrowAmount = parseEther('1');

  const chainlinkUSDTAggregator = '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D';

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    const stablecoinFactory = await ethers.getContractFactory('TriremeUSD');
    stablecoin = <TriremeUSD>await stablecoinFactory.deploy();

    const mockTokenFactory = await ethers.getContractFactory('MockToken');
    collToken = <MockToken>await mockTokenFactory.deploy('Mock', 'Mock');

    const poolFactory = await ethers.getContractFactory('TriUSDStabilityPool');
    pool = <TriUSDStabilityPool>(
      await upgrades.deployProxy(poolFactory, [
        stablecoin.address,
        { numerator: BigNumber.from(900), denominator },
      ])
    );

    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProvider'
    );
    provider = <MockERC20ValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkUSDTAggregator,
        collToken.address,
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

    const vaultFactory = await ethers.getContractFactory('ERC20Vault');
    vault = <ERC20Vault>await upgrades.deployProxy(vaultFactory, [
      stablecoin.address,
      collToken.address,
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
        borrowAmountCap,
        minBorrowAmount,
      },
    ]);
  });

  describe('Add Vault', () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20Liquidator');
      liquidator = <ERC20Liquidator>await upgrades.deployProxy(factory);
    });

    it('should revert adding vault from non owner', async () => {
      await expect(
        liquidator.connect(alice).addVault(vault.address, pool.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should revert adding zero vault', async () => {
      await expect(
        liquidator.addVault(constants.AddressZero, pool.address)
      ).to.be.revertedWith('ZeroAddress');
    });
    it('owner should be able to add vault', async () => {
      await liquidator.addVault(vault.address, pool.address);
      const vaultInfo = await liquidator.vaultInfo(vault.address);
      expect(vaultInfo.stablecoin).to.be.equal(stablecoin.address);
      expect(vaultInfo.stabilityPool).to.be.equal(pool.address);
      expect(vaultInfo.tokenContract).to.be.equal(collToken.address);
    });
  });
  describe('Remove Vault', () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20Liquidator');
      liquidator = <ERC20Liquidator>await upgrades.deployProxy(factory);
      await liquidator.addVault(vault.address, pool.address);
    });
    it('should revert removing vault from non owner', async () => {
      await expect(
        liquidator.connect(alice).removeVault(vault.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('owner should be able to remove vault', async () => {
      let vaultInfo = await liquidator.vaultInfo(vault.address);
      expect(vaultInfo.stablecoin).to.be.equal(stablecoin.address);

      await liquidator.removeVault(vault.address);

      vaultInfo = await liquidator.vaultInfo(vault.address);
      expect(vaultInfo.stablecoin).to.be.equal(constants.AddressZero);
    });
  });
  describe('Liquidate', () => {
    const collAmount = parseEther('700');
    const borrowAmount = parseEther('90');
    const LIQUIDATOR_ROLE =
      '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20Liquidator');
      liquidator = <ERC20Liquidator>await upgrades.deployProxy(factory);
      await liquidator.addVault(vault.address, pool.address);

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await collToken.mint(owner.address, collAmount);
      await collToken.approve(vault.address, collAmount);

      await vault.addCollateral(collAmount);
      await vault.borrow(borrowAmount);
      await vault.grantRole(LIQUIDATOR_ROLE, liquidator.address);
      await pool.grantRole(LIQUIDATOR_ROLE, liquidator.address);

      // Mint stablecoins for alice and transfer to owner to prepare liquidations
      await collToken.mint(alice.address, collAmount.mul(2));
      await collToken.connect(alice).approve(vault.address, collAmount.mul(2));
      await vault.connect(alice).addCollateral(collAmount.mul(2));
      await vault.connect(alice).borrow(borrowAmount.mul(2));
      await stablecoin
        .connect(alice)
        .approve(pool.address, constants.MaxUint256);

      await pool
        .connect(alice)
        .deposit(await stablecoin.balanceOf(alice.address), alice.address);
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
    it('should be able to liquidate positions under waterfall', async () => {
      const price = await provider['getPriceUSD()']();
      await provider.setPriceUSD(price.div(8));

      expect(await vault.isLiquidatable(owner.address)).to.be.true;

      const position = await vault.positions(owner.address);
      await expect(
        liquidator.liquidate([owner.address], vault.address)
      ).to.be.emit(vault, 'Liquidated');

      expect(await collToken.balanceOf(liquidator.address)).to.be.equal(
        position.collateral
      );
      expect((await vault.positions(owner.address)).collateral).to.be.equal(0);
      expect(await pool.totalDebt()).to.be.gt(position.debtPortion);
      expect(
        await liquidator.debtFromStabilityPool(vault.address, owner.address)
      ).to.be.equal(await pool.totalDebt());

      await provider.setPriceUSD(price);
    });
    it('should revert repaying for invalid vault', async () => {
      await expect(
        liquidator.repayFromLiquidation(constants.AddressZero, owner.address, 0)
      ).to.be.revertedWith('UnknownVault');
    });
    it('should revert repaying from non owner', async () => {
      await expect(
        liquidator
          .connect(alice)
          .repayFromLiquidation(vault.address, owner.address, 0)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('should be able to repay debt', async () => {
      const price = await provider['getPriceUSD()']();
      await provider.setPriceUSD(price.div(8));
      await liquidator.liquidate([owner.address], vault.address);
      await provider.setPriceUSD(price);

      const debt = await liquidator.debtFromStabilityPool(
        vault.address,
        owner.address
      );

      const beforePoolDebt = await pool.totalDebt();
      await stablecoin.transfer(liquidator.address, debt);
      await liquidator.repayFromLiquidation(vault.address, owner.address, debt);

      expect(
        await liquidator.debtFromStabilityPool(vault.address, owner.address)
      ).to.be.equal(0);
      expect(await pool.totalDebt()).to.be.equal(beforePoolDebt.sub(debt));
      expect(await liquidator.totalDebtFromStabilityPool()).to.be.equal(0);
    });
    it.skip('owner should be able to withdraw collateral tokens locked on the liquidator', async () => {});
  });
});
