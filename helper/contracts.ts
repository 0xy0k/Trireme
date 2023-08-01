import { Contract } from 'ethers';

import { UniswapV2Factory } from '../types/UniswapV2Factory';
import { UniswapV2Router02 } from '../types/UniswapV2Router02';
import { WETH9 } from '../types/WETH9';
import { ERC20 } from '../types/ERC20';
import { BFactory } from '../types/BFactory';
import { UniswapV3Factory } from '../types/UniswapV3Factory';
import { MockTimeUniswapV3PoolDeployer } from '../types/MockTimeUniswapV3PoolDeployer';
import { MockTimeUniswapV3Pool } from '../types/MockTimeUniswapV3Pool';
import { TestUniswapV3Callee } from '../types/TestUniswapV3Callee';
import { TestUniswapV3Router } from '../types/TestUniswapV3Router';

const hre = require('hardhat');

export const deployContract = async <ContractType extends Contract>(
  contractName: string,
  args: any[],
  libraries?: {}
) => {
  const signers = await hre.ethers.getSigners();
  const contract = (await (
    await hre.ethers.getContractFactory(contractName, signers[0], {
      libraries: {
        ...libraries,
      },
    })
  ).deploy(...args)) as ContractType;

  return contract;
};

export const deployUniswapV2Factory = async (feeToSetter: any) => {
  return await deployContract<UniswapV2Factory>('UniswapV2Factory', [
    feeToSetter,
  ]);
};

export const deployUniswapV2Router02 = async (factory: any, weth: any) => {
  return await deployContract<UniswapV2Router02>('UniswapV2Router02', [
    factory,
    weth,
  ]);
};

export const deployWETH9 = async () => {
  return await deployContract<WETH9>('WETH9', []);
};

export const deployERC20 = async (totalSupply: any) => {
  return await deployContract<ERC20>('ERC20', [totalSupply]);
};

export const deployBFactory = async () => {
  return await deployContract<BFactory>('BFactory', []);
};

export const deployUniswapV3Factory = async () => {
  return await deployContract<UniswapV3Factory>('UniswapV3Factory', []);
};

export const deployMockTimeUniswapV3PoolDeployer = async () => {
  return await deployContract<MockTimeUniswapV3PoolDeployer>(
    'MockTimeUniswapV3PoolDeployer',
    []
  );
};

export const deployMockTimeUniswapV3Pool = async () => {
  return await deployContract<MockTimeUniswapV3Pool>(
    'MockTimeUniswapV3Pool',
    []
  );
};

export const deployTestUniswapV3Callee = async () => {
  return await deployContract<TestUniswapV3Callee>('TestUniswapV3Callee', []);
};

export const deployTestUniswapV3Router = async () => {
  return await deployContract<TestUniswapV3Router>('TestUniswapV3Router', []);
};
