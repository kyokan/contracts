module.exports = {
  networks: {
    mainnet: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "1",
      gas: 4700000
    },
    ganache: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "4447",
      gas: 4700000
    },
    development: {
      host: "127.0.0.1",
      port: 9545,
      network_id: "4447",
      gas: 4700000
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 500
    }
  },
  mocha: {
    enableTimeouts: false
  }
};
