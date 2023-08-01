const AMockToken = require('./../deployments/localhost/AMockToken.json');
const BMockToken = require('./../deployments/localhost/BMockToken.json');
const CMockToken = require('./../deployments/localhost/CMockToken.json');
const WETH9 = require('./../deployments/localhost/WETH9.json');

const UniswapV2Factory = require('./../node_modules/@uniswap/v2-core/build/UniswapV2Factory.json');
const UniswapV2Router02 = require('./../deployments/localhost/UniswapV2Router02.json');

const BFactory = require('./../deployments/localhost/BFactory.json');
const BPool = require('./../deployments/localhost/BPool.json');

const UniswapV3Factory = require('./../deployments/localhost/UniswapV3Factory.json');
const UniswapV3Router = require('./../deployments/localhost/SwapRouter.json');
const UniswapV3NFT = require('./../deployments/localhost/NonfungiblePositionManager.json');

const LPMockToken = require('./../deployments/localhost/LPMockToken.json');
const MetaLPMockToken = require('./../deployments/localhost/MetaLPMockToken.json');
const AddressProvider = require('./../deployments/localhost/AddressProvider.json');
const GaugeController = require('./../deployments/localhost/GaugeControllerMock.json');
const Registry = require('./../deployments/localhost/Registry.json');
const CurvePool = require('./../deployments/localhost/PoolMockV2.json');
const RateCalc = require('./../deployments/localhost/RateCalcMock.json');
const MetaPool = require('./../deployments/localhost/MetaPoolMock.json');
const CurvePoolFactory = require('./../deployments/localhost/PoolFactory.json');
const CurvePoolImplementation = require('./../deployments/localhost/PoolMockV3.json');

const PriceFeeder = require('./../deployments/localhost/PriceFeeder.json');
const RewardsDistribution = require('./../deployments/localhost/RewardsDistribution.json');
const ShyftDao = require('./../deployments/localhost/ShyftDao.json');
const ShyftStaking = require('../deployments/localhost/ShyftStaking.json');

const LendingPoolAddressesProviderRegistry = require('./../deployments/localhost/LendingPoolAddressesProviderRegistry.json');
const LendingPoolAddressesProvider = require('./../deployments/localhost/LendingPoolAddressesProvider.json');
const ReserveLogic = require('./../deployments/localhost/ReserveLogic.json');
const GenericLogic = require('./../deployments/localhost/GenericLogic.json');
const ValidationLogic = require('./../deployments/localhost/ValidationLogic.json');
const LendingPool = require('./../deployments/localhost/LendingPool.json');
const LendingPoolConfigurator = require('./../deployments/localhost/LendingPoolConfigurator.json');
const StableAndVariableTokensHelper = require('./../deployments/localhost/StableAndVariableTokensHelper.json');
const ATokensAndRatesHelper = require('./../deployments/localhost/ATokensAndRatesHelper.json');
const AaveAToken = require('./../deployments/localhost/AaveAToken.json');
const StableDebtToken = require('./../deployments/localhost/StableDebtToken.json');
const VariableDebtToken = require('./../deployments/localhost/VariableDebtToken.json');
const AaveOracle = require('./../deployments/localhost/AaveOracle.json');
const LendingRateOracle = require('./../deployments/localhost/LendingRateOracle.json');
const MockChainlinkAggregatorFactory = require('./../deployments/localhost/MockChainlinkAggregatorFactory.json');
const MockChainlinkAggregator = require('./../deployments/localhost/MockChainlinkAggregator.json');
const PriceProvider = require('./../deployments/localhost/PriceProvider.json');
const MFDstats = require('./../deployments/localhost/MFDstats.json');
const LPFeeDistribution = require('./../deployments/localhost/LPFeeDistribution.json');
const MultiFeeDistribution = require('./../deployments/localhost/MultiFeeDistribution.json');
const MiddleFeeDistribution = require('./../deployments/localhost/MiddleFeeDistribution.json');
const RewardEligibleDataProvider = require('./../deployments/localhost/RewardEligibleDataProvider.json');
const ChefIncentivesController = require('./../deployments/localhost/ChefIncentivesController.json');
const MerkleDistributor = require('./../deployments/localhost/MerkleDistributor.json');
const DefaultReserveInterestRateStrategy = require('./../deployments/localhost/DefaultReserveInterestRateStrategy.json');
const MockFlashLoan = require('./../deployments/localhost/MockFlashLoan.json');
const MockProtocolAdmin = require('./../deployments/localhost/MockProtocolAdmin.json');

