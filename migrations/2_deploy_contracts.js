const EC = artifacts.require("./ECTools.sol");
const CM = artifacts.require("./ChannelManager.sol");
const StandardToken = artifacts.require("./StandardToken.sol");

module.exports = async function(deployer, network, accounts) {
  await deployer.deploy(EC);

  let tokenAddress = "0x0"; // change to BOOTY address for mainnet

  if (network !== "mainnet" && network !== "rinkeby") {
    const supply = web3.utils.toBN(web3.utils.toWei("696969", "ether"));
    await deployer.deploy(
      StandardToken,
      supply,
      "Test Token",
      "18",
      "TST"
    );
    const standardToken = await StandardToken.deployed();
    tokenAddress = standardToken.address;
  }

  await deployer.link(EC, CM);
  const cm = await deployer.deploy(
    CM,
    accounts[0],
    10000,
    tokenAddress
  );

  console.log('====================================================')
  console.log('   BOOTY Token:', tokenAddress)
  console.log('ChannelManager:', await cm.address)
  console.log('           Hub:', await accounts[0])
  console.log('====================================================')
};
