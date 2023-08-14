import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import W3_UniswapV2Factory from '@uniswap/v2-core/build/UniswapV2Factory.json';
import W3_UniswapV2Router02 from '@uniswap/v2-periphery/build/UniswapV2Router02.json';
import W3_UniswapV2Pair from '@uniswap/v2-core/build/UniswapV2Pair.json';

import { getTimeStamp, increaseTime } from '../helper';

import { Guardian } from './../types/contracts/token/Guardian';
import { Trireme } from './../types/contracts/token/Trireme';
import { WETH9 } from './../types/contracts/mocks/WETH.sol/WETH9';
import { MockToken } from './../types/contracts/mocks/MockToken';
import { MockRewardRecipient } from './../types/contracts/mocks/MockRewardRecipient';

describe('Guardian', function () {
  let deployer: SignerWithAddress;
  let trader: SignerWithAddress;
  let holder: SignerWithAddress;
  let treasury: SignerWithAddress;

  let uniswapv2Factory: Contract;
  let uniswapv2Router: Contract;
  let uniswapv2Pair: Contract;

  let guardian: Guardian;
  let liquidityFeeReceiver: MockRewardRecipient;
  let marketingFeeReceiver: MockRewardRecipient;

  let trireme: Trireme;
  let weth: WETH9;
  let usdc: MockToken;

  let ethAmount = ethers.utils.parseEther('100');
  let usdcAmount = ethers.utils.parseEther('1000000');
  let triremeAmount = ethers.utils.parseEther('100000');

  let guardianFee = 200; // 2%
  let liquidityFee = 200; // 2%
  let marketingFee = 200; // 2%
  let multiplier = 10000; // 100%

  let pricePerGuardian = ethers.utils.parseEther('12');
  let txnFee = ethers.utils.parseEther('15'); // 15$
  let claimFee = 2000; // 20%
  let mintLimit = 100; // up to 100 guardians

  const sizes = [1, 5, 10, 25, 50, 100];
  const tokenIdFromSize = (size: number) => {
    switch (size) {
      case 1:
        return 0;
      case 5:
        return 1;
      case 10:
        return 2;
      case 25:
        return 3;
      case 50:
        return 4;
      case 100:
        return 5;
      default:
        return -1;
    }
  };

  this.beforeEach(async function () {
    [deployer, trader, holder, treasury] = await ethers.getSigners();

    /// WETH
    const WETH = await ethers.getContractFactory('WETH9');
    weth = (await WETH.deploy()) as WETH9;

    /// UniswapV2Factory
    const UniswapV2FactoryContract = await ethers.getContractFactory(
      W3_UniswapV2Factory.abi,
      W3_UniswapV2Factory.bytecode
    );
    const deployedUniswapV2Factory = await UniswapV2FactoryContract.deploy(
      deployer.address
    );

    await deployedUniswapV2Factory.deployed();

    uniswapv2Factory = await ethers.getContractAt(
      W3_UniswapV2Factory.abi,
      deployedUniswapV2Factory.address
    );

    /// UniswapV2Router
    const UniswapV2RouterContract = await ethers.getContractFactory(
      W3_UniswapV2Router02.abi,
      W3_UniswapV2Router02.bytecode
    );
    const deployedUniswapV2Router = await UniswapV2RouterContract.deploy(
      uniswapv2Factory.address,
      weth.address
    );

    await deployedUniswapV2Router.deployed();

    uniswapv2Router = await ethers.getContractAt(
      W3_UniswapV2Router02.abi,
      deployedUniswapV2Router.address
    );

    /// USDC
    const USDC = await ethers.getContractFactory('MockToken');
    usdc = (await USDC.deploy('USDC', 'USDC')) as MockToken;

    /// Trireme
    const Trireme = await ethers.getContractFactory('Trireme');
    trireme = (await Trireme.deploy(uniswapv2Router.address)) as Trireme;

    /// Fee Receiver
    const MockRewardRecipient = await ethers.getContractFactory(
      'MockRewardRecipient'
    );
    liquidityFeeReceiver =
      (await MockRewardRecipient.deploy()) as MockRewardRecipient;
    marketingFeeReceiver =
      (await MockRewardRecipient.deploy()) as MockRewardRecipient;
    await trireme.setLiquidityFeeReceiver(liquidityFeeReceiver.address);
    await trireme.setMarketingFeeReceiver(marketingFeeReceiver.address);

    /// Guardian
    const Guardian = await ethers.getContractFactory('Guardian');
    guardian = (await Guardian.deploy(
      trireme.address,
      usdc.address,
      uniswapv2Router.address,
      treasury.address
    )) as Guardian;

    await trireme.setGuardianFeeReceiver(guardian.address);
    await trireme.grantRole(await trireme.MINTER_ROLE(), guardian.address);

    /// Add Liquidity
    const deadline = (await getTimeStamp()) + 3600;

    await usdc.mint(deployer.address, usdcAmount);
    await usdc.approve(uniswapv2Router.address, ethers.constants.MaxUint256);

    await uniswapv2Router.addLiquidityETH(
      usdc.address,
      usdcAmount,
      0,
      0,
      deployer.address,
      deadline,
      { value: ethAmount }
    );
    await trireme.approve(uniswapv2Router.address, ethers.constants.MaxUint256);

    await uniswapv2Router.addLiquidityETH(
      trireme.address,
      triremeAmount,
      0,
      0,
      deployer.address,
      deadline,
      { value: ethAmount }
    );

    uniswapv2Pair = await ethers.getContractAt(
      W3_UniswapV2Pair.abi,
      await uniswapv2Factory.getPair(trireme.address, weth.address)
    );
  });

  describe('#configuration', () => {
    it('uri', async function () {
      expect(await guardian.uri(BigNumber.from(0))).equal(
        'https://trireme.io/api/guardian/0.json'
      );
      expect(await guardian.uri(BigNumber.from(5))).equal(
        'https://trireme.io/api/guardian/5.json'
      );
      expect(await guardian.uri(BigNumber.from(6))).equal(
        'https://trireme.io/api/guardian/'
      );
    });
    it('trireme', async function () {
      expect(await guardian.TRIREME()).equal(trireme.address);
    });
    it('usdc', async function () {
      expect(await guardian.USDC()).equal(usdc.address);
    });
    it('router', async function () {
      expect(await guardian.ROUTER()).equal(uniswapv2Router.address);
    });
    it('price per guardian', async function () {
      expect(await guardian.pricePerGuardian()).equal(pricePerGuardian);
    });
    it('treasury', async function () {
      expect(await guardian.treasury()).equal(treasury.address);
    });
    it('txn fee', async function () {
      expect(await guardian.txnFee()).equal(txnFee);
    });
    it('claim fee', async function () {
      expect(await guardian.claimFee()).equal(claimFee);
    });
    it('mint limit', async function () {
      expect(await guardian.mintLimit()).equal(mintLimit);
    });
    it('total supply', async function () {
      expect(await guardian.totalSupply()).equal(ethers.constants.Zero);
    });
    it('reward rate', async function () {
      expect(await guardian.rewardRate()).eql([
        ethers.utils.parseEther('0.1').div(86400),
        BigNumber.from(250000),
      ]);
    });
    it('all fee tokens', async function () {
      expect(await guardian.allFeeTokens()).eql([usdc.address]);
    });
  });

  describe('#ownable', () => {
    it('set mint limit', async function () {
      const newMintLimit = 1000;

      await expect(
        guardian.connect(trader).setMintLimit(newMintLimit)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      const tx = await guardian.setMintLimit(newMintLimit);
      await expect(tx).to.emit(guardian, 'MintLimit').withArgs(newMintLimit);

      expect(await guardian.mintLimit()).equal(newMintLimit);
    });
    it('set treasury', async function () {
      const newTreasury = holder.address;

      await expect(
        guardian.connect(trader).setTreasury(newTreasury)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      const tx = await guardian.setTreasury(newTreasury);
      await expect(tx).to.emit(guardian, 'Treasury').withArgs(newTreasury);

      expect(await guardian.treasury()).equal(newTreasury);
    });
    it('set txn fee', async function () {
      const newFee = ethers.utils.parseEther('100'); // 100$

      await expect(
        guardian.connect(trader).setTxnFee(newFee)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      const tx = await guardian.setTxnFee(newFee);
      await expect(tx).to.emit(guardian, 'TxnFee').withArgs(newFee);

      expect(await guardian.txnFee()).equal(newFee);
    });
    it('set claim fee', async function () {
      const newFee = 1000; // 10%

      await expect(
        guardian.connect(trader).setClaimFee(newFee)
      ).to.be.revertedWith('Ownable: caller is not the owner');

      const tx = await guardian.setClaimFee(newFee);
      await expect(tx).to.emit(guardian, 'ClaimFee').withArgs(newFee);

      expect(await guardian.claimFee()).equal(newFee);
    });
    it('add fee tokens', async function () {
      const tokens = [trireme.address];

      const tx = await guardian.addFeeTokens(tokens);
      await expect(tx).to.emit(guardian, 'AddFeeTokens').withArgs(tokens);

      expect(await guardian.allFeeTokens()).eql([usdc.address, trireme.address]);
    });
    it('remove fee tokens', async function () {
      const tokens = [usdc.address];

      const tx = await guardian.removeFeeTokens(tokens);
      await expect(tx).to.emit(guardian, 'RemoveFeeTokens').withArgs(tokens);

      expect(await guardian.allFeeTokens()).eql([]);
    });
  });

  describe('#receive reward', () => {
    const amount = ethers.utils.parseEther('100');
    const transferAmount = ethers.utils.parseEther('60');
    const guardianTaxAmount = transferAmount.mul(guardianFee).div(multiplier);
    const liquidityTaxAmount = transferAmount.mul(liquidityFee).div(multiplier);
    const marketingTaxAmount = transferAmount.mul(marketingFee).div(multiplier);
    const taxAmount = guardianTaxAmount
      .add(liquidityTaxAmount)
      .add(marketingTaxAmount);
    let guardianETH: BigNumber;
    let amountUSDC: BigNumber;
    let deadline: number;

    beforeEach(async function () {
      await trireme.mint(trader.address, amount);

      const ethOut = await uniswapv2Router.getAmountOut(
        guardianTaxAmount.add(marketingTaxAmount),
        triremeAmount,
        ethAmount
      );
      guardianETH = ethOut
        .mul(guardianTaxAmount)
        .div(guardianTaxAmount.add(marketingTaxAmount));

      amountUSDC = await uniswapv2Router.getAmountOut(
        guardianETH,
        ethAmount,
        usdcAmount
      );

      deadline = (await getTimeStamp()) + 3600;
    });

    it('sell trireme - send eth to guardian and swap to usdc', async function () {
      console.log(
        'Before Guardian USDC Balance: ',
        (await usdc.balanceOf(guardian.address)).toString()
      );

      await trireme.setSwapTaxSettings(true, taxAmount);

      await trireme
        .connect(trader)
        .approve(uniswapv2Router.address, ethers.constants.MaxUint256);

      const tx = await uniswapv2Router
        .connect(trader)
        .swapExactTokensForTokensSupportingFeeOnTransferTokens(
          transferAmount,
          0,
          [trireme.address, weth.address],
          holder.address,
          deadline
        );
      await expect(tx)
        .to.emit(trireme, 'Transfer')
        .withArgs(trader.address, trireme.address, taxAmount);
      await expect(tx)
        .to.emit(trireme, 'Transfer')
        .withArgs(
          trader.address,
          uniswapv2Pair.address,
          transferAmount.sub(taxAmount)
        );
      await expect(tx)
        .to.emit(trireme, 'Transfer')
        .withArgs(
          trireme.address,
          uniswapv2Pair.address,
          guardianTaxAmount.add(marketingTaxAmount)
        );

      expect(await trireme.balanceOf(trader.address)).equal(
        amount.sub(transferAmount)
      );
      expect(await trireme.balanceOf(trireme.address)).equal(
        ethers.constants.Zero
      );
      expect(await usdc.balanceOf(guardian.address)).equal(amountUSDC);

      console.log(
        'After Guardian USDC Balance: ',
        (await usdc.balanceOf(guardian.address)).toString()
      );
    });
  });

  describe('#mint + #split', () => {
    const amount = ethers.utils.parseEther('100');
    const transferAmount = ethers.utils.parseEther('60');
    const guardianTaxAmount = transferAmount.mul(guardianFee).div(multiplier);
    const liquidityTaxAmount = transferAmount.mul(liquidityFee).div(multiplier);
    const marketingTaxAmount = transferAmount.mul(marketingFee).div(multiplier);
    const taxAmount = guardianTaxAmount
      .add(liquidityTaxAmount)
      .add(marketingTaxAmount);
    let guardianETH: BigNumber;
    let deadline: number;

    beforeEach(async function () {
      await trireme.mint(trader.address, amount);
      await usdc.mint(deployer.address, usdcAmount);

      const ethOut = await uniswapv2Router.getAmountOut(
        guardianTaxAmount.add(marketingTaxAmount),
        triremeAmount,
        ethAmount
      );
      guardianETH = ethOut
        .mul(guardianTaxAmount)
        .div(guardianTaxAmount.add(marketingTaxAmount));

      deadline = (await getTimeStamp()) + 3600;

      await trireme.setSwapTaxSettings(true, taxAmount);
      await trireme
        .connect(trader)
        .approve(uniswapv2Router.address, ethers.constants.MaxUint256);
      await uniswapv2Router
        .connect(trader)
        .swapExactTokensForTokensSupportingFeeOnTransferTokens(
          transferAmount,
          0,
          [trireme.address, weth.address],
          holder.address,
          deadline
        );

      await trireme.approve(guardian.address, ethers.constants.MaxUint256);
      await usdc.approve(guardian.address, ethers.constants.MaxUint256);
    });

    it('to zero address', async function () {
      await expect(
        guardian.mint(ethers.constants.AddressZero, usdc.address, 1)
      ).to.be.revertedWith('INVALID_ADDRESS()');
    });
    it('zero amount or exceed limit', async function () {
      await expect(
        guardian.mint(trader.address, usdc.address, 0)
      ).to.be.revertedWith('INVALID_AMOUNT()');
      await expect(
        guardian.mint(trader.address, usdc.address, mintLimit + 1)
      ).to.be.revertedWith('INVALID_AMOUNT()');
    });
    it('invalid fee token', async function () {
      await expect(
        guardian.mint(trader.address, trireme.address, 1)
      ).to.be.revertedWith('INVALID_FEE_TOKEN()');
    });
    it('fee pay & trireme burning & balance', async function () {
      let totalAmount = 0;

      for (let amount of sizes) {
        const tx = await guardian.mint(trader.address, usdc.address, amount);

        await expect(tx)
          .to.emit(guardian, 'Mint')
          .withArgs(deployer.address, trader.address, amount);
        await expect(tx)
          .to.emit(usdc, 'Transfer')
          .withArgs(deployer.address, treasury.address, txnFee);
        await expect(tx)
          .to.emit(trireme, 'Transfer')
          .withArgs(
            deployer.address,
            ethers.constants.AddressZero,
            pricePerGuardian.mul(amount)
          );

        totalAmount += amount;
        expect(await guardian.totalBalanceOf(trader.address)).equal(
          totalAmount
        );

        for (let amount_ of sizes) {
          expect(
            await guardian.balanceOf(trader.address, tokenIdFromSize(amount_))
          ).equal(amount_ <= amount ? 1 : 0);
        }
      }

      let totalAmount_ = 0;

      for (let amount of sizes) {
        const tx = await guardian.connect(trader).split(holder.address, amount);

        await expect(tx)
          .to.emit(guardian, 'Split')
          .withArgs(trader.address, holder.address, amount);

        totalAmount -= amount;
        totalAmount_ += amount;
        expect(await guardian.totalBalanceOf(trader.address)).equal(
          totalAmount
        );
        expect(await guardian.totalBalanceOf(holder.address)).equal(
          totalAmount_
        );

        for (let amount_ of sizes) {
          expect(
            await guardian.balanceOf(trader.address, tokenIdFromSize(amount_))
          ).equal(amount_ <= amount ? 0 : 1);
          expect(
            await guardian.balanceOf(holder.address, tokenIdFromSize(amount_))
          ).equal(amount_ <= amount ? 1 : 0);
        }
      }
    });
    describe('grouping - mint', () => {
      it('mint 1', async function () {
        await guardian.mint(trader.address, usdc.address, 1);
        expect(await guardian.totalBalanceOf(trader.address)).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(1);
      });
      it('mint 2', async function () {
        await guardian.mint(trader.address, usdc.address, 2);
        expect(await guardian.totalBalanceOf(trader.address)).equal(2);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(2);
      });
      it('mint 3', async function () {
        await guardian.mint(trader.address, usdc.address, 3);
        expect(await guardian.totalBalanceOf(trader.address)).equal(3);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(3);
      });
      it('mint 4', async function () {
        await guardian.mint(trader.address, usdc.address, 4);
        expect(await guardian.totalBalanceOf(trader.address)).equal(4);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(4);
      });
      it('mint 5', async function () {
        await guardian.mint(trader.address, usdc.address, 1);
        await guardian.mint(trader.address, usdc.address, 4);
        expect(await guardian.totalBalanceOf(trader.address)).equal(5);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(5))
        ).equal(1);
      });
      it('mint 6', async function () {
        await guardian.mint(trader.address, usdc.address, 3);
        await guardian.mint(trader.address, usdc.address, 3);
        expect(await guardian.totalBalanceOf(trader.address)).equal(6);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(5))
        ).equal(1);
      });
      it('mint 96', async function () {
        await guardian.mint(trader.address, usdc.address, 70);
        await guardian.mint(trader.address, usdc.address, 26);
        expect(await guardian.totalBalanceOf(trader.address)).equal(96);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(5))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(10))
        ).equal(2);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(25))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(50))
        ).equal(1);
      });
      it('mint 550', async function () {
        await guardian.mint(trader.address, usdc.address, 35);
        await guardian.mint(trader.address, usdc.address, 35);
        await guardian.mint(trader.address, usdc.address, 80);
        await guardian.mint(trader.address, usdc.address, 100);
        await guardian.mint(trader.address, usdc.address, 100);
        await guardian.mint(trader.address, usdc.address, 100);
        await guardian.mint(trader.address, usdc.address, 100);
        expect(await guardian.totalBalanceOf(trader.address)).equal(550);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(5))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(10))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(25))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(50))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(100))
        ).equal(5);
      });
    });
    describe('grouping - split', () => {
      beforeEach(async function () {
        await guardian.mint(trader.address, usdc.address, 35);
        await guardian.mint(trader.address, usdc.address, 35);
        await guardian.mint(trader.address, usdc.address, 80);
        await guardian.mint(trader.address, usdc.address, 100);
        await guardian.mint(trader.address, usdc.address, 100);
        await guardian.mint(trader.address, usdc.address, 100);
        await guardian.mint(trader.address, usdc.address, 100);
      });
      it('split 10', async function () {
        await guardian.connect(trader).split(holder.address, 10);

        expect(await guardian.totalBalanceOf(trader.address)).equal(540);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(5))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(10))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(25))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(50))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(100))
        ).equal(5);

        expect(await guardian.totalBalanceOf(holder.address)).equal(10);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(10))
        ).equal(1);
      });
      it('split 90', async function () {
        await guardian.connect(trader).split(holder.address, 90);

        expect(await guardian.totalBalanceOf(trader.address)).equal(460);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(5))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(10))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(25))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(50))
        ).equal(1);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(100))
        ).equal(4);

        expect(await guardian.totalBalanceOf(holder.address)).equal(90);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(5))
        ).equal(1);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(10))
        ).equal(1);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(25))
        ).equal(1);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(50))
        ).equal(1);
      });
      it('split 550', async function () {
        await guardian.connect(trader).split(holder.address, 550);

        expect(await guardian.totalBalanceOf(trader.address)).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(1))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(5))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(10))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(25))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(50))
        ).equal(0);
        expect(
          await guardian.balanceOf(trader.address, tokenIdFromSize(100))
        ).equal(0);

        expect(await guardian.totalBalanceOf(holder.address)).equal(550);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(1))
        ).equal(0);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(5))
        ).equal(0);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(10))
        ).equal(0);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(25))
        ).equal(0);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(50))
        ).equal(1);
        expect(
          await guardian.balanceOf(holder.address, tokenIdFromSize(100))
        ).equal(5);
      });
    });
  });

  describe('#reward + #compound', () => {
    const transferAmount = ethers.utils.parseEther('60');
    const guardianTaxAmount = transferAmount.mul(guardianFee).div(multiplier);
    const liquidityTaxAmount = transferAmount.mul(liquidityFee).div(multiplier);
    const marketingTaxAmount = transferAmount.mul(marketingFee).div(multiplier);
    const taxAmount = guardianTaxAmount
      .add(liquidityTaxAmount)
      .add(marketingTaxAmount);
    let deadline: number;

    beforeEach(async function () {
      await trireme.mint(trader.address, transferAmount);
      await usdc.mint(deployer.address, usdcAmount);

      await trireme.approve(guardian.address, ethers.constants.MaxUint256);
      await usdc.approve(guardian.address, ethers.constants.MaxUint256);

      await guardian.mint(trader.address, usdc.address, 10);
      await guardian.mint(holder.address, usdc.address, 1);

      const ethOut = await uniswapv2Router.getAmountOut(
        guardianTaxAmount.add(marketingTaxAmount),
        triremeAmount,
        ethAmount
      );

      deadline = (await getTimeStamp()) + 3600;

      await trireme.setSwapTaxSettings(true, taxAmount);
      await trireme
        .connect(trader)
        .approve(uniswapv2Router.address, ethers.constants.MaxUint256);
      await uniswapv2Router
        .connect(trader)
        .swapExactTokensForTokensSupportingFeeOnTransferTokens(
          transferAmount,
          0,
          [trireme.address, weth.address],
          holder.address,
          deadline
        );
    });

    it('trireme pending reward', async function () {
      await increaseTime(86400); // 1 day

      console.log(
        'Trireme pending: ',
        (await guardian.pendingReward(trader.address))[0].toString(),
        (await guardian.pendingReward(holder.address))[0].toString()
      );

      expect((await guardian.pendingReward(trader.address))[0]).gt(
        ethers.utils.parseEther('0.1').mul(10).mul(80).div(100)
      );
      expect((await guardian.pendingReward(holder.address))[0]).gt(
        ethers.utils.parseEther('0.1').mul(80).div(100)
      );
    });

    it('claim trireme', async function () {
      await increaseTime(86400); // 1 day

      await guardian.connect(trader).claim();
      await guardian.connect(holder).claim();

      console.log(
        'Trireme claimed: ',
        (await trireme.balanceOf(trader.address)).toString(),
        (await trireme.balanceOf(holder.address)).toString()
      );
      console.log(
        'Trireme pending: ',
        (await guardian.pendingReward(trader.address))[0].toString(),
        (await guardian.pendingReward(holder.address))[0].toString()
      );

      expect(await trireme.balanceOf(trader.address)).gt(
        ethers.utils.parseEther('0.1').mul(10).mul(80).div(100)
      );
      expect(await trireme.balanceOf(holder.address)).gt(
        ethers.utils.parseEther('0.1').mul(80).div(100)
      );

      console.log(
        'Treasury: ',
        (await trireme.balanceOf(treasury.address)).toString()
      );
      expect(await trireme.balanceOf(treasury.address)).gt(
        ethers.utils
          .parseEther('0.1')
          .mul(10)
          .mul(20)
          .div(100)
          .add(ethers.utils.parseEther('0.1').mul(20).div(100))
      );
    });

    it('trireme reward rate', async function () {
      let oldRate = await guardian.rewardRate();

      console.log(
        'Old Reward Rate: ',
        oldRate.rewardPerSec.toString(),
        oldRate.numberOfGuardians.toString()
      );

      await guardian.setMintLimit(oldRate.numberOfGuardians);
      await guardian.mint(
        deployer.address,
        usdc.address,
        oldRate.numberOfGuardians
      );

      let newRate = await guardian.rewardRate();

      console.log(
        'New Reward Rate: ',
        newRate.rewardPerSec.toString(),
        newRate.numberOfGuardians.toString()
      );

      await increaseTime(86400); // 1 day

      console.log(
        'Trireme pending: ',
        (await guardian.pendingReward(deployer.address))[0].toString()
      );

      expect((await guardian.pendingReward(deployer.address))[0]).lt(
        ethers.utils
          .parseEther('0.1')
          .mul(oldRate.numberOfGuardians)
          .mul(80)
          .div(100)
      );
      expect((await guardian.pendingReward(deployer.address))[0]).gte(
        ethers.utils
          .parseEther('0.05')
          .div(86400)
          .mul(86400)
          .mul(oldRate.numberOfGuardians)
          .mul(80)
          .div(100)
      );
    });

    it('usdc pending reward', async function () {
      let fee = await usdc.balanceOf(guardian.address);

      console.log('USDC Received: ', fee.toString());
      console.log(
        'USDC pending: ',
        (await guardian.pendingReward(trader.address))[1].toString(),
        (await guardian.pendingReward(holder.address))[1].toString()
      );

      expect((await guardian.pendingReward(trader.address))[1]).equal(
        fee.mul(10).div(11)
      );
      expect((await guardian.pendingReward(holder.address))[1]).equal(
        fee.mul(1).div(11)
      );
    });

    it('claim usdc', async function () {
      let fee = await usdc.balanceOf(guardian.address);

      await guardian.connect(trader).claim();
      await guardian.connect(holder).claim();

      console.log(
        'USDC claimed: ',
        (await usdc.balanceOf(trader.address)).toString(),
        (await usdc.balanceOf(holder.address)).toString()
      );
      console.log(
        'USDC pending: ',
        (await guardian.pendingReward(trader.address))[1].toString(),
        (await guardian.pendingReward(holder.address))[1].toString()
      );

      expect(await usdc.balanceOf(trader.address)).equal(fee.mul(10).div(11));
      expect(await usdc.balanceOf(holder.address)).equal(fee.mul(1).div(11));
      expect(await usdc.balanceOf(guardian.address)).equal(
        ethers.constants.Zero
      );
    });

    it('compound all', async function () {
      await guardian.mint(deployer.address, usdc.address, 100); // 100 guardians so 10 trireme per day
      await increaseTime(10 * 86400); // 10 days so 80 trireme for reward

      console.log(
        'Before Pending: ',
        (await guardian.pendingReward(deployer.address))[0].toString()
      );
      console.log(
        'Before USDC Teasury: ',
        (await usdc.balanceOf(treasury.address)).toString()
      );

      const amount = 6; // 80 / 12 ~~ 8
      const tx = await guardian.compound(trader.address, usdc.address, 0);
      await expect(tx)
        .to.emit(guardian, 'Compound')
        .withArgs(deployer.address, trader.address, amount);

      console.log(
        'After Pending: ',
        (await guardian.pendingReward(deployer.address))[0].toString()
      );
      console.log(
        'After USDC Teasury: ',
        (await usdc.balanceOf(treasury.address)).toString()
      );

      expect(await guardian.totalBalanceOf(trader.address)).equal(10 + amount);
    });

    it('compound', async function () {
      await guardian.mint(deployer.address, usdc.address, 100); // 100 guardians so 10 trireme per day
      await increaseTime(10 * 86400); // 10 days so 80 trireme for reward

      console.log(
        'Before Pending: ',
        (await guardian.pendingReward(deployer.address))[0].toString()
      );
      console.log(
        'Before USDC Teasury: ',
        (await usdc.balanceOf(treasury.address)).toString()
      );

      {
        const amount = 3;
        const tx = await guardian.compound(
          trader.address,
          usdc.address,
          amount
        );
        await expect(tx)
          .to.emit(guardian, 'Compound')
          .withArgs(deployer.address, trader.address, amount);

        console.log(
          'After Pending: ',
          (await guardian.pendingReward(deployer.address))[0].toString()
        );
        console.log(
          'After USDC Teasury: ',
          (await usdc.balanceOf(treasury.address)).toString()
        );

        expect(await guardian.totalBalanceOf(trader.address)).equal(
          10 + amount
        );
      }
      {
        const amount = 3;
        const tx = await guardian.compound(
          trader.address,
          usdc.address,
          amount
        );
        await expect(tx)
          .to.emit(guardian, 'Compound')
          .withArgs(deployer.address, trader.address, amount);

        console.log(
          'After Pending: ',
          (await guardian.pendingReward(deployer.address))[0].toString()
        );
        console.log(
          'After USDC Teasury: ',
          (await usdc.balanceOf(treasury.address)).toString()
        );

        expect(await guardian.totalBalanceOf(trader.address)).equal(
          10 + amount + amount
        );
      }
    });
  });
});