const fastcsv = require('fast-csv');
const fs = require('fs');

const uniswapV2FactoryAddress = fs.readFileSync(
  'uniswapv2factory_address.csv',
  'utf-8'
);

const ws = fs.createWriteStream('addresses.csv');
const data = [
  /// Tokens
  {
    contract: 'AToken',
    address: AMockToken.address,
  },
  {
    contract: 'BToken',
    address: BMockToken.address,
  },
  {
    contract: 'CToken',
    address: CMockToken.address,
  },
  {
    contract: 'WETH9',
    address: WETH9.address,
  },
  /// UniswapV2
  {
    contract: '',
    address: '',
  },
  {
    contract: 'UniswapV2',
    address: '',
  },
  {
    contract: 'UniswapV2Factory',
    address: uniswapV2FactoryAddress,
  },
  {
    contract: 'UniswapV2Router02',
    address: UniswapV2Router02.address,
  },
  {
    contract: 'WETH9',
    address: WETH9.address,
  },
  {
    contract: 'Token0',
    address: AMockToken.address,
  },
  {
    contract: 'Token1',
    address: BMockToken.address,
  },
  /// Balancer
  {
    contract: '',
    address: '',
  },
  {
    contract: 'Balancer',
    address: '',
  },
  {
    contract: 'BalancerFactory',
    address: BFactory.address,
  },
  {
    contract: 'BalancerPool',
    address: BPool.address,
  },
  {
    contract: 'Token0',
    address: AMockToken.address,
  },
  {
    contract: 'Token1',
    address: BMockToken.address,
  },
  /// UniswapV3
  {
    contract: '',
    address: '',
  },
  {
    contract: 'UniswapV3',
    address: '',
  },
  {
    contract: 'UniswapV3Factory',
    address: UniswapV3Factory.address,
  },
  {
    contract: 'UniswapV3Router',
    address: UniswapV3Router.address,
  },
  {
    contract: 'UniswapV3NFT',
    address: UniswapV3NFT.address,
  },
  {
    contract: 'Token0',
    address: [AMockToken, BMockToken, CMockToken].sort((tokenA, tokenB) =>
      tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? -1 : 1
    )[0].address,
  },
  {
    contract: 'Token1',
    address: [AMockToken, BMockToken, CMockToken].sort((tokenA, tokenB) =>
      tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? -1 : 1
    )[1].address,
  },
  /// Curve
  {
    contract: '',
    address: '',
  },
  {
    contract: 'Curve',
    address: '',
  },
  {
    contract: 'CurveAddressProvider',
    address: AddressProvider.address,
  },
  {
    contract: 'CurveGaugeController',
    address: GaugeController.address,
  },
  {
    contract: 'CurveRegistry',
    address: Registry.address,
  },
  {
    contract: 'CurveFactory',
    address: CurvePoolFactory.address,
  },
  {
    contract: 'CurvePoolImplementation',
    address: CurvePoolImplementation.address,
  },
  {
    contract: 'Coin',
    address: AMockToken.address,
  },
  {
    contract: 'UnderlyingCoin',
    address: BMockToken.address,
  },
  {
    contract: 'CurvePool',
    address: CurvePool.address,
  },
  {
    contract: 'CurveLPToken',
    address: LPMockToken.address,
  },
  {
    contract: 'CurveRateCalc',
    address: RateCalc.address,
  },
  {
    contract: 'CurveMetaPool',
    address: MetaPool.address,
  },
  {
    contract: 'CurveMetaLPToken',
    address: MetaLPMockToken.address,
  },
  /// ShyftStaking
  {
    contract: '',
    address: '',
  },
  {
    contract: 'ShyftStaking',
    address: '',
  },
  {
    contract: 'PriceFeeder',
    address: PriceFeeder.address,
  },
  {
    contract: 'RewardsDistribution',
    address: RewardsDistribution.address,
  },
  {
    contract: 'ShyftDao',
    address: ShyftDao.address,
  },
  {
    contract: 'ShyftStaking',
    address: ShyftStaking.address,
  },
  /// Aave
  {
    contract: '',
    address: '',
  },
  {
    contract: 'Aave',
    address: '',
  },
  {
    contract: 'LendingPoolAddressesProviderRegistry',
    address: LendingPoolAddressesProviderRegistry.address,
  },
  {
    contract: 'LendingPoolAddressesProvider',
    address: LendingPoolAddressesProvider.address,
  },
  {
    contract: 'ReserveLogic',
    address: ReserveLogic.address,
  },
  {
    contract: 'GenericLogic',
    address: GenericLogic.address,
  },
  {
    contract: 'ValidationLogic',
    address: ValidationLogic.address,
  },
  {
    contract: 'LendingPool',
    address: LendingPool.address,
  },
  {
    contract: 'LendingPoolConfigurator',
    address: LendingPoolConfigurator.address,
  },
  {
    contract: 'StableAndVariableTokensHelper',
    address: StableAndVariableTokensHelper.address,
  },
  {
    contract: 'ATokensAndRatesHelper',
    address: ATokensAndRatesHelper.address,
  },
  {
    contract: 'AaveAToken',
    address: AaveAToken.address,
  },
  {
    contract: 'StableDebtToken',
    address: StableDebtToken.address,
  },
  {
    contract: 'VariableDebtToken',
    address: VariableDebtToken.address,
  },
  {
    contract: 'AaveOracle',
    address: AaveOracle.address,
  },
  {
    contract: 'LendingRateOracle',
    address: LendingRateOracle.address,
  },
  {
    contract: 'MockChainlinkAggregatorFactory',
    address: MockChainlinkAggregatorFactory.address,
  },
  {
    contract: 'MockChainlinkAggregator',
    address: MockChainlinkAggregator.address,
  },
  {
    contract: 'PriceProvider',
    address: PriceProvider.address,
  },
  {
    contract: 'MFDstats',
    address: MFDstats.address,
  },
  {
    contract: 'LPFeeDistribution',
    address: LPFeeDistribution.address,
  },
  {
    contract: 'MultiFeeDistribution',
    address: MultiFeeDistribution.address,
  },
  {
    contract: 'MiddleFeeDistribution',
    address: MiddleFeeDistribution.address,
  },
  {
    contract: 'RewardEligibleDataProvider',
    address: RewardEligibleDataProvider.address,
  },
  {
    contract: 'ChefIncentivesController',
    address: ChefIncentivesController.address,
  },
  {
    contract: 'MerkleDistributor',
    address: MerkleDistributor.address,
  },
  {
    contract: 'DefaultReserveInterestRateStrategy',
    address: DefaultReserveInterestRateStrategy.address,
  },
  {
    contract: 'MockFlashLoan',
    address: MockFlashLoan.address,
  },
  {
    contract: 'AaveFactory',
    address: MockProtocolAdmin.address,
  },
];

const main = () => {
  fastcsv
    .write(data, { headers: true })
    .on('finish', function () {
      console.log('... CSV is ready ...');
    })
    .on('error', function (error) {
      console.error(error);
    })
    .pipe(ws);
};

main();
