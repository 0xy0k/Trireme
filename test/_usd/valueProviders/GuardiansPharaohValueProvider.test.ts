import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, upgrades } from 'hardhat';
import { AddressProvider, GuardiansPharaohValueProvider } from '../../../types';
import { expect } from 'chai';
import { BigNumber, ContractFactory } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

describe('Gaurdians Pharaoh Value Provider', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let provider: GuardiansPharaohValueProvider;
  let addressProvider: AddressProvider;
  let providerFactory: ContractFactory;

  const chainlinkAzukiAggregator = '0xA8B9A447C73191744D5B79BcE864F343455E1150';

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);
  const addressProviderAddr = '0x88676F89727475339f15d97A29a68E405FEd723a';

  before(async () => {
    [owner, alice] = await ethers.getSigners();
    providerFactory = await ethers.getContractFactory(
      'GuardiansPharaohValueProvider'
    );

    addressProvider = await ethers.getContractAt(
      'AddressProvider',
      addressProviderAddr
    );
  });

  describe('Initializing', () => {
    beforeEach(async () => {
      provider = <GuardiansPharaohValueProvider>await upgrades.deployProxy(
        providerFactory,
        [
          addressProvider.address,
          chainlinkAzukiAggregator,
          {
            numerator,
            denominator,
          },
          {
            numerator,
            denominator,
          },
        ]
      );
    });
    it('should initialize credit & liquidation limit rates', async () => {
      const creditRate = await provider.getCreditLimitRate(owner.address, 0);
      expect(creditRate.numerator).to.be.equal(numerator);
      expect(creditRate.denominator).to.be.equal(denominator);

      const liqLimitRate = await provider.getLiquidationLimitRate(
        owner.address,
        0
      );
      expect(liqLimitRate.numerator).to.be.equal(numerator);
      expect(liqLimitRate.denominator).to.be.equal(denominator);
    });
  });

  describe('Price Feed', () => {
    beforeEach(async () => {
      provider = <GuardiansPharaohValueProvider>await upgrades.deployProxy(
        providerFactory,
        [
          addressProvider.address,
          chainlinkAzukiAggregator,
          {
            numerator,
            denominator,
          },
          {
            numerator,
            denominator,
          },
        ]
      );
    });

    it('should be able to get floor price of underlying nft', async () => {
      const floorPrice = await provider.getFloorUSD();
      expect(floorPrice).to.be.gt(0);
    });

    it('should return overridden floor price when it is set', async () => {
      const price = parseEther('5');
      await provider.overrideFloor(price);

      expect(await provider.getFloorUSD()).to.be.equal(price);
    });
    it('should be able to get usd value of collateral nft', async () => {
      const price = await provider.getFloorUSD();
      const amount = parseEther('2');

      const value = await provider.getNFTValueUSD(amount);
      expect(value).to.be.equal(price.mul(amount));
    });
    it('should be able to get usd value of liquidation limit', async () => {
      const amount = parseEther('1');

      const liqLimitValue = await provider.getLiquidationLimitUSD(
        owner.address,
        amount
      );

      const colValue = await provider.getNFTValueUSD(amount);
      expect(liqLimitValue).to.be.equal(
        colValue.mul(numerator).div(denominator)
      );
    });
    it('should be able to get usd value of credit limit', async () => {
      const amount = parseEther('1');

      const creditLimitValue = await provider.getCreditLimitUSD(
        owner.address,
        amount
      );

      const colValue = await provider.getNFTValueUSD(amount);
      expect(creditLimitValue).to.be.equal(
        colValue.mul(numerator).div(denominator)
      );
    });
  });

  describe('Privilege Actions', () => {
    beforeEach(async () => {
      provider = <GuardiansPharaohValueProvider>await upgrades.deployProxy(
        providerFactory,
        [
          addressProvider.address,
          chainlinkAzukiAggregator,
          {
            numerator,
            denominator,
          },
          {
            numerator,
            denominator,
          },
        ]
      );
    });
    it('should revert setting credit limit from non default admin', async () => {
      await expect(
        provider.connect(alice).setBaseCreditLimitRate({
          numerator,
          denominator,
        })
      ).to.be.revertedWith('AccessControl');
    });
    it('default admin should be able to set credit limit rate', async () => {
      await provider
        .connect(owner)
        .setBaseCreditLimitRate({ numerator: numerator.mul(2), denominator });
      const creditRate = await provider.getCreditLimitRate(
        owner.address,
        parseEther('1')
      );
      expect(creditRate.numerator).to.be.equal(numerator.mul(2));
      expect(creditRate.denominator).to.be.equal(denominator);
    });
    it('should revert setting liquidation limit rate from non default admin', async () => {
      await expect(
        provider.connect(alice).setBaseLiquidationLimitRate({
          numerator,
          denominator,
        })
      ).to.be.revertedWith('AccessControl');
    });
    it('default admin should be able to set liquidation limit rate', async () => {
      await provider.connect(owner).setBaseLiquidationLimitRate({
        numerator: numerator.mul(2),
        denominator,
      });
      const rate = await provider.getLiquidationLimitRate(
        owner.address,
        parseEther('1')
      );
      expect(rate.numerator).to.be.equal(numerator.mul(2));
      expect(rate.denominator).to.be.equal(denominator);
    });
    it('should revert setting invalid rate', async () => {
      await expect(
        provider.setBaseCreditLimitRate({ numerator, denominator: 0 })
      ).to.be.revertedWith('InvalidRate');

      await expect(
        provider.setBaseCreditLimitRate({
          numerator: denominator.add(numerator),
          denominator,
        })
      ).to.be.revertedWith('InvalidRate');
    });
    it('should revert setting overridden floor price from non default admin', async () => {
      await expect(
        provider.connect(alice).overrideFloor(parseEther('1'))
      ).to.be.revertedWith('AccessControl');
    });
    it('should revert setting overridden floot price of zero', async () => {
      await expect(provider.overrideFloor(0)).to.be.revertedWith(
        'InvalidAmount'
      );
    });
    it('default admin can set overridden floor price', async () => {
      const newPrice = await parseEther('1');
      await provider.overrideFloor(newPrice);

      expect(await provider.getFloorUSD()).to.be.equal(newPrice);
      expect(await provider.daoFloorOverride()).to.be.true;
      expect(await provider.overriddenFloorValueUSD()).to.be.equal(newPrice);
    });
    it('default admin can disable overridden floor price', async () => {
      const newPrice = await parseEther('1');
      await provider.overrideFloor(newPrice);

      await expect(
        provider.connect(alice).disableFloorOverride()
      ).to.be.revertedWith('AccessControl');

      await provider.disableFloorOverride();
      expect(await provider.daoFloorOverride()).to.be.false;
      expect(await provider.getFloorUSD()).to.be.not.equal(newPrice);
    });
  });
});
