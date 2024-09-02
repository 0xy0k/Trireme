import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, upgrades } from 'hardhat';
import { AddressProvider } from '../../types';
import chai, { expect } from 'chai';
import { solidity } from 'ethereum-waffle';
import { constants } from 'ethers';

chai.use(solidity);

describe('Address Provider', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let treausry: SignerWithAddress;
  let guardian: SignerWithAddress;
  let trireme: SignerWithAddress;
  let aggregator: SignerWithAddress;
  let bond: SignerWithAddress;
  let obelisk: SignerWithAddress;
  let optionTrireme: SignerWithAddress;
  let farming: SignerWithAddress;
  let provider: AddressProvider;

  before(async () => {
    [
      owner,
      alice,
      treausry,
      guardian,
      trireme,
      aggregator,
      bond,
      obelisk,
      optionTrireme,
      farming,
    ] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const factory = await ethers.getContractFactory('AddressProvider');
    provider = <AddressProvider>await upgrades.deployProxy(factory);
  });

  it('only owner should be able to set treasury address', async () => {
    await expect(
      provider.connect(alice).setTreasury(treausry.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setTreasury(treausry.address);
    expect(await provider.getTreasury()).to.be.equal(treausry.address);
  });
  it('only owner should be able to set guardian', async () => {
    await expect(
      provider.connect(alice).setGuardian(guardian.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setGuardian(guardian.address);
    expect(await provider.getGuardian()).to.be.equal(guardian.address);
  });
  it('only owner should be able to set trireme', async () => {
    await expect(
      provider.connect(alice).setTrireme(trireme.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setTrireme(trireme.address);
    expect(await provider.getTrireme()).to.be.equal(trireme.address);
  });
  it('only owner should be able to set aggregator', async () => {
    await expect(
      provider.connect(alice).setPriceOracleAggregator(aggregator.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setPriceOracleAggregator(aggregator.address);
    expect(await provider.getPriceOracleAggregator()).to.be.equal(
      aggregator.address
    );
  });
  it('only owner should be able to set bond', async () => {
    await expect(
      provider.connect(alice).setBond(bond.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setBond(bond.address);
    expect(await provider.getBond()).to.be.equal(bond.address);
  });
  it('only owner should be able to set obelisk', async () => {
    await expect(
      provider.connect(alice).setObelisk(obelisk.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setObelisk(obelisk.address);
    expect(await provider.getObelisk()).to.be.equal(obelisk.address);
  });
  it('only owner should be able to set optionTrireme', async () => {
    await expect(
      provider.connect(alice).setOptionTrireme(optionTrireme.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setOptionTrireme(optionTrireme.address);
    expect(await provider.getOptionTrireme()).to.be.equal(optionTrireme.address);
  });
  it('only owner should be able to set farming', async () => {
    await expect(
      provider.connect(alice).setFarming(farming.address)
    ).to.be.revertedWith('Ownable: caller is not the owner');

    await provider.setFarming(farming.address);
    expect(await provider.getFarming()).to.be.equal(farming.address);
  });
  it('should revert setting zero treasury', async () => {
    await expect(
      provider.setTreasury(constants.AddressZero)
    ).to.be.revertedWith('ZERO_ADDRESS');
  });
  it('should revert setting zero guardian', async () => {
    await expect(
      provider.setGuardian(constants.AddressZero)
    ).to.be.revertedWith('ZERO_ADDRESS');
  });
  it('should revert setting zero trireme', async () => {
    await expect(provider.setTrireme(constants.AddressZero)).to.be.revertedWith(
      'ZERO_ADDRESS'
    );
  });
  it('should revert setting zero aggregator', async () => {
    await expect(
      provider.setPriceOracleAggregator(constants.AddressZero)
    ).to.be.revertedWith('ZERO_ADDRESS');
  });
  it('should revert setting zero bond', async () => {
    await expect(provider.setBond(constants.AddressZero)).to.be.revertedWith(
      'ZERO_ADDRESS'
    );
  });
  it('should revert setting zero obelisk', async () => {
    await expect(provider.setObelisk(constants.AddressZero)).to.be.revertedWith(
      'ZERO_ADDRESS'
    );
  });
  it('should revert setting zero optionTrireme', async () => {
    await expect(
      provider.setOptionTrireme(constants.AddressZero)
    ).to.be.revertedWith('ZERO_ADDRESS');
  });
  it('should revert setting zero farming', async () => {
    await expect(provider.setFarming(constants.AddressZero)).to.be.revertedWith(
      'ZERO_ADDRESS'
    );
  });
});
