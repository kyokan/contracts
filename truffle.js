module.exports = {
  networks: {
    local: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "4447",
      gas: 6700000
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 500
    }
  }
}
