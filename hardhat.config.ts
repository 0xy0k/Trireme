import '@typechain/hardhat';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import "@nomicfoundation/hardhat-verify";
import '@nomiclabs/hardhat-truffle5';
import 'hardhat-contract-sizer';
import 'solidity-coverage';
import 'hardhat-deploy';

require('dotenv').config();

const mainnetURL = process.env.MAIN_NET_API_URL;
const goerliURL = process.env.GOERLI_NET_API_URL;
const sepoliaURL = process.env.SEPOLIA_NET_API_URL;

const mnemonic = process.env.MNEMONIC;

const addressOffset = 0;
const numAddressesGenerated = 5;
const mnemonicPathMainNet = "m/44'/60'/0'/0/";
const mnemonicPathTestNet = "m/44'/1'/0'/0/";

export default {
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
        docker: true,
      },
    ],
  },
  // contractSizer: {
  //   alphaSort: true,
  //   runOnCompile: true,
  //   disambiguatePaths: false,
  // },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  typechain: {
    outDir: 'types/',
    target: 'ethers-v5',
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAIN_NET_API_URL,
      },
      hardfork: 'london',
      gasPrice: 'auto',
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      gas: 6012388,
    },
    mainnet: {
      url: mainnetURL,
      accounts: [process.env.PRIVATE_KEY!],
    },
    goerli: {
      url: goerliURL,
      accounts: {
        mnemonic,
        path: mnemonicPathTestNet,
        initialIndex: addressOffset,
        count: numAddressesGenerated,
      },
    },
    sepolia: {
      url: sepoliaURL,
      accounts: {
        mnemonic,
        path: mnemonicPathTestNet,
        initialIndex: addressOffset,
        count: numAddressesGenerated,
      },
    },
  },
  paths: {
    deploy: 'deploy',
    deployments: 'deployments',
    imports: 'imports',
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  sourcify: {
    enabled: true
  },
};
