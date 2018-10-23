"use strict";
console.log(__dirname)
const Utils = require("./helpers/utils");
const Ledger = artifacts.require("./ChannelManager.sol");
const EC = artifacts.require("./ECTools.sol");
const Token = artifacts.require("./token/HumanStandardToken.sol");
const Connext = require("connext");

const should = require("chai")
  .use(require("chai-as-promised"))
  .should();

const SolRevert = "VM Exception while processing transaction: revert";

const emptyRootHash =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

function wait(ms) {
  const start = Date.now();
  console.log(`Waiting for ${ms}ms...`);
  while (Date.now() < start + ms) {}
  return true;
}

function generateProof(vcHashToProve, vcInitStates) {
  const merkle = Connext.generateMerkleTree(vcInitStates);
  const mproof = merkle.proof(Utils.hexToBuffer(vcHashToProve));

  let proof = [];
  for (var i = 0; i < mproof.length; i++) {
    proof.push(Utils.bufferToHex(mproof[i]));
  }

  proof.unshift(vcHashToProve);

  proof = Utils.marshallState(proof);
  return proof;
}

contract("ChannelManager :: constructor", accounts => {
  it("deploy", async() => {
    const channelManager = await Ledger.deployed()
    const tokenAddress = await Token.deployed()
    const hubAddress = await channelManager.hub()
    const challengePeriod = await channelManager.challengePeriod()
    const approvedToken = await channelManager.approvedToken()

    assert.equal(hubAddress, accounts[0])
    assert.equal(challengePeriod.toNumber(), 10000)
    assert.equal(approvedToken, tokenAddress.address)
  })
});