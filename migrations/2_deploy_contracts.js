const EC = artifacts.require("./ECTools.sol");
const LC = artifacts.require("./ChannelManager.sol");
const HumanStandardToken = artifacts.require(
  "./lib/token/HumanStandardToken.sol"
);

module.exports = async function(deployer, network, accounts) {
  deployer.deploy(EC);

  let tokenAddress = "0x0"; // change to BOOTY address for mainnet

  if (network !== "mainnet" && network !== "rinkeby") {
    const supply = web3.utils.toBN(web3.utils.toWei("696969", "ether"));
    await deployer.deploy(
      HumanStandardToken,
      supply,
      "Test Token",
      "18",
      "TST"
    );
    const hst = await HumanStandardToken.deployed();
    await Promise.all(
      accounts.map(async (account, index) => {
        if (index === 0) {
          return;
        }
        return hst.transfer(
          account,
          supply.div(web3.utils.toBN(accounts.length))
        );
      })
    );
    tokenAddress = hst.address;
  }

  deployer.link(EC, LC);
  await deployer.deploy(LC, tokenAddress, accounts[0]);
};
