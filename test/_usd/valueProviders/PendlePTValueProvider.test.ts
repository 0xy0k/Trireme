import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, upgrades, waffle } from 'hardhat';
import { MockToken, PendlePTValueProvider } from '../../../types';
import { expect } from 'chai';
import { BigNumber, constants, utils } from 'ethers';
import { parseEther } from 'ethers/lib/utils';

describe('Pendle PT Value Provider', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let provider: PendlePTValueProvider;
  let mockToken: MockToken;

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);

  const pendlePtOracleAddr = '0xbbd487268A295531d299c125F3e5f749884A3e30';
  const chainlinkBTCAggregator = '0xdeb288F737066589598e9214E782fa5A8eD689e8';
  const ptMarket = '0x54E28e62Ea9E8D755DC6e74674eAbE2aBfdB004E';
  const ptMarket2 = '0xC374f7eC85F8C7DE3207a10bB1978bA104bdA3B2';

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    const mockTokenFactory = await ethers.getContractFactory('MockToken');
    mockToken = <MockToken>await mockTokenFactory.deploy('Mock', 'Mock');
  });

  describe('Initializing', () => {
    it('should revert when aggregator param is zero', async () => {
      const factory = await ethers.getContractFactory('PendlePTValueProvider');
      await expect(
        upgrades.deployProxy(factory, [
          { market: constants.AddressZero, twapDuration: 0 },
          pendlePtOracleAddr,
          constants.AddressZero,
          mockToken.address,
          {
            numerator,
            denominator,
          },
          {
            numerator,
            denominator,
          },
        ])
      ).to.be.revertedWith('ZeroAddress');
    });
    it('should be able to initialize provider contract', async () => {
      const factory = await ethers.getContractFactory('PendlePTValueProvider');
      provider = <PendlePTValueProvider>await upgrades.deployProxy(factory, [
        { market: constants.AddressZero, twapDuration: 0 },
        pendlePtOracleAddr,
        chainlinkBTCAggregator,
        mockToken.address,
        {
          numerator,
          denominator,
        },
        {
          numerator,
          denominator,
        },
      ]);
      const creditRate = await provider.getCreditLimitRate(owner.address, 0);
      expect(creditRate.numerator).to.be.equal(numerator);
      expect(creditRate.denominator).to.be.equal(denominator);

      const liquidationRate = await provider.getLiquidationLimitRate(
        owner.address,
        0
      );
      expect(liquidationRate.numerator).to.be.equal(numerator);
      expect(liquidationRate.denominator).to.be.equal(denominator);
    });
  });
  describe('Price Feed', () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('PendlePTValueProvider');
      provider = <PendlePTValueProvider>await upgrades.deployProxy(factory, [
        { market: ptMarket2, twapDuration: 100 },
        pendlePtOracleAddr,
        chainlinkBTCAggregator,
        mockToken.address,
        {
          numerator,
          denominator,
        },
        {
          numerator,
          denominator,
        },
      ]);
    });
    it('should revert when pt oracle state of given market requires increased cardinality', async () => {
      const factory = await ethers.getContractFactory('PendlePTValueProvider');
      provider = <PendlePTValueProvider>await upgrades.deployProxy(factory, [
        { market: ptMarket, twapDuration: 100 },
        pendlePtOracleAddr,
        chainlinkBTCAggregator,
        mockToken.address,
        {
          numerator,
          denominator,
        },
        {
          numerator,
          denominator,
        },
      ]);
      const ptOracle = await ethers.getContractAt(
        'IPendlePtOracle',
        pendlePtOracleAddr
      );
      const marketState = await ptOracle.getOracleState(ptMarket, 100);

      expect(marketState.increaseCardinalityRequired).to.be.true;

      await expect(provider['getPriceUSD()']()).to.be.revertedWith(
        'IncreaseCardinalityRequired'
      );
    });
    it.skip('should revert when oracle state of given market does not satisfy oldest observation', async () => {
      const factory = await ethers.getContractFactory('PendlePTValueProvider');
      provider = <PendlePTValueProvider>await upgrades.deployProxy(factory, [
        { market: ptMarket, twapDuration: 100 },
        pendlePtOracleAddr,
        chainlinkBTCAggregator,
        mockToken.address,
        {
          numerator,
          denominator,
        },
        {
          numerator,
          denominator,
        },
      ]);
      const ptOracle = await ethers.getContractAt(
        'IPendlePtOracle',
        pendlePtOracleAddr
      );
      const marketState = await ptOracle.getOracleState(ptMarket, 100);

      expect(marketState.increaseCardinalityRequired).to.be.true;

      await expect(provider['getPriceUSD()']()).to.be.revertedWith(
        'IncreaseCardinalityRequired'
      );
    });
    it('should be able to get price of collateral', async () => {
      const price = await provider['getPriceUSD()']();
      expect(price).to.be.gt(BigNumber.from(0));
    });
    it('should be able to get usd value of collateral', async () => {
      const amount = utils.parseUnits('1');
      const price = await provider['getPriceUSD()']();
      const value = await provider['getPriceUSD(uint256)'](amount);

      expect(value).to.be.equal(
        price.mul(amount).div(BigNumber.from(10).pow(18))
      );
    });
    it('should be able to get usd value of liquidation limit', async () => {
      const amount = utils.parseUnits('1');

      const liqLimitValue = await provider.getLiquidationLimitUSD(
        owner.address,
        amount
      );

      const colValue = await provider['getPriceUSD(uint256)'](amount);
      expect(liqLimitValue).to.be.equal(
        colValue.mul(numerator).div(denominator)
      );
    });
    it('should be able to get usd value of credit limit', async () => {
      const amount = utils.parseUnits('1');

      const creditLimitValue = await provider.getCreditLimitUSD(
        owner.address,
        amount
      );

      const colValue = await provider['getPriceUSD(uint256)'](amount);
      expect(creditLimitValue).to.be.equal(
        colValue.mul(numerator).div(denominator)
      );
    });
  });
  describe('Privilege Actions', () => {
    beforeEach(async () => {
      const factory = await ethers.getContractFactory('PendlePTValueProvider');
      provider = <PendlePTValueProvider>await upgrades.deployProxy(factory, [
        { market: ptMarket2, twapDuration: 100 },
        pendlePtOracleAddr,
        chainlinkBTCAggregator,
        mockToken.address,
        {
          numerator,
          denominator,
        },
        {
          numerator,
          denominator,
        },
      ]);
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
  });
});
