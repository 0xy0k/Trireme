import bn from 'bignumber.js';
import { BigNumber, BigNumberish, ethers } from 'ethers';

function truncate(str: string, maxDecimalDigits: number) {
  if (str.includes('.')) {
    const parts = str.split('.');

    if (maxDecimalDigits == 0) {
      return parts[0];
    } else {
      return parts[0] + '.' + parts[1].slice(0, maxDecimalDigits);
    }
  }
  return str;
}

export const ether = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.parseEther(amount.toString());
  return BigNumber.from(weiString);
};

export const wei = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.formatUnits(amount.toString(), 'ether');
  return BigNumber.from(truncate(weiString, 0));
};

export const gWei = (amount: number): BigNumber => {
  const weiString = BigNumber.from('1000000000').mul(amount);
  return BigNumber.from(weiString);
};

export const usdc = (amount: number): BigNumber => {
  const weiString = BigNumber.from('1000000').mul(amount);
  return BigNumber.from(weiString);
};

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

export function encodePriceSqrt(
  reserve1: BigNumberish,
  reserve0: BigNumberish
): BigNumber {
  return BigNumber.from(
    new bn(reserve1.toString())
      .div(reserve0.toString())
      .sqrt()
      .multipliedBy(new bn(2).pow(96))
      .integerValue(3)
      .toString()
  );
}

export const getMinTick = (tickSpacing: number) =>
  Math.ceil(-887272 / tickSpacing) * tickSpacing;

export const getMaxTick = (tickSpacing: number) =>
  Math.floor(887272 / tickSpacing) * tickSpacing;
