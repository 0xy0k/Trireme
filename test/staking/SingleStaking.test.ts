import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, expect, upgrades } from 'hardhat';
import { MockERC20, SingleStaking } from '../../types';
import { BigNumber, constants } from 'ethers';
import { evm_increaseTime } from '../helper';

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
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
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

      expect(await staking.pendingRewards(owner.address)).to.be.equal(0);
    });
    it('should be able to get pending rewards', async () => {
      await staking.lock(stakingAmount, stakingPeriod);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user1.address, stakingAmount);
      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user1).lock(stakingAmount, stakingPeriod);

      expect(await staking.pendingRewards(owner.address)).to.be.closeTo(
        rewardAmount,
        100
      );
      expect(await staking.pendingRewards(user1.address)).to.be.equal(0);
    });
  });
  describe('Adding Rewards', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
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
    it('should be able to get pending rewards', async () => {
      await staking.lock(stakingAmount, stakingPeriod);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user1.address, stakingAmount);
      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user1).lock(stakingAmount, stakingPeriod);

      expect(await staking.pendingRewards(owner.address)).to.be.closeTo(
        rewardAmount,
        100
      );
      expect(await staking.pendingRewards(user1.address)).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user2.address, stakingAmount);
      await stakingToken
        .connect(user2)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user2).lock(stakingAmount, stakingPeriod);

      expect(await staking.pendingRewards(owner.address)).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        1000
      );
      expect(await staking.pendingRewards(user1.address)).to.be.closeTo(
        rewardAmount.div(2),
        100
      );
      expect(await staking.pendingRewards(user2.address)).to.be.equal(0);
    });
  });

  describe('Unlocking', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
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
    it('should be able to get pending rewards', async () => {
      const firstDelay = 60 * 60 * 24 * 7;
      await evm_increaseTime(firstDelay);
      await stakingToken.mint(user1.address, stakingAmount);
      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user1).lock(stakingAmount, stakingPeriod);

      expect(await staking.pendingRewards(owner.address)).to.be.closeTo(
        rewardAmount,
        100
      );
      expect(await staking.pendingRewards(user1.address)).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user2.address, stakingAmount);
      await stakingToken
        .connect(user2)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user2).lock(stakingAmount, stakingPeriod);

      const pendingReward1 = await staking.pendingRewards(owner.address);
      expect(pendingReward1).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        1000
      );
      const pendingReward2 = await staking.pendingRewards(user1.address);
      expect(pendingReward2).to.be.closeTo(rewardAmount.div(2), 100);
      expect(await staking.pendingRewards(user2.address)).to.be.equal(0);

      await evm_increaseTime(stakingPeriod - firstDelay);
      const rewardOwnerBalBefore = await rewardToken.balanceOf(owner.address);
      await staking.unlock();
      expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
        rewardOwnerBalBefore.add(pendingReward1)
      );

      await expect(staking.connect(user1).unlock()).to.be.revertedWith(
        'NotUnlocked'
      );

      const rewardUser1BalBefore = await rewardToken.balanceOf(user1.address);
      await staking.connect(user1).claim();
      expect(await rewardToken.balanceOf(user1.address)).to.be.equal(
        rewardUser1BalBefore.add(pendingReward2)
      );
    });
  });
  describe('Add more staking', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
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

      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
    });
    it('should revert staking more when never staked before', async () => {
      await expect(staking.connect(user1).unlock()).to.be.revertedWith(
        'NoStaking'
      );
    });
    it('should be able to get pending rewards', async () => {
      const firstDelay = 60 * 60 * 24 * 7;
      await evm_increaseTime(firstDelay);
      await stakingToken.mint(user1.address, stakingAmount);
      await staking.connect(user1).lock(stakingAmount, stakingPeriod);

      expect(await staking.pendingRewards(owner.address)).to.be.closeTo(
        rewardAmount,
        100
      );
      expect(await staking.pendingRewards(user1.address)).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);
      await staking.updateRewards();
      expect(await staking.pendingRewards(owner.address)).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        100
      );
      expect(await staking.pendingRewards(user1.address)).to.be.closeTo(
        rewardAmount.div(2),
        1000
      );

      await stakingToken.mint(owner.address, stakingAmount);
      await staking.addMoreStaking(stakingAmount);
      await staking.updateRewards();

      let pendingReward1 = await staking.pendingRewards(owner.address);
      let pendingReward2 = await staking.pendingRewards(user1.address);
      console.log(pendingReward1.toString(), pendingReward2.toString());
      expect(pendingReward1).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        10000
      );
      expect(pendingReward2).to.be.closeTo(rewardAmount.div(2), 1000);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);
      await staking.updateRewards();

      pendingReward1 = await staking.pendingRewards(owner.address);
      pendingReward2 = await staking.pendingRewards(user1.address);
      console.log(pendingReward1.toString(), pendingReward2.toString());
      expect(await staking.pendingRewards(owner.address)).to.be.equal(
        pendingReward1
      );
    });
  });
  describe('Extend staking period', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
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

      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
    });
    it('should revert staking more when never staked before', async () => {
      await expect(
        staking.connect(user1).extendStakingPeriod(stakingPeriod)
      ).to.be.revertedWith('NoStaking');
    });
    it('should be able to get pending rewards', async () => {
      const firstDelay = 60 * 60 * 24 * 7;
      await evm_increaseTime(firstDelay);
      await stakingToken.mint(user1.address, stakingAmount);
      await staking.connect(user1).lock(stakingAmount, stakingPeriod);

      expect(await staking.pendingRewards(owner.address)).to.be.closeTo(
        rewardAmount,
        100
      );
      expect(await staking.pendingRewards(user1.address)).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);
      await staking.updateRewards();
      let pendingReward1 = await staking.pendingRewards(owner.address);
      let pendingReward2 = await staking.pendingRewards(user1.address);
      expect(pendingReward1).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        100
      );
      expect(pendingReward2).to.be.closeTo(rewardAmount.div(2), 1000);

      const rewardBalBefore = await rewardToken.balanceOf(owner.address);
      await staking.extendStakingPeriod(stakingPeriod * 2);
      expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
        rewardBalBefore.add(pendingReward1)
      );
      expect(await staking.pendingRewards(owner.address)).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);
      await staking.updateRewards();

      pendingReward1 = await staking.pendingRewards(owner.address);
      pendingReward2 = await staking.pendingRewards(user1.address);
      expect(pendingReward1).to.be.closeTo(rewardAmount.div(3).mul(2), 10000);
      expect(pendingReward2).to.be.closeTo(
        rewardAmount.div(3).add(rewardAmount.div(2)),
        1000
      );
    });
  });
});
