import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, expect, upgrades } from 'hardhat';
import { MockERC20, SingleStaking } from '../../types';
import { BigNumber, constants } from 'ethers';

describe('Single Staking', () => {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let staking: SingleStaking;
  let stakingToken: MockERC20;
  let rewardToken: MockERC20;

  before(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    stakingToken = <MockERC20>await MockERC20.deploy('Staking', 'Staking');
    rewardToken = <MockERC20>await MockERC20.deploy('Reward', 'Reward');
  });

  describe('Staking', () => {
    const stakingAmount = BigNumber.from('1000');
    const stakingPeriod = 60 * 60 * 24 * 7 * 15;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStaking');
      staking = <SingleStaking>(
        await upgrades.deployProxy(Staking, [
          stakingToken.address,
          rewardToken.address,
        ])
      );

      await stakingToken.mint(owner.address, stakingAmount);
      await stakingToken.approve(staking.address, constants.MaxUint256);
    });
    it('should revert when locking period is not in proper window', async () => {
      const minStakingPeriod = await staking.MIN_STAKING_PERIOD();
      const maxStakingPeriod = await staking.MAX_STAKING_PERIOD();
      await expect(
        staking.lock(stakingAmount, minStakingPeriod.sub(1))
      ).to.be.revertedWith('InvalidStakingPeriod');
      await expect(
        staking.lock(stakingAmount, maxStakingPeriod.add(1))
      ).to.be.revertedWith('InvalidStakingPeriod');
    });
    it('should be able to stake tokens', async () => {
      await expect(staking.lock(stakingAmount, stakingPeriod)).to.be.emit(
        staking,
        'Staked'
      );

      const stakingInfo = await staking.stakes(owner.address);
      expect(stakingInfo.amount).to.be.equal(stakingAmount);
      expect(stakingInfo.stakingPeriod).to.be.equal(stakingPeriod);
      expect(stakingInfo.rewardDebt).to.be.equal(0);

      expect(await stakingToken.balanceOf(staking.address)).to.be.equal(
        stakingAmount
      );
    });
  });
  describe('Adding Rewards', () => {
    const rewardAmount = BigNumber.from('1000');
    const stakingAmount = BigNumber.from('1000');
    const stakingPeriod = 60 * 60 * 24 * 7 * 15;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStaking');
      staking = <SingleStaking>(
        await upgrades.deployProxy(Staking, [
          stakingToken.address,
          rewardToken.address,
        ])
      );

      await stakingToken.mint(owner.address, stakingAmount);
      await stakingToken.approve(staking.address, constants.MaxUint256);

      await rewardToken.mint(owner.address, rewardAmount);
      await rewardToken.approve(staking.address, constants.MaxUint256);
    });
    it('should revert adding rewards from non owners', async () => {
      await expect(
        staking.connect(user1).addRewards(rewardAmount)
      ).to.be.revertedWith('');
    });
    it('owner should be able to add rewards', async () => {
      await expect(staking.addRewards(rewardAmount)).to.be.emit(
        staking,
        'RewardsAdded'
      );

      expect(await rewardToken.balanceOf(staking.address)).to.be.equal(
        rewardAmount
      );
    });
  });

  describe('Unlocking', () => {
    const rewardAmount = BigNumber.from('1000');
    const stakingAmount = BigNumber.from('1000');
    const stakingPeriod = 60 * 60 * 24 * 7 * 15;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStaking');
      staking = <SingleStaking>(
        await upgrades.deployProxy(Staking, [
          stakingToken.address,
          rewardToken.address,
        ])
      );

      await stakingToken.mint(owner.address, stakingAmount);
      await stakingToken.approve(staking.address, constants.MaxUint256);
      await staking.lock(stakingAmount, stakingPeriod);

      await rewardToken.mint(owner.address, rewardAmount);
      await rewardToken.approve(staking.address, constants.MaxUint256);
      await staking.addRewards(rewardAmount);
    });
    it('should revert unlocking when never staked before', async () => {
      await expect(staking.connect(user1).unlock()).to.be.revertedWith(
        'NoStaking'
      );
    });
    it('should revert when it is in locking period', async () => {
      await expect(staking.unlock()).to.be.revertedWith('NotUnlocked');
    });
  });
});
