import { ethers, upgrades } from 'hardhat';
import { IERC20, Trireme, Zap } from '../../types';
import { ether, unlockAccount } from '../../helper';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';

describe('Zap', () => {
  let owner: SignerWithAddress;
  let zap: Zap;
  let USDC: IERC20;

  const addressProvider = '0x88676F89727475339f15d97A29a68E405FEd723a';
  const router = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D';
  const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

  const whale = '0x51eDF02152EBfb338e03E30d65C15fBf06cc9ECC';
  const triOwner = '0xA004e4ceDea8497d6f028463e6756a5e6296bAd3';
  const tri = '0x5fE72ed557d8a02FFf49B3B826792c765d5cE162';

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    await unlockAccount(whale);
    await unlockAccount(triOwner);

    const whaleSigner = await ethers.getSigner(whale);
    const triOwnerSigner = await ethers.getSigner(triOwner);
    const ZapFactory = await ethers.getContractFactory('Zap');
    zap = <Zap>(
      await upgrades.deployProxy(ZapFactory, [addressProvider, router])
    );

    USDC = await ethers.getContractAt('IERC20', usdc);
    await USDC.connect(whaleSigner).transfer(
      owner.address,
      await USDC.balanceOf(whale)
    );

    await owner.sendTransaction({
      to: triOwner,
      value: '1000000000000000000',
    });
    const TRI = <Trireme>await ethers.getContractAt('Trireme', tri);
    await TRI.connect(triOwnerSigner).excludeFromFee(zap.address);
  });

  it('zap usdc to tri lp', async () => {
    const usdcBal = ethers.utils.parseUnits('100', 6);
    await USDC.approve(zap.address, ethers.constants.MaxUint256);

    const lp = <IERC20>(
      await ethers.getContractAt('IERC20', await zap.lpToken())
    );
    const beforeLpBal = await lp.balanceOf(owner.address);
    await zap['zapInToken(address,uint256,address)'](
      USDC.address,
      usdcBal,
      owner.address
    );
    const afterLpBal = await lp.balanceOf(owner.address);

    console.log(afterLpBal.sub(beforeLpBal));
  });
});
