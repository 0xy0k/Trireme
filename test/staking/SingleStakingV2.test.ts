import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, expect, upgrades } from 'hardhat';
import { MockERC20, SingleStakingV2 } from '../../types';
import { BigNumber, constants, utils } from 'ethers';
import { evm_increaseTime } from '../helper';

describe('Single Staking', () => {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  let staking: SingleStakingV2;
  let stakingToken: MockERC20;
  let rewardToken: MockERC20;

  const ONE_MONTH = 60 * 60 * 24 * 7 * 4;
  const stakingPeriods = [
    ONE_MONTH * 3,
    ONE_MONTH * 6,
    ONE_MONTH * 12,
    ONE_MONTH * 12 * 4,
  ];

  const getKey = (user: string, period: number) => {
    const hash = utils.solidityPack(['address', 'uint8'], [user, period]);
    return utils.keccak256(utils.arrayify(hash));
  };

  before(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    stakingToken = <MockERC20>await MockERC20.deploy('Staking', 'Staking');
    rewardToken = <MockERC20>await MockERC20.deploy('Reward', 'Reward');
  });

  describe('StakingV2', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
    const periodIndex = 0;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStakingV2');
      staking = <SingleStakingV2>(
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
      await expect(staking.lock(stakingAmount, 100)).to.be.reverted;
    });
    it('should be able to stake tokens', async () => {
      await expect(staking.lock(stakingAmount, periodIndex)).to.be.emit(
        staking,
        'Staked'
      );

      const stakingInfo = await staking.getUserStake(
        owner.address,
        periodIndex
      );
      expect(stakingInfo.amount).to.be.equal(stakingAmount);
      expect(stakingInfo.stakingPeriod).to.be.equal(
        stakingPeriods[periodIndex]
      );
      expect(stakingInfo.rewardDebt).to.be.equal(0);

      expect(await stakingToken.balanceOf(staking.address)).to.be.equal(
        stakingAmount
      );

      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.equal(0);
    });
    it('should be able to get pending rewards', async () => {
      await staking.lock(stakingAmount, periodIndex);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user1.address, stakingAmount);
      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user1).lock(stakingAmount, periodIndex);

      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount, 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user1.address,
          periodIndex
        )
      ).to.be.equal(0);
    });
  });
  describe('Adding Rewards', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
    const periodIndex = 0;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStakingV2');
      staking = <SingleStakingV2>(
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
      await staking.lock(stakingAmount, periodIndex);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user1.address, stakingAmount);
      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user1).lock(stakingAmount, periodIndex);

      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount, 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user1.address,
          periodIndex
        )
      ).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user2.address, stakingAmount);
      await stakingToken
        .connect(user2)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user2).lock(stakingAmount, periodIndex);

      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount.add(rewardAmount.div(2)), 1000);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user1.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount.div(2), 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user2.address,
          periodIndex
        )
      ).to.be.equal(0);
    });
  });

  describe('Unlocking', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
    const periodIndex = 0;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStakingV2');
      staking = <SingleStakingV2>(
        await upgrades.deployProxy(Staking, [
          stakingToken.address,
          rewardToken.address,
        ])
      );

      await stakingToken.mint(owner.address, stakingAmount);
      await stakingToken.approve(staking.address, constants.MaxUint256);
      await staking.lock(stakingAmount, periodIndex);

      await rewardToken.mint(owner.address, rewardAmount);
      await rewardToken.approve(staking.address, constants.MaxUint256);
      await staking.addRewards(rewardAmount);
    });
    it('should revert unlocking when never staked before', async () => {
      await expect(
        staking.connect(user1).unlock(periodIndex)
      ).to.be.revertedWith('NoStaking');
    });
    it('should burn 50% staking amount when it is still in lock window', async () => {
      const beforeUserBal = await stakingToken.balanceOf(owner.address);
      const beforeStakingBal = await stakingToken.balanceOf(staking.address);
      await expect(staking.unlock(periodIndex))
        .to.emit(staking, 'Withdrawn')
        .withArgs(owner.address, stakingAmount.div(2));
      const afterUserBal = await stakingToken.balanceOf(owner.address);
      const afterStakingBal = await stakingToken.balanceOf(staking.address);
      expect(afterUserBal.sub(beforeUserBal)).to.be.equal(stakingAmount.div(2));
      expect(beforeStakingBal.sub(afterStakingBal)).to.be.equal(stakingAmount);
    });
    it('should be able to get pending rewards', async () => {
      const firstDelay = 60 * 60 * 24 * 7;
      await evm_increaseTime(firstDelay);
      await stakingToken.mint(user1.address, stakingAmount);
      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user1).lock(stakingAmount, periodIndex);

      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount, 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user1.address,
          periodIndex
        )
      ).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);

      await stakingToken.mint(user2.address, stakingAmount);
      await stakingToken
        .connect(user2)
        .approve(staking.address, constants.MaxUint256);
      await staking.connect(user2).lock(stakingAmount, periodIndex);

      const pendingReward1 = await staking['pendingRewards(address,uint8)'](
        owner.address,
        periodIndex
      );
      expect(pendingReward1).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        1000
      );
      const pendingReward2 = await staking['pendingRewards(address,uint8)'](
        user1.address,
        periodIndex
      );
      expect(pendingReward2).to.be.closeTo(rewardAmount.div(2), 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user2.address,
          periodIndex
        )
      ).to.be.equal(0);

      await evm_increaseTime(stakingPeriods[periodIndex] - firstDelay);
      const rewardOwnerBalBefore = await rewardToken.balanceOf(owner.address);
      await staking.unlock(periodIndex);
      expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
        rewardOwnerBalBefore.add(pendingReward1)
      );

      const rewardUser1BalBefore = await rewardToken.balanceOf(user1.address);
      await staking.connect(user1).claim(periodIndex);
      expect(await rewardToken.balanceOf(user1.address)).to.be.equal(
        rewardUser1BalBefore.add(pendingReward2)
      );
    });
  });
  describe('Add more staking', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
    const periodIndex = 0;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStakingV2');
      staking = <SingleStakingV2>(
        await upgrades.deployProxy(Staking, [
          stakingToken.address,
          rewardToken.address,
        ])
      );

      await stakingToken.mint(owner.address, stakingAmount);
      await stakingToken.approve(staking.address, constants.MaxUint256);
      await staking.lock(stakingAmount, periodIndex);

      await rewardToken.mint(owner.address, rewardAmount);
      await rewardToken.approve(staking.address, constants.MaxUint256);
      await staking.addRewards(rewardAmount);

      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);

      await staking.enableMoreStaking(true);
    });
    it('should revert staking more when never staked before', async () => {
      await expect(
        staking.connect(user1).unlock(periodIndex)
      ).to.be.revertedWith('NoStaking');
    });
    it('should be able to get pending rewards', async () => {
      const firstDelay = 60 * 60 * 24 * 7;
      await evm_increaseTime(firstDelay);
      await stakingToken.mint(user1.address, stakingAmount);
      await staking.connect(user1).lock(stakingAmount, periodIndex);

      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount, 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user1.address,
          periodIndex
        )
      ).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);
      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount.add(rewardAmount.div(2)), 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user1.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount.div(2), 1000);

      await stakingToken.mint(owner.address, stakingAmount);
      await staking.addMoreStaking(stakingAmount, periodIndex);

      let pendingReward1 = await staking['pendingRewards(address,uint8)'](
        owner.address,
        periodIndex
      );
      let pendingReward2 = await staking['pendingRewards(address,uint8)'](
        user1.address,
        periodIndex
      );
      console.log(pendingReward1.toString(), pendingReward2.toString());
      expect(pendingReward1).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        10000
      );
      expect(pendingReward2).to.be.closeTo(rewardAmount.div(2), 1000);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);

      pendingReward1 = await staking['pendingRewards(address,uint8)'](
        owner.address,
        periodIndex
      );
      pendingReward2 = await staking['pendingRewards(address,uint8)'](
        user1.address,
        periodIndex
      );
      console.log(pendingReward1.toString(), pendingReward2.toString());
      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.equal(pendingReward1);
    });
  });
  describe('Extend staking period', () => {
    const rewardAmount = ethers.utils.parseEther('10');
    const stakingAmount = ethers.utils.parseEther('1000');
    const periodIndex = 0;
    beforeEach(async () => {
      const Staking = await ethers.getContractFactory('SingleStakingV2');
      staking = <SingleStakingV2>(
        await upgrades.deployProxy(Staking, [
          stakingToken.address,
          rewardToken.address,
        ])
      );

      await stakingToken.mint(owner.address, stakingAmount);
      await stakingToken.approve(staking.address, constants.MaxUint256);
      await staking.lock(stakingAmount, periodIndex);

      await rewardToken.mint(owner.address, rewardAmount);
      await rewardToken.approve(staking.address, constants.MaxUint256);
      await staking.addRewards(rewardAmount);

      await stakingToken
        .connect(user1)
        .approve(staking.address, constants.MaxUint256);

      await staking.enableExtendPeriod(true);
    });
    it('should revert staking more when never staked before', async () => {
      await expect(
        staking.connect(user1).extendStakingPeriod(periodIndex, periodIndex + 1)
      ).to.be.revertedWith('NoStaking');
    });
    it('should be able to get pending rewards', async () => {
      const firstDelay = 60 * 60 * 24 * 7;
      await evm_increaseTime(firstDelay);
      await stakingToken.mint(user1.address, stakingAmount);
      await staking.connect(user1).lock(stakingAmount, periodIndex);

      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.closeTo(rewardAmount, 100);
      expect(
        await staking['pendingRewards(address,uint8)'](
          user1.address,
          periodIndex
        )
      ).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);
      let pendingReward1 = await staking['pendingRewards(address,uint8)'](
        owner.address,
        periodIndex
      );
      let pendingReward2 = await staking['pendingRewards(address,uint8)'](
        user1.address,
        periodIndex
      );
      expect(pendingReward1).to.be.closeTo(
        rewardAmount.add(rewardAmount.div(2)),
        100
      );
      expect(pendingReward2).to.be.closeTo(rewardAmount.div(2), 1000);

      const rewardBalBefore = await rewardToken.balanceOf(owner.address);
      await staking.extendStakingPeriod(periodIndex, periodIndex + 1);
      expect(await rewardToken.balanceOf(owner.address)).to.be.equal(
        rewardBalBefore.add(pendingReward1)
      );
      expect(
        await staking['pendingRewards(address,uint8)'](
          owner.address,
          periodIndex
        )
      ).to.be.equal(0);

      await rewardToken.mint(owner.address, rewardAmount);
      await staking.addRewards(rewardAmount);

      pendingReward1 = await staking['pendingRewards(address,uint8)'](
        owner.address,
        periodIndex + 1
      );
      pendingReward2 = await staking['pendingRewards(address,uint8)'](
        user1.address,
        periodIndex
      );
      expect(pendingReward1).to.be.closeTo(rewardAmount.div(3).mul(2), 10000);
      expect(pendingReward2).to.be.closeTo(
        rewardAmount.div(3).add(rewardAmount.div(2)),
        1000
      );
    });
  });
});
