import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {
  ERC721ValueProvider,
  ERC721Vault,
  MockERC721,
  TriremeUSD,
} from '../../types';
import { BigNumber, constants } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { ethers, upgrades, expect } from 'hardhat';
import { evm_increaseTime } from '../helper';

describe('ERC721 Vault', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  let provider: ERC721ValueProvider;
  let vault: ERC721Vault;
  let mockNFT: MockERC721;
  let stablecoin: TriremeUSD;

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);
  const borrowAmountCap = parseEther('1000');
  const minBorrowAmount = parseEther('1');

  const chainlinkAzukiAggregator = '0xA8B9A447C73191744D5B79BcE864F343455E1150';
  const SETTER_ROLE =
    '0x61c92169ef077349011ff0b1383c894d86c5f0b41d986366b58a6cf31e93beda';
  const LIQUIDATOR_ROLE =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    const mockNftFactory = await ethers.getContractFactory('MockERC721');
    mockNFT = <MockERC721>await mockNftFactory.deploy('Mock', 'Mock', '');

    const stablecoinFactory = await ethers.getContractFactory('TriremeUSD');
    stablecoin = <TriremeUSD>await stablecoinFactory.deploy();

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
  });

  describe('Initializing', () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
          insuranceRepurchaseTimeLimit: 0,
          borrowAmountCap,
          minBorrowAmount,
        },
      ]);
    });
    it('should revert when debt interest rate is invalid', async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
          {
            debtInterestApr: {
              numerator,
              denominator: 0,
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
            insuranceRepurchaseTimeLimit: 0,
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
          {
            debtInterestApr: {
              numerator: numerator.add(denominator),
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
            insuranceRepurchaseTimeLimit: 0,
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
    });
    it('should revert when organization fee is invalid', async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
          {
            debtInterestApr: {
              numerator,
              denominator,
            },
            organizationFeeRate: {
              numerator,
              denominator: 0,
            },
            insurancePurchaseRate: {
              numerator,
              denominator,
            },
            insuranceLiquidationPenaltyRate: {
              numerator,
              denominator,
            },
            insuranceRepurchaseTimeLimit: 0,
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
          {
            debtInterestApr: {
              numerator,
              denominator,
            },
            organizationFeeRate: {
              numerator: numerator.add(denominator),
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
            insuranceRepurchaseTimeLimit: 0,
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
    });
    it('should revert when insurance purchase rate is invalid', async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
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
              denominator: 0,
            },
            insuranceLiquidationPenaltyRate: {
              numerator,
              denominator,
            },
            insuranceRepurchaseTimeLimit: 0,
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
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
              numerator: numerator.add(denominator),
              denominator,
            },
            insuranceLiquidationPenaltyRate: {
              numerator,
              denominator,
            },
            insuranceRepurchaseTimeLimit: 0,
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
    });
    it('should revert when insurance liquidation panelty rate is invalid', async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
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
              denominator: 0,
            },
            insuranceRepurchaseTimeLimit: 0,
            borrowAmountCap,
            minBorrowAmount,
          },
        ])
      ).to.be.revertedWith('InvalidRate');
      await expect(
        upgrades.deployProxy(factory, [
          stablecoin.address,
          mockNFT.address,
          provider.address,
          chainlinkAzukiAggregator,
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
              numerator: numerator.add(denominator),
              denominator,
            },
            insuranceRepurchaseTimeLimit: 0,
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
  });
  describe('Borrow', () => {
    const borrowAmount = parseEther('10');
    let tokenId: BigNumber;

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
          insuranceRepurchaseTimeLimit: 0,
          borrowAmountCap,
          minBorrowAmount,
        },
      ]);
      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
    });
    it('should be able to borrow stablecoins from the vault', async () => {
      await expect(vault.borrow(tokenId, borrowAmount, true))
        .to.be.emit(vault, 'Borrowed')
        .emit(vault, 'PositionOpened');

      const position = await vault.positions(tokenId);
      expect(position.debtPortion).to.be.equal(borrowAmount);

      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(vault.address);

      const fee = borrowAmount.mul(numerator).div(denominator);
      const insuranceFee = borrowAmount.mul(numerator).div(denominator);
      expect(await stablecoin.balanceOf(owner.address)).to.be.equal(
        borrowAmount.sub(fee).sub(insuranceFee)
      );
      expect(await vault.positionOwner(tokenId)).to.be.equal(owner.address);
      const positionIndexes = await vault.openPositionsIndexes();
      expect(positionIndexes[0]).to.be.equal(tokenId);
      expect(await vault.totalPositions()).to.be.equal(1);
    });
    it('should be able to borrow again for same collateral', async () => {
      const balBefore = await stablecoin.balanceOf(owner.address);
      await vault.borrow(tokenId, borrowAmount.div(2), false);
      await vault.borrow(tokenId, borrowAmount.div(2), false);
      const balAfter = await stablecoin.balanceOf(owner.address);

      const fee = borrowAmount.mul(numerator).div(denominator);
      expect(balAfter).to.be.equal(balBefore.add(borrowAmount).sub(fee));
    });
    it('should revert borrowing when exceed credit limit', async () => {
      const creditLimit = await vault.getCreditLimit(owner.address, tokenId);
      await expect(
        vault.borrow(tokenId, creditLimit.add(1), true)
      ).to.be.revertedWith('InvalidAmount');
    });
    it('should revert borrowing against invalid nft token id', async () => {
      await expect(vault.borrow(0, borrowAmount, true)).to.be.revertedWith(
        'ERC721: invalid token ID'
      );
    });
    it('should revert borrowning again from not position owner', async () => {
      await vault.borrow(tokenId, borrowAmount, true);
      await expect(
        vault.connect(alice).borrow(tokenId, borrowAmount, true)
      ).to.be.revertedWith('Unauthorized');
    });
    it('should revert borrowning again zero amount', async () => {
      await vault.borrow(tokenId, borrowAmount, true);
      await expect(vault.borrow(tokenId, 0, true)).to.be.revertedWith(
        'MinBorrowAmount'
      );
      await expect(vault.borrow(tokenId, 100, true)).to.be.revertedWith(
        'MinBorrowAmount'
      );
    });
    it.skip('should revert borrowing again for liquidated position', async () => {});
    it('should revert borrowing when exceed borrow cap', async () => {
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
        insurancePurchaseRate: {
          numerator,
          denominator,
        },
        insuranceLiquidationPenaltyRate: {
          numerator,
          denominator,
        },
        insuranceRepurchaseTimeLimit: 0,
        borrowAmountCap: parseEther('1'),
        minBorrowAmount,
      });
      await expect(
        vault.borrow(tokenId, borrowAmount, true)
      ).to.be.revertedWith('DebtCapReached');
    });
  });
  describe('Repay', () => {
    const borrowAmount = parseEther('10');
    let tokenId: BigNumber;

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
          insuranceRepurchaseTimeLimit: 0,
          borrowAmountCap,
          minBorrowAmount,
        },
      ]);
      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, false);
    });
    it('should revert repaying for non existing token id', async () => {
      await expect(vault.repay(0, constants.MaxUint256)).to.be.revertedWith(
        'ERC721: invalid token ID'
      );
    });
    it('should revert repaying zero', async () => {
      await expect(vault.repay(tokenId, 0)).to.be.revertedWith('InvalidAmount');
    });
    it('should revert repaying from not position owners', async () => {
      await expect(
        vault.connect(alice).repay(tokenId, constants.MaxUint256)
      ).to.be.revertedWith('Unauthorized');
    });
    it.skip('should revert repaying for liquidated positions', async () => {});
    it('should revert repaying for no debt positions', async () => {
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.repay(tokenId, constants.MaxUint256);
      await expect(
        vault.repay(tokenId, constants.MaxUint256)
      ).to.be.revertedWith('NoDebt');
    });
    it('should be able to repay debt', async () => {
      await stablecoin.approve(vault.address, constants.MaxUint256);
      const balBefore = await stablecoin.balanceOf(owner.address);
      await expect(vault.repay(tokenId, constants.MaxUint256)).to.be.emit(
        vault,
        'Repaid'
      );
      const balAfter = await stablecoin.balanceOf(owner.address);
      expect(balAfter).to.be.closeTo(
        balBefore.sub(borrowAmount),
        parseEther('0.01')
      );
      const position = await vault.positions(tokenId);
      expect(position.debtPortion).to.be.equal(0);
    });
  });
  describe('Close position', () => {
    const borrowAmount = parseEther('10');
    let tokenId: BigNumber;

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
          insuranceRepurchaseTimeLimit: 0,
          borrowAmountCap,
          minBorrowAmount,
        },
      ]);
      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, false);
    });
    it('should revert closing position for non existing token id', async () => {
      await expect(vault.closePosition(0)).to.be.revertedWith(
        'ERC721: invalid token ID'
      );
    });
    it('should revert closing position from not position owner', async () => {
      await expect(
        vault.connect(alice).closePosition(tokenId)
      ).to.be.revertedWith('Unauthorized');
    });
    it.skip('should revert closing position for liquidated positions', async () => {});
    it('should revert closing positions with debts', async () => {
      await expect(vault.closePosition(tokenId)).to.be.revertedWith(
        'NonZeroDebt'
      );
    });
    it('should receive collateral nft back when closing position succeed', async () => {
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.repay(tokenId, constants.MaxUint256);

      await expect(vault.closePosition(tokenId)).to.be.emit(
        vault,
        'PositionClosed'
      );
      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(owner.address);
      expect(await vault.positionOwner(tokenId)).to.be.equal(
        constants.AddressZero
      );
    });
  });
  describe('Liquidate', () => {
    const borrowAmount = parseEther('10');
    let tokenId: BigNumber;

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
          insuranceRepurchaseTimeLimit: 0,
          borrowAmountCap,
          minBorrowAmount,
        },
      ]);
      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, false);

      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);
    });
    it('should revert liquidating from non liquidator role', async () => {
      await expect(
        vault.connect(alice).liquidate(tokenId, owner.address)
      ).to.be.revertedWith('AccessControl');
    });
    it('should revert liquidating for non existing token id', async () => {
      await expect(vault.liquidate(0, owner.address)).to.be.revertedWith(
        'ERC721: invalid token ID'
      );
    });
    it('should revert liquidating for invalid position id', async () => {
      await expect(vault.liquidate(1, owner.address)).to.be.revertedWith(
        'InvalidPosition'
      );
    });
    it.skip('should revert liquidating for liquidated positions', async () => {});
    it('should revert liquidating for not liquidatable positions', async () => {
      expect(await vault.isLiquidatable(tokenId)).to.be.false;
      await expect(vault.liquidate(tokenId, owner.address)).to.be.revertedWith(
        'InvalidPosition'
      );
    });
    it('should receive underlying nft when liquidating non-insured positions under water floor', async () => {
      const price = await provider.getFloorETH();
      await provider.overrideFloor(price.div(1000));
      expect(await vault.isLiquidatable(tokenId)).to.be.true;

      await stablecoin.approve(vault.address, constants.MaxUint256);
      await expect(vault.liquidate(tokenId, owner.address)).to.be.emit(
        vault,
        'Liquidated'
      );

      const position = await vault.positions(tokenId);

      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(owner.address);
      expect(position.debtPortion).to.be.equal(0);
      expect(await vault.positionOwner(tokenId)).to.be.equal(
        constants.AddressZero
      );
      await provider.disableFloorOverride();
    });
    it('should list underlying nft in auction when liquidating insured positions under water floor', async () => {
      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, true);

      const price = await provider.getFloorETH();
      await provider.overrideFloor(price.div(1000));
      expect(await vault.isLiquidatable(tokenId)).to.be.true;

      await stablecoin.approve(vault.address, constants.MaxUint256);
      await expect(vault.liquidate(tokenId, owner.address)).to.be.emit(
        vault,
        'Liquidated'
      );
      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(vault.address);

      const position = await vault.positions(tokenId);
      expect(position.liquidator).to.be.equal(owner.address);
      expect(position.liquidatedAt).to.be.gt(0);
      await provider.disableFloorOverride();
    });
  });
  describe('Repurchase', () => {
    const borrowAmount = parseEther('10');
    let tokenId: BigNumber;
    let liquidatablePrice: BigNumber;

    before(async () => {
      await provider.disableFloorOverride();
      const price = await provider.getFloorETH();
      liquidatablePrice = price.div(1000);
    });

    beforeEach(async () => {
      await provider.disableFloorOverride();
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, true);
    });
    it('should revert repurchasing for non existing token id', async () => {
      await expect(vault.repurchase(0, borrowAmount)).to.be.revertedWith(
        'ERC721: invalid token ID'
      );
    });
    it('should revert repurchasing from non position owner', async () => {
      await expect(
        vault.connect(alice).repurchase(tokenId, borrowAmount)
      ).to.be.revertedWith('Unauthorized');
    });
    it('should revert repurchasing for not liquidated positions', async () => {
      const position = await vault.positions(tokenId);
      expect(position.liquidatedAt).to.be.equal(0);
      await expect(vault.repurchase(tokenId, borrowAmount)).to.be.revertedWith(
        'InvalidPosition'
      );
    });
    it('should revert repurchasing when expired', async () => {
      await provider.overrideFloor(liquidatablePrice);
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);
      await vault.liquidate(tokenId, owner.address);

      await evm_increaseTime(101);
      await expect(vault.repurchase(tokenId, borrowAmount)).to.be.revertedWith(
        'PositionInsuranceExpired'
      );
    });
    it('should revert repurchasing with zero repay amount', async () => {
      await provider.overrideFloor(liquidatablePrice);
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);
      await vault.liquidate(tokenId, owner.address);

      const position = await vault.positions(tokenId);
      await expect(vault.repurchase(tokenId, 0)).to.be.revertedWith(
        'InvalidAmount'
      );
      await expect(
        vault.repurchase(tokenId, position.debtAmountForRepurchase.add(100))
      ).to.be.emit(vault, 'LiquidationRepayment');
    });
    it('should be able to repurchase collateral nft within insurance window', async () => {
      await provider.overrideFloor(liquidatablePrice);
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);
      await vault.liquidate(tokenId, owner.address);
      await provider.disableFloorOverride();

      await stablecoin.approve(vault.address, constants.MaxUint256);
      const position = await vault.positions(tokenId);
      await expect(
        vault.repurchase(tokenId, position.debtAmountForRepurchase.div(2))
      ).to.be.emit(vault, 'LiquidationRepayment');
    });
  });
  describe('Claim Expired NFT', () => {
    const borrowAmount = parseEther('10');
    let tokenId: BigNumber;
    let liquidatablePrice: BigNumber;

    before(async () => {
      await provider.disableFloorOverride();
      const price = await provider.getFloorETH();
      liquidatablePrice = price.div(1000);
    });

    beforeEach(async () => {
      await provider.disableFloorOverride();
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, true);
    });
    it('should revert claiming for non existing token id', async () => {
      await expect(
        vault.claimExpiredInsuranceNFT(0, owner.address)
      ).to.be.revertedWith('ERC721: invalid token ID');
    });
    it('should revert claiming for not deposited nft', async () => {
      await expect(
        vault.connect(alice).claimExpiredInsuranceNFT(1, owner.address)
      ).to.be.revertedWith('InvalidPosition');
    });
    it('should revert claiming for not liquidated position', async () => {
      await expect(
        vault.claimExpiredInsuranceNFT(tokenId, owner.address)
      ).to.be.revertedWith('InvalidPosition');
    });
    it('should revert claiming for not expired position', async () => {
      await provider.overrideFloor(liquidatablePrice);
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);
      await vault.liquidate(tokenId, owner.address);
      await provider.disableFloorOverride();

      await expect(
        vault.claimExpiredInsuranceNFT(tokenId, owner.address)
      ).to.be.revertedWith('PositionInsuranceNotExpired');
    });
    it('should revert claiming from not liquidator', async () => {
      await provider.overrideFloor(liquidatablePrice);
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);
      await vault.liquidate(tokenId, owner.address);
      await provider.disableFloorOverride();

      await evm_increaseTime(101);

      await expect(
        vault.connect(alice).claimExpiredInsuranceNFT(tokenId, owner.address)
      ).to.be.revertedWith('Unauthorized');
    });
    it('should be able to claim expired insured nft', async () => {
      await provider.overrideFloor(liquidatablePrice);
      await stablecoin.approve(vault.address, constants.MaxUint256);
      await vault.grantRole(LIQUIDATOR_ROLE, owner.address);
      await vault.liquidate(tokenId, owner.address);
      await provider.disableFloorOverride();

      await evm_increaseTime(101);

      await expect(
        vault.claimExpiredInsuranceNFT(tokenId, owner.address)
      ).to.be.emit(vault, 'InsuranceExpired');
      expect(await mockNFT.ownerOf(tokenId)).to.be.equal(owner.address);
    });
  });
  describe('Privilege Actions', () => {
    const borrowAmount = parseEther('10');
    let tokenId: BigNumber;

    beforeEach(async () => {
      const factory = await ethers.getContractFactory('ERC721Vault');
      vault = <ERC721Vault>await upgrades.deployProxy(factory, [
        stablecoin.address,
        mockNFT.address,
        provider.address,
        chainlinkAzukiAggregator,
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
          insuranceRepurchaseTimeLimit: 0,
          borrowAmountCap,
          minBorrowAmount,
        },
      ]);
      await stablecoin.grantRole(await stablecoin.MINTER_ROLE(), vault.address);

      await mockNFT.mint(owner.address, 1);
      tokenId = await mockNFT.tokenId();
      await mockNFT.approve(vault.address, tokenId);
      await vault.borrow(tokenId, borrowAmount, false);
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
      const stablecoinBal = await stablecoin.balanceOf(owner.address);
      await stablecoin.transfer(vault.address, stablecoinBal);

      await expect(
        vault.connect(alice).rescueToken(stablecoin.address, stablecoinBal)
      ).to.be.revertedWith('AccessControl');

      const beforeBal = await stablecoin.balanceOf(owner.address);
      await vault.rescueToken(stablecoin.address, stablecoinBal);
      const afterBal = await stablecoin.balanceOf(owner.address);
      expect(afterBal).to.be.equal(beforeBal.add(stablecoinBal));
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
          insurancePurchaseRate: {
            numerator,
            denominator,
          },
          insuranceLiquidationPenaltyRate: {
            numerator,
            denominator,
          },
          insuranceRepurchaseTimeLimit: 0,
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
        insurancePurchaseRate: {
          numerator,
          denominator,
        },
        insuranceLiquidationPenaltyRate: {
          numerator,
          denominator,
        },
        insuranceRepurchaseTimeLimit: 0,
        borrowAmountCap,
        minBorrowAmount,
      });
    });
  });
});
