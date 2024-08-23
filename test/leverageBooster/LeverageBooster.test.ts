import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, upgrades } from 'hardhat';
import {
  ERC20Vault,
  ERC20VaultETH,
  IERC20,
  LeverageBooster,
  LeverageBoosterETH,
  MockERC20ValueProvider,
  MockERC20ValueProviderETH,
  TriremeETH,
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
  let triETH: TriremeETH;
  let leverageBooster: LeverageBooster;
  let leverageBoosterETH: LeverageBoosterETH;
  let swapRouter: SwapRouter;
  let provider: MockERC20ValueProvider;
  let providerETH: MockERC20ValueProviderETH;
  let vault: ERC20Vault;
  let vaultETH: ERC20VaultETH;
  let weth: IERC20;
  let weEth: IERC20;
  let usdc: IERC20;

  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const WeETH = '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee';
  const TriUSD_USDC_Curve = '0x66267c6E24fBcdeBf06AE9104e0ccFb9C8b2AE08';
  const TriETH_WETH_Curve = '0x637213593e31Bc25F49D37C74B43a89eb1743D73';
  const USDC_WETH_UNI_V2 = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc';
  const WETH_WeETH_CURVE = '0xDB74dfDD3BB46bE8Ce6C33dC9D82777BCFc3dEd5';
  const chainlinkUSDTAggregator = '0x3E7d1eAB13ad0104d2750B8863b489D65364e32D';
  const chainlinkWETHAggregator = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

  const WeETH_WHALE = '0x267ed5f71EE47D3E45Bb1569Aa37889a2d10f91e';
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

  const initialCollateral = parseEther('10');

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

    const weEthWhale = await unlockAccount(WeETH_WHALE);
    weEth = await ethers.getContractAt('IERC20', WeETH);
    await weEth.connect(weEthWhale).transfer(owner.address, parseEther('1000'));

    usdc = await ethers.getContractAt('IERC20', USDC);

    triUSDC = <TriremeUSD>(
      await ethers.getContractAt(
        'TriremeUSD',
        '0xd60eea80c83779a8a5bfcdac1f3323548e6bb62d'
      )
    );
    triETH = <TriremeETH>(
      await ethers.getContractAt(
        'TriremeETH',
        '0x63a0964a36c34e81959da5894ad888800e17405b'
      )
    );
  });

  it('should be able to leverage position on triUSD-WETH vault', async () => {
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
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triUSDC.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(USDC, WETH, USDC_WETH_UNI_V2, 2);

    await vault.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vault.grantRole(LEVERAGE_ROLE, leverageBooster.address);

    console.log('Starting with 10 WETH');
    await weth.approve(leverageBooster.address, initialCollateral);
    await leverageBooster.leveragePosition(initialCollateral, 5000, 3);

    console.log('Final Position Information---');
    const position = await vault.positions(owner.address);
    console.log(position.collateral.toString());
    console.log(position.debtPortion.toString());
    console.log(position.debtPrincipal.toString());

    console.log('Leverage Booster Balance---');
    const boosterCollBal = await weth.balanceOf(leverageBooster.address);
    const boosterUSDCBal = await usdc.balanceOf(leverageBooster.address);
    const boosterTriBal = await triUSDC.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triUSDC.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });

  it('should be able to leverage position on triUSD-weETH vault', async () => {
    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProvider'
    );
    provider = <MockERC20ValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkWETHAggregator,
        WeETH,
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
      WeETH,
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

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriUSDC-WeETH Leverage Booster',
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triUSDC.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(USDC, WETH, USDC_WETH_UNI_V2, 2);
    await leverageBooster.setRoute(WETH, WeETH, WETH_WeETH_CURVE, 1);

    await vault.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vault.grantRole(LEVERAGE_ROLE, leverageBooster.address);

    console.log('Starting with 10 WeETH');
    await weEth.approve(leverageBooster.address, initialCollateral);
    await leverageBooster.leveragePosition(initialCollateral, 5000, 3);

    console.log('Final Position Information---');
    const position = await vault.positions(owner.address);
    console.log(position.collateral.toString());
    console.log(position.debtPortion.toString());
    console.log(position.debtPrincipal.toString());

    console.log('Leverage Booster Balance---');
    const boosterCollBal = await weEth.balanceOf(leverageBooster.address);
    const boosterUSDCBal = await usdc.balanceOf(leverageBooster.address);
    const boosterTriBal = await triUSDC.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triUSDC.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });

  it.only('should be able to leverage position on triETH-weETH vault', async () => {
    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProviderETH'
    );
    providerETH = <MockERC20ValueProviderETH>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkUSDTAggregator,
        WeETH,
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
    const vaultFactory = await ethers.getContractFactory('ERC20VaultETH');
    vaultETH = <ERC20VaultETH>await upgrades.deployProxy(vaultFactory, [
      triETH.address,
      WeETH,
      constants.AddressZero,
      providerETH.address,
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
    await triETH.connect(daoAdmin).grantRole(MINTER_ROLE, vaultETH.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBoosterETH'
    );
    leverageBoosterETH = <LeverageBoosterETH>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriETH-WeETH Leverage Booster',
        vaultETH.address,
        swapRouter.address,
      ])
    );
    await leverageBoosterETH.grantRole(ROUTER_ROLE, owner.address);
    await leverageBoosterETH.setTriRoute(
      triETH.address,
      WETH,
      TriETH_WETH_Curve,
      1 // Dex.CURVE
    );
    await leverageBoosterETH.setRoute(WETH, WeETH, WETH_WeETH_CURVE, 1);

    await vaultETH.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vaultETH.grantRole(LEVERAGE_ROLE, leverageBoosterETH.address);

    console.log('Starting with 10 WeETH');
    await weEth.approve(leverageBoosterETH.address, initialCollateral);
    await leverageBoosterETH.leveragePosition(initialCollateral, 5000, 3);

    console.log('Final Position Information---');
    const position = await vaultETH.positions(owner.address);
    console.log(position.collateral.toString());
    console.log(position.debtPortion.toString());
    console.log(position.debtPrincipal.toString());

    console.log('Leverage Booster Balance---');
    const boosterCollBal = await weEth.balanceOf(leverageBoosterETH.address);
    const boosterUSDCBal = await weth.balanceOf(leverageBoosterETH.address);
    const boosterTriBal = await triETH.balanceOf(leverageBoosterETH.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triETH.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vaultETH.positions(leverageBoosterETH.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });
});
