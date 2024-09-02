/* eslint @typescript-eslint/no-var-requires: "off" */
const { time } = require('@openzeppelin/test-helpers');
import { BigNumber } from 'ethers';
import hre from 'hardhat';

export const unlockAccount = async (address: string) => {
  await hre.network.provider.send('hardhat_impersonateAccount', [address]);
  return hre.ethers.getSigner(address);
};

export const increaseTime = async (sec: number) => {
  await hre.network.provider.send('evm_increaseTime', [sec]);
  await hre.network.provider.send('evm_mine');
};

export const mineBlocks = async (blockCount: number) => {
  for (let i = 0; i < blockCount; ++i) {
    await hre.network.provider.send('evm_mine');
  }
};

export const getBlockNumber = async () => {
  const blockNumber = await hre.network.provider.send('eth_blockNumber');
  return parseInt(blockNumber.slice(2), 16);
};

export const getTimeStamp = async () => {
  const blockNumber = await hre.network.provider.send('eth_blockNumber');
  const blockTimestamp = (
    await hre.network.provider.send('eth_getBlockByNumber', [
      blockNumber,
      false,
    ])
  ).timestamp;
  return parseInt(blockTimestamp.slice(2), 16);
};

export const getSnapShot = async () => {
  return await hre.network.provider.send('evm_snapshot');
};

export const revertEvm = async (snapshotID: any) => {
  await hre.network.provider.send('evm_revert', [snapshotID]);
};

export const waitSeconds = (sec: number) =>
  new Promise((resolve) => setTimeout(resolve, sec * 1000));

export const getCurrentTimestamp = async (): Promise<BigNumber> => {
  const now = await time.latest();
  return now;
};

export const uint256Max =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';
