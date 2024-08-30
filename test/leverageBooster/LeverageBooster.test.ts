import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers';
import { ethers, upgrades } from 'hardhat';
import {
  ERC20Vault,
  ERC20VaultETH,
  IERC20,
  LeverageBooster,
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

  let triUSD: TriremeUSD;
  let triETH: TriremeETH;
  let leverageBooster: LeverageBooster;
  let swapRouter: SwapRouter;
  let weth: IERC20;
  let weEth: IERC20;
  let usdc: IERC20;

  const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
  const WeETH = '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee';
  const TriUSD_USDC_Curve = '0x66267c6E24fBcdeBf06AE9104e0ccFb9C8b2AE08';
  const TriETH_WETH_Curve = '0x637213593e31Bc25F49D37C74B43a89eb1743D73';
  const USDC_WETH_UNI_V2 = '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc';
  const USDC_WETH_UNI_V3 = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640';
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

  const initialCollateral = parseEther('20');

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

    triUSD = <TriremeUSD>(
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
    const provider = <MockERC20ValueProvider>await upgrades.deployProxy(
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
    const vault = <ERC20Vault>await upgrades.deployProxy(vaultFactory, [
      triUSD.address,
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
    await triUSD.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'triUSD-WETH Leverage Booster',
        0,
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triUSD.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(USDC, WETH, USDC_WETH_UNI_V2, 2, 0);

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
    const boosterTriBal = await triUSD.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triUSD.balanceOf(owner.address);
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
    const provider = <MockERC20ValueProvider>await upgrades.deployProxy(
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
    const vault = <ERC20Vault>await upgrades.deployProxy(vaultFactory, [
      triUSD.address,
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
    await triUSD.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'triUSD-WeETH Leverage Booster',
        0,
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triUSD.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(USDC, WETH, USDC_WETH_UNI_V2, 2, 0);
    await leverageBooster.setRoute(WETH, WeETH, WETH_WeETH_CURVE, 1, 0);

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
    const boosterTriBal = await triUSD.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triUSD.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });

  it('should be able to leverage position on triETH-weETH vault', async () => {
    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProviderETH'
    );
    const provider = <MockERC20ValueProviderETH>await upgrades.deployProxy(
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
    const vault = <ERC20VaultETH>await upgrades.deployProxy(vaultFactory, [
      triETH.address,
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
    await triETH.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriETH-WeETH Leverage Booster',
        1,
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triETH.address,
      WETH,
      TriETH_WETH_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(WETH, WeETH, WETH_WeETH_CURVE, 1, 0);

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
    const boosterUSDCBal = await weth.balanceOf(leverageBooster.address);
    const boosterTriBal = await triETH.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triETH.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });

  it('should be able to leverage position on triETH-wstETH vault', async () => {
    const WstETH_WETH_UNI_V3 = '0x109830a1AAaD605BbF02a9dFA7B0B92EC2FB7dAa';
    const WstETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
    const WstETH_Whale = '0x3c22ec75ea5D745c78fc84762F7F1E6D82a2c5BF';

    const whale = await unlockAccount(WstETH_Whale);
    const wstEth = await ethers.getContractAt('IERC20', WstETH);
    await wstEth.connect(whale).transfer(owner.address, parseEther('1000'));

    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProviderETH'
    );
    const provider = <MockERC20ValueProviderETH>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkUSDTAggregator,
        WstETH,
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
    const vault = <ERC20VaultETH>await upgrades.deployProxy(vaultFactory, [
      triETH.address,
      WstETH,
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
    await triETH.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriETH-WstETH Leverage Booster',
        1,
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triETH.address,
      WETH,
      TriETH_WETH_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(WETH, WstETH, WstETH_WETH_UNI_V3, 3, 100);

    await vault.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vault.grantRole(LEVERAGE_ROLE, leverageBooster.address);

    console.log('Starting with 10 WstETH');
    await wstEth.approve(leverageBooster.address, initialCollateral);
    await leverageBooster.leveragePosition(initialCollateral, 5000, 3);

    console.log('Final Position Information---');
    const position = await vault.positions(owner.address);
    console.log(position.collateral.toString());
    console.log(position.debtPortion.toString());
    console.log(position.debtPrincipal.toString());

    console.log('Leverage Booster Balance---');
    const boosterCollBal = await wstEth.balanceOf(leverageBooster.address);
    const boosterUSDCBal = await weth.balanceOf(leverageBooster.address);
    const boosterTriBal = await triETH.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triETH.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });
  it('should be able to leverage position on triUSD-wstETH vault', async () => {
    const WstETH_WETH_UNI_V3 = '0x109830a1AAaD605BbF02a9dFA7B0B92EC2FB7dAa';
    const WstETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
    const WstETH_Whale = '0x3c22ec75ea5D745c78fc84762F7F1E6D82a2c5BF';

    const whale = await unlockAccount(WstETH_Whale);
    const wstEth = await ethers.getContractAt('IERC20', WstETH);
    await wstEth.connect(whale).transfer(owner.address, parseEther('1000'));

    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProvider'
    );
    const provider = <MockERC20ValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkWETHAggregator,
        WstETH,
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
    const vault = <ERC20Vault>await upgrades.deployProxy(vaultFactory, [
      triUSD.address,
      WstETH,
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
    await triUSD.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriUSD-WstETH Leverage Booster',
        0,
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triUSD.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(USDC, WETH, USDC_WETH_UNI_V3, 3, 500);
    await leverageBooster.setRoute(WETH, WstETH, WstETH_WETH_UNI_V3, 3, 100);

    await vault.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vault.grantRole(LEVERAGE_ROLE, leverageBooster.address);

    console.log('Starting with 10 WstETH');
    await wstEth.approve(leverageBooster.address, initialCollateral);
    await leverageBooster.leveragePosition(initialCollateral, 5000, 3);

    console.log('Final Position Information---');
    const position = await vault.positions(owner.address);
    console.log(position.collateral.toString());
    console.log(position.debtPortion.toString());
    console.log(position.debtPrincipal.toString());

    console.log('Leverage Booster Balance---');
    const boosterCollBal = await wstEth.balanceOf(leverageBooster.address);
    const boosterUSDCBal = await weth.balanceOf(leverageBooster.address);
    const boosterTriBal = await triUSD.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triUSD.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });

  it('should be able to leverage position on triUSD-sUSDe vault', async () => {
    const sUSDe_crvUSD_CURVE = '0x57064f49ad7123c92560882a45518374ad982e85';
    const crvUSD_USDC_CURVE = '0x4dece678ceceb27446b35c672dc7d61f30bad69e';
    const sUSDe = '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497';
    const crvUSD = '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E';
    const sUSDe_Whale = '0x0f0c716B007C289C0011e470CC7f14DE4fE9Fc80';

    const whale = await unlockAccount(sUSDe_Whale);
    const susde = await ethers.getContractAt('IERC20', sUSDe);
    await susde.connect(whale).transfer(owner.address, parseEther('1000'));

    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProvider'
    );
    const provider = <MockERC20ValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkUSDTAggregator,
        sUSDe,
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
    const vault = <ERC20Vault>await upgrades.deployProxy(vaultFactory, [
      triUSD.address,
      sUSDe,
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
    await triUSD.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriUSD-sUSDe Leverage Booster',
        0,
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triUSD.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(USDC, crvUSD, crvUSD_USDC_CURVE, 1, 0);
    await leverageBooster.setRoute(crvUSD, sUSDe, sUSDe_crvUSD_CURVE, 1, 0);

    await vault.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vault.grantRole(LEVERAGE_ROLE, leverageBooster.address);

    console.log('Starting with 10 sUSDe');
    await susde.approve(leverageBooster.address, initialCollateral);
    await leverageBooster.leveragePosition(initialCollateral, 5000, 3);

    console.log('Final Position Information---');
    const position = await vault.positions(owner.address);
    console.log(position.collateral.toString());
    console.log(position.debtPortion.toString());
    console.log(position.debtPrincipal.toString());

    console.log('Leverage Booster Balance---');
    const boosterCollBal = await susde.balanceOf(leverageBooster.address);
    const boosterUSDCBal = await weth.balanceOf(leverageBooster.address);
    const boosterTriBal = await triUSD.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triUSD.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });

  it('should be able to leverage position on triUSD-sFrax vault', async () => {
    const sFrax_crvUSD_CURVE = '0x73a0cba58c19ed5f27c6590bd792ec38de4815ea';
    const crvUSD_USDC_CURVE = '0x4dece678ceceb27446b35c672dc7d61f30bad69e';
    const sFrax = '0xA663B02CF0a4b149d2aD41910CB81e23e1c41c32';
    const crvUSD = '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E';
    const sFrax_Whale = '0x4C569Fcdd8b9312B8010Ab2c6D865c63C4De5609';

    const whale = await unlockAccount(sFrax_Whale);
    const sfrax = await ethers.getContractAt('IERC20', sFrax);
    await sfrax.connect(whale).transfer(owner.address, parseEther('1000'));

    const providerFactory = await ethers.getContractFactory(
      'MockERC20ValueProvider'
    );
    const provider = <MockERC20ValueProvider>await upgrades.deployProxy(
      providerFactory,
      [
        chainlinkUSDTAggregator,
        sFrax,
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
    const vault = <ERC20Vault>await upgrades.deployProxy(vaultFactory, [
      triUSD.address,
      sFrax,
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
    await triUSD.connect(daoAdmin).grantRole(MINTER_ROLE, vault.address);

    const swapRouterFactory = await ethers.getContractFactory('SwapRouter');
    swapRouter = <SwapRouter>await upgrades.deployProxy(swapRouterFactory);

    const leverageBoosterFactory = await ethers.getContractFactory(
      'LeverageBooster'
    );
    leverageBooster = <LeverageBooster>(
      await upgrades.deployProxy(leverageBoosterFactory, [
        'TriUSD-sUSDe Leverage Booster',
        0,
        vault.address,
        swapRouter.address,
      ])
    );
    await leverageBooster.grantRole(ROUTER_ROLE, owner.address);
    await leverageBooster.setTriRoute(
      triUSD.address,
      USDC,
      TriUSD_USDC_Curve,
      1 // Dex.CURVE
    );
    await leverageBooster.setRoute(USDC, crvUSD, crvUSD_USDC_CURVE, 1, 0);
    await leverageBooster.setRoute(crvUSD, sFrax, sFrax_crvUSD_CURVE, 1, 0);

    await vault.setRoleAdmin(LEVERAGE_ROLE, DAO_ROLE);
    await vault.grantRole(LEVERAGE_ROLE, leverageBooster.address);

    console.log('Starting with 20 sFrax');
    await sfrax.approve(leverageBooster.address, initialCollateral);
    await leverageBooster.leveragePosition(initialCollateral, 5000, 3);

    console.log('Final Position Information---');
    const position = await vault.positions(owner.address);
    console.log(position.collateral.toString());
    console.log(position.debtPortion.toString());
    console.log(position.debtPrincipal.toString());

    console.log('Leverage Booster Balance---');
    const boosterCollBal = await sfrax.balanceOf(leverageBooster.address);
    const boosterUSDCBal = await weth.balanceOf(leverageBooster.address);
    const boosterTriBal = await triUSD.balanceOf(leverageBooster.address);

    console.log(boosterCollBal.toString());
    console.log(boosterUSDCBal.toString());
    console.log(boosterTriBal.toString());

    const triUsdBal = await triUSD.balanceOf(owner.address);
    console.log('Final User TriUSD Bal:', formatEther(triUsdBal));

    console.log('Final Position Information of Leverage Booster---');
    const levPosition = await vault.positions(leverageBooster.address);
    console.log(levPosition.collateral.toString());
    console.log(levPosition.debtPortion.toString());
    console.log(levPosition.debtPrincipal.toString());
  });
});
