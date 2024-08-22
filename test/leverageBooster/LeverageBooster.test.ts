import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, upgrades } from 'hardhat';
import {
  ERC20Vault,
  IERC20,
  LeverageBooster,
  MockERC20ValueProvider,
  TriremeUSD,
  SwapRouter,
} from '../../types';
import { BigNumber, constants } from 'ethers';
import { formatEther, parseEther } from 'ethers/lib/utils';
import { unlockAccount } from '../../helper';

describe('Leverage Booster', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let daoAdmin: SignerWithAddress;

  let triUSDC: TriremeUSD;
  let leverageBooster: LeverageBooster;
  let swapRouter: SwapRouter;
  let provider: MockERC20ValueProvider;
  let vault: ERC20Vault;
  let weth: IERC20;
  let usdc: IERC20;

  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const TriUSD_USDC_Curve = '0x66267c6E24fBcdeBf06AE9104e0ccFb9C8b2AE08';
  const USDC_WETH_UNI_V2 = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc';
  const chainlinkUSDTAggregator = '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D';
  const chainlinkWETHAggregator = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

  const WETH_WHALE = '0x57757E3D981446D585Af0D9Ae4d7DF6D64647806';
  const DAO_ADMIN = '0xA004e4ceDea8497d6f028463e6756a5e6296bAd3';
  const DAO_ROLE =
    '0x3b5d4cc60d3ec3516ee8ae083bd60934f6eb2a6c54b1229985c41bfb092b2603';
  const ROUTER_ROLE =
    '0x0eed1df25dbd42631c64048750ee136532bf7501dc9b377fe56e8b9a41af3eaf';
  const MINTER_ROLE =
    '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6';
  const LEVERAGE_ROLE =
    '0x5d600fd2e1dfce7375f5c20c64ee8933aaa4f4a031eba222bd5b90ed3b8c6513';

  const numerator = BigNumber.from(10);
  const denominator = BigNumber.from(1000);
  const borrowAmountCap = parseEther('100000');
  const minBorrowAmount = parseEther('1');

  before(async () => {
    [owner, alice] = await ethers.getSigners();

    daoAdmin = await unlockAccount(DAO_ADMIN);
    await owner.sendTransaction({
      to: daoAdmin.address,
      value: parseEther('10'),
    });

    const wethWhale = await unlockAccount(WETH_WHALE);
    weth = await ethers.getContractAt('IERC20', WETH);
    await weth.connect(wethWhale).transfer(owner.address, parseEther('1000'));

    usdc = await ethers.getContractAt('IERC20', USDC);
  });

  beforeEach(async () => {
    triUSDC = <TriremeUSD>(
      await ethers.getContractAt(
        'TriremeUSD',
        '0xd60eea80c83779a8a5bfcdac1f3323548e6bb62d'
      )
    );

    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProvider'
    );
    provider = <MockERC20ValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkWETHAggregator,
        WETH,
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

    const vaultFactory = await ethers.getContractFactory('ERC20Vault');
    vault = <ERC20Vault>await upgrades.deployProxy(vaultFactory, [
      triUSDC.address,
      WETH,
      constants.AddressZero,
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
    await triUSDC.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    await swapRouter.grantRole(ROUTER_ROLE, owner.address);
    await swapRouter.setTriRoute(
      triUSDC.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await swapRouter.setRoute(USDC, WETH, USDC_WETH_UNI_V2, 2);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriUSDC-WETH Leverage Booster',
        vault.address,
        swapRouter.address,
      ])
    );
    await vault.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vault.grantRole(LEVERAGE_ROLE, leverageBooster.address);
  });

  describe('Leverage Position', async () => {
    const initialCollateral = parseEther('10');
    it('should be able to leverage position', async () => {
      console.log('Starting with 10 WETH');
      await weth.approve(leverageBooster.address, initialCollateral);
      await leverageBooster.leveragePosition(initialCollateral, 5000, 3);

      console.log('Final Position Information---');
      const position = await vault.positions(owner.address);
      console.log(position.collateral.toString());
      console.log(position.debtPortion.toString());
      console.log(position.debtPrincipal.toString());

      console.log('Leverage Booster Balance---');
      const boosterCollBal = await usdc.balanceOf(leverageBooster.address);
      const boosterTriBal = await triUSDC.balanceOf(leverageBooster.address);

      console.log(boosterCollBal.toString());
      console.log(boosterTriBal.toString());

      const triUsdBal = await triUSDC.balanceOf(owner.address);
      console.log('Final User TriUSD Bal:', formatEther(triUsdBal));
    });
  });
});
