import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, upgrades } from 'hardhat';
import {
  ERC20VaultETH,
  MockToken,
  TriremeETH,
  MockERC20ValueProviderETH,
} from '../../types';
import { expect } from 'chai';
import { BigNumber, constants } from 'ethers';
import { keccak256, parseEther } from 'ethers/lib/utils';
import { evm_increaseTime } from '../helper';

describe('ERC20 Vault ETH', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let provider: MockERC20ValueProviderETH;
  let vault: ERC20VaultETH;
  let mockToken: MockToken;
  let stablecoin: TriremeETH;

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);
  const borrowAmountCap = parseEther('1000');
  const minBorrowAmount = parseEther('0.1');

  const chainlinkETHAggregator = '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46';
  const LIQUIDATOR_ROLE =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';
  const SETTER_ROLE =
    '0x61c92169ef077349011ff0b1383c894d86c5f0b41d986366b58a6cf31e93beda';

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    const mockTokenFactory = await ethers.getContractFactory('MockToken');
    mockToken = <MockToken>await mockTokenFactory.deploy('Mock', 'Mock');

    const stablecoinFactory = await ethers.getContractFactory('TriremeETH');
    stablecoin = <TriremeETH>await stablecoinFactory.deploy();

    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProviderETH'
    );
    provider = <MockERC20ValueProviderETH>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkETHAggregator,
        mockToken.address,
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
  });

  describe('Initializing', () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      vault = <ERC20VaultETH>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockToken.address,
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
    it('should revert when debt interest apr is invalid', async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockToken.address,
          provider.address,
          {
            debtInterestApr: {
              numerator,
              denominator: 0,
            },
            organizationFeeRate: {
              numerator,
              denominator,
            },
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockToken.address,
          provider.address,
          {
            debtInterestApr: {
              numerator: numerator.add(denominator),
              denominator,
            },
            organizationFeeRate: {
              numerator,
              denominator,
            },
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
    });
    it('should revert when orgnization fee is invalid', async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockToken.address,
          provider.address,
          {
            debtInterestApr: {
              numerator,
              denominator,
            },
            organizationFeeRate: {
              numerator,
              denominator: 0,
            },
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockToken.address,
          provider.address,
          {
            debtInterestApr: {
              numerator,
              denominator,
            },
            organizationFeeRate: {
              numerator: numerator.add(denominator),
              denominator,
            },
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
    });
    it('should initialize settings', async () => {
      const settings = await vault.settings();
      expect(settings.borrowAmountCap).to.be.equal(borrowAmountCap);
      expect(settings.debtInterestApr.numerator).to.be.equal(numerator);
      expect(settings.debtInterestApr.denominator).to.be.equal(denominator);
      expect(settings.organizationFeeRate.numerator).to.be.equal(numerator);
      expect(settings.organizationFeeRate.denominator).to.be.equal(denominator);
    });
    it.skip('should grant dao role to deployer', async () => {
      const daoRole = keccak256('DAO_ROLE');
      expect(await vault.hasRole(daoRole, owner.address)).to.be.true;
    });
  });
  describe('Add collateral', () => {
    const collAmount = parseEther('1000');
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      vault = <ERC20VaultETH>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockToken.address,
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

      await mockToken.mint(owner.address, collAmount);
      await mockToken.approve(vault.address, collAmount);
    });
    it('should revert adding zero collateral', async () => {
      await expect(vault.addCollateral(0)).to.be.revertedWith('InvalidAmount');
    });
    it('should be able to add collateral on the vault', async () => {
      await expect(vault.addCollateral(collAmount)).to.be.emit(
        vault,
        'CollateralAdded'
      );

      const position = await vault.positions(owner.address);
      expect(position.collateral).to.be.equal(collAmount);
    });
    it('should update position`s collateral amount', async () => {
      await expect(vault.addCollateral(collAmount)).to.be.emit(
        vault,
        'CollateralAdded'
      );

      const position = await vault.positions(owner.address);
      expect(position.collateral).to.be.equal(collAmount);
    });
    it('should update user indexes when its new user', async () => {
      await vault.addCollateral(collAmount.div(2));
      await vault.addCollateral(collAmount.div(2));
      expect(await vault.totalUsersLength()).to.be.equal(1);

      const users = await vault.totalUsers();
      expect(users.includes(owner.address)).to.be.true;
    });
  });
  describe('Borrow TriETH', () => {
    const collAmount = parseEther('7000');
    const borrowAmount = parseEther('1');

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      vault = <ERC20VaultETH>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockToken.address,
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

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockToken.mint(owner.address, collAmount);
      await mockToken.approve(vault.address, collAmount);
      await vault.addCollateral(collAmount);
    });
    it('should revert when borrowing amount is zero', async () => {
      await expect(vault.borrow(0)).to.be.revertedWith('MinBorrowAmount');
    });
    it('should revert borrowing when reach maximum borrow cap', async () => {
      await expect(vault.borrow(borrowAmountCap.add(1))).to.be.revertedWith(
        'DebtCapReached'
      );
    });
    it('should revert when exceed credit limit', async () => {
      const creditLimit = await vault.getCreditLimit(owner.address);
      await expect(vault.borrow(creditLimit.add(1))).to.be.revertedWith(
        'InvalidAmount'
      );
    });
    it('should be able to borrow triremeUSD against his collateral on the vault', async () => {
      await vault.borrow(borrowAmount);
      expect(await stablecoin.balanceOf(owner.address)).to.be.closeTo(
        borrowAmount,
        borrowAmount.mul(numerator).div(denominator)
      );
    });
    it('should cut orgnization fee in triremeUSD when borrowing', async () => {
      const beforeBalance = await stablecoin.balanceOf(owner.address);
      await vault.borrow(borrowAmount);
      const fee = borrowAmount.mul(numerator).div(denominator);

      const afterBalance = await stablecoin.balanceOf(owner.address);

      expect(afterBalance.sub(beforeBalance)).to.be.equal(
        borrowAmount.sub(fee)
      );
      expect(await vault.totalFeeCollected()).to.be.equal(fee);
    });
  });
  describe('Repay', () => {
    const collAmount = parseEther('7000');
    const borrowAmount = parseEther('1');

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      vault = <ERC20VaultETH>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockToken.address,
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

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockToken.mint(owner.address, collAmount);
      await mockToken.approve(vault.address, collAmount);
      await vault.addCollateral(collAmount);
      await vault.borrow(borrowAmount);
    });
    it('should repay debt interest when repaying', async () => {
      await evm_increaseTime(10);
      const debt = await vault.calculateAdditionalInterest();
      const debtOfOwner = await vault.getDebtInterest(owner.address);
      expect(debt).to.be.equal(debtOfOwner);

      await mockToken.mint(alice.address, collAmount);
      await mockToken.connect(alice).approve(vault.address, collAmount);
      await vault.connect(alice).addCollateral(collAmount);
      await vault.connect(alice).borrow(borrowAmount);

      await stablecoin.connect(alice).transfer(owner.address, debt);
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.repay(constants.MaxUint256);

      const position = await vault.positions(owner.address);
      expect(position.debtPortion).to.be.equal(constants.Zero);
      expect(position.debtPrincipal).to.be.equal(constants.Zero);
    });
    it('should revert when repaying zero', async () => {
      await expect(vault.repay(0)).to.be.revertedWith('InvalidAmount');
    });
    it('should revert repaying debt when there is no debt', async () => {
      await mockToken.mint(alice.address, collAmount);
      await mockToken.connect(alice).approve(vault.address, collAmount);
      await vault.connect(alice).addCollateral(collAmount);

      await expect(
        vault.connect(alice).repay(constants.MaxUint256)
      ).to.be.revertedWith('NoDebt');
    });
  });
  describe('Withdraw Collateral', () => {
    const collAmount = parseEther('70000');
    const borrowAmount = parseEther('1');

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      vault = <ERC20VaultETH>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockToken.address,
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

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockToken.mint(owner.address, collAmount);
      await mockToken.approve(vault.address, collAmount);
      await vault.addCollateral(collAmount);
      await vault.borrow(borrowAmount);
    });
    it('should revert withdraw when debt exceed new credit limit', async () => {
      await evm_increaseTime(10);

      await expect(vault.removeCollateral(collAmount)).to.be.revertedWith(
        'InsufficientCollateral'
      );
    });
    it('should be able to withdraw collaterals within healthy position', async () => {
      const beforeCollBal = await mockToken.balanceOf(owner.address);
      await vault.removeCollateral(collAmount.div(2));
      const afterCollBal = await mockToken.balanceOf(owner.address);
      expect(afterCollBal).to.be.equal(beforeCollBal.add(collAmount.div(2)));

      const position = await vault.positions(owner.address);
      expect(position.collateral).to.be.equal(collAmount.div(2));
    });
    it('should remove user indexes when withdrawing all', async () => {
      await mockToken.mint(alice.address, collAmount);
      await mockToken.connect(alice).approve(vault.address, collAmount);
      await vault.connect(alice).addCollateral(collAmount);

      const beforeUsers = await vault.totalUsers();
      expect(beforeUsers.includes(alice.address)).to.be.true;

      await vault.connect(alice).removeCollateral(collAmount);
      const afterUsers = await vault.totalUsers();
      expect(afterUsers.includes(alice.address)).to.be.false;
    });
  });
  describe('Liquidate', () => {
    const collAmount = parseEther('7000');
    const borrowAmount = parseEther('0.9');

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      vault = <ERC20VaultETH>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockToken.address,
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

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockToken.mint(owner.address, collAmount);
      await mockToken.approve(vault.address, collAmount);

      await vault.addCollateral(collAmount);
      await vault.borrow(borrowAmount);
      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);

      // Mint stablecoins for alice and transfer to owner to prepare liquidations
      await mockToken.mint(alice.address, collAmount);
      await mockToken.connect(alice).approve(vault.address, collAmount);
      await vault.connect(alice).addCollateral(collAmount);
      await vault.connect(alice).borrow(borrowAmount);

      await stablecoin
        .connect(alice)
        .transfer(owner.address, await stablecoin.balanceOf(alice.address));
    });

    it('should revert liquidation from non liquidator role granted address', async () => {
      await expect(
        vault.connect(alice).liquidate(owner.address, alice.address)
      ).to.be.revertedWith('AccessControl');
    });
    it('should revert liquidation when the position in not liquidatable', async () => {
      const price = await provider['getPriceETH()']();

      // so healthy
      await provider.setPriceETH(price.div(2));
      await expect(
        vault.liquidate(owner.address, owner.address)
      ).to.be.revertedWith('InvalidPosition');
      expect(await vault.isLiquidatable(owner.address)).to.be.false;

      // exactly 90%
      await provider.setPriceETH(price.div(7));
      expect(await vault.isLiquidatable(owner.address)).to.be.true;
      await provider.setPriceETH(0);
    });
    it('should receive underlying collaterals when liquidating positions under liquidation rate', async () => {
      await stablecoin.approve(vault.address, constants.MaxUint256);

      const price = await provider['getPriceETH()']();
      await provider.setPriceETH(price.div(8));
      expect(await vault.isLiquidatable(owner.address)).to.be.true;

      const collBalBefore = await mockToken.balanceOf(owner.address);
      const position = await vault.positions(owner.address);
      await expect(vault.liquidate(owner.address, owner.address)).to.be.emit(
        vault,
        'Liquidated'
      );

      const collBalAfter = await mockToken.balanceOf(owner.address);
      expect(collBalAfter).to.be.equal(collBalBefore.add(position.collateral));

      const totalUsers = await vault.totalUsers();
      expect(totalUsers.includes(owner.address)).to.be.false;
      await provider.setPriceETH(0);
    });
  });
  describe('Privilege Actions', () => {
    const collAmount = parseEther('7000');
    const borrowAmount = parseEther('1');

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC20VaultETH');
      vault = <ERC20VaultETH>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockToken.address,
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

      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockToken.mint(owner.address, collAmount);
      await mockToken.approve(vault.address, collAmount);
      await vault.addCollateral(collAmount);
      await vault.borrow(borrowAmount);
    });
    it('should revert collecting fee from non dao admin', async () => {
      await expect(vault.connect(alice).collect()).to.be.revertedWith(
        'AccessControl'
      );
    });
    it('dao admin should be able to withdraw fees collected', async () => {
      const fee = await vault.totalFeeCollected();
      expect(fee).to.be.gt(constants.Zero);

      const balBefore = await stablecoin.balanceOf(owner.address);
      await expect(vault.collect()).to.be.emit(vault, 'FeeCollected');
      const balAfter = await stablecoin.balanceOf(owner.address);
      expect(balAfter).to.be.gt(balBefore.add(fee));
    });
    it('dao admin should be able to rescue tokens locked in vault', async () => {
      await mockToken.mint(vault.address, collAmount);

      await expect(
        vault.connect(alice).rescueToken(mockToken.address, collAmount)
      ).to.be.revertedWith('AccessControl');

      const beforeBal = await mockToken.balanceOf(owner.address);
      await vault.rescueToken(mockToken.address, collAmount);
      const afterBal = await mockToken.balanceOf(owner.address);
      expect(afterBal).to.be.equal(beforeBal.add(collAmount));
    });
    it('dao admin should be able to update vault settings', async () => {
      await expect(
        vault.connect(alice).setSettings({
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
        })
      ).to.be.revertedWith('AccessControl');

      await vault.grantRole(SETTER_ROLE, owner.address);
      await vault.setSettings({
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
      });
    });
  });
});
