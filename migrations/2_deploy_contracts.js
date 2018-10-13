const EC = artifacts.require("./ECTools.sol");
const LC = artifacts.require("./ChannelManager.sol");
const HumanStandardToken = artifacts.require(
  "./lib/token/HumanStandardToken.sol"
);

module.exports = async function(deployer, network, accounts) {
  await deployer.deploy(EC);

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
    tokenAddress = hst.address;
  }

  await deployer.link(EC, LC);
  await deployer.deploy(
    LC,
    "0xdDA6327139485221633A1FcD65f4aC932E60A2e1",
    accounts[0]
  );
};
