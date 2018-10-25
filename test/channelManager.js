"use strict";
const HttpProvider = require(`ethjs-provider-http`)
const EthRPC = require(`ethjs-rpc`)
const ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'))
const Utils = require("./helpers/utils");
const Ledger = artifacts.require("./ChannelManager.sol");
const EC = artifacts.require("./ECTools.sol");
const Token = artifacts.require("./lib/StandardToken.sol");
const Connext = require("connext");
const privKeys = require("./privKeys.json")

const config = require("../config.json")

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

async function moveForwardSecs(secs) {
  await ethRPC.sendAsync({
    jsonrpc:'2.0', method: `evm_increaseTime`,
    params: [secs],
    id: 0
  }, (err)=> {`error increasing time`});
  const start = Date.now();
  while (Date.now() < start + 300) {}
  await ethRPC.sendAsync({method: `evm_mine`}, (err)=> {});
  while (Date.now() < start + 300) {}
  return true
}

function generateProof(threadHashToProve, threadInitStates) {
  const merkle = Connext.generateMerkleTree(threadInitStates);
  const mproof = merkle.proof(Utils.hexToBuffer(threadHashToProve));

  let proof = [];
  for (var i = 0; i < mproof.length; i++) {
    proof.push(Utils.bufferToHex(mproof[i]));
  }

  proof.unshift(vcHashToProve);

  proof = Utils.marshallState(proof);
  return proof;
}

function getEventParams(tx, event) {
  if (tx.logs.length > 0) {
    for (let idx=0; idx < tx.logs.length; idx++) {
      if (tx.logs[idx].event == event) {
        return tx.logs[idx].args
      }
    }
  }
  return false
}

async function updateHash(data, key) {
  const hash = await web3.utils.soliditySha3(
    channelManager.address,
    {type: 'address[2]', value: [data.user, data.recipient]},
    {type: 'uint256[2]', value: data.weiBalances},
    {type: 'uint256[2]', value: data.tokenBalances},
    {type: 'uint256[4]', value: data.pendingWeiUpdates},
    {type: 'uint256[4]', value: data.pendingTokenUpdates},
    {type: 'uint256[2]', value: data.txCount},
    {type: 'bytes32', value: data.threadRoot},
    data.threadCount,
    data.timeout
  )
  const sig = await web3.eth.accounts.sign(hash, key)
  return sig.signature
}

async function userDeposit(recipient, weiBalances, tokenBalances, pendingWeiUpdates, pendingTokenUpdates, txCount, threadRoot, threadCount, timeout) {
  await channelManager.userAuthorizedUpdate()
}

async function userAuthorizedUpdate(data, user) {
  await channelManager.userAuthorizedUpdate(
    data.recipient,
    data.weiBalances,
    data.tokenBalances,
    data.pendingWeiUpdates,
    data.pendingTokenUpdates,
    data.txCount,
    data.threadRoot,
    data.threadCount,
    data.timeout,
    data.sigHub,
    {from: user}
  )
}

// NOTE : ganache-cli -m 'refuse result toy bunker royal small story exhaust know piano base stand'

// NOTE : hub : accounts[0], privKeys[0]

let channelManager

contract("ChannelManager::constructor", accounts => {
  let tokenAddress, hubAddress, challengePeriod, approvedToken

  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
    tokenAddress = await Token.deployed()
    hubAddress = await channelManager.hub()
    challengePeriod = await channelManager.challengePeriod()
    approvedToken = await channelManager.approvedToken()
  })
  
  describe('contract deployment', () => {
    it("verify initialized parameters", async() => {
      assert.equal(hubAddress, accounts[0])
      assert.equal(challengePeriod.toNumber(), config.timeout)
      assert.equal(approvedToken, tokenAddress.address)
    })
  })
})

contract("ChannelManager::hubContractWithdraw", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  describe('hubContractWithdraw', () => {
    it("happy case", async() => {
      await channelManager.hubContractWithdraw(0,0)
    })

    it("insufficient wei", async() => {
      await channelManager.hubContractWithdraw(1,0).should.be.rejectedWith('hubContractWithdraw: Contract wei funds not sufficient to withdraw')
    })

    it("insufficient token", async() => {
      await channelManager.hubContractWithdraw(0,1).should.be.rejectedWith('hubContractWithdraw: Contract token funds not sufficient to withdraw')
    })
  })
});
/*
contract("ChannelManager::hubAuthorizedUpdate", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })

  describe('hubAuthorizedUpdate', () => {
    let init

    beforeEach(async () => {
      init = {
        "user" : accounts[1],
        "recipient" : accounts[2],
        "weiBalances" : [0, 0],
        "tokenBalances" : [0, 0],
        "pendingWeiUpdates" : [0, 0, 0, 0],
        "pendingTokenUpdates" : [0, 0, 0, 0],
        "txCount" : [1,1],
        "threadRoot" : emptyRootHash,
        "threadCount" : 0,
        "timeout" : 0
      }
    })

    it("happy case", async() => {
      init.sigUser = await updateHash(init, privKeys[1])
      
      await channelManager.hubAuthorizedUpdate(
        init.user, 
        init.recipient,
        init.weiBalances,
        init.tokenBalances,
        init.pendingWeiUpdates,
        init.pendingTokenUpdates,
        init.txCount,
        init.threadRoot,
        init.threadCount,
        init.timeout,
        init.sigUser
      )
    })
  })
});
*/

contract("ChannelManager::userAuthorizedUpdate", accounts => {
  let hub, alice, bob, init
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
    hub = {
      address: accounts[0],
      privateKey : privKeys[0]
    }
    alice = accounts[1]
    bob = accounts[2]
  })  

  describe('userAuthorizedUpdate', () => {
    beforeEach(async () => {
      init = {
        "user" : alice,
        "recipient" : bob,
        "weiBalances" : [0, 0],
        "tokenBalances" : [0, 0],
        "pendingWeiUpdates" : [0, 0, 0, 0],
        "pendingTokenUpdates" : [0, 0, 0, 0],
        "txCount" : [1,1],
        "threadRoot" : emptyRootHash,
        "threadCount" : 0,
        "timeout" : 0
      }
    })  

    it("happy case", async() => {
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice)
    })

    it("FAIL: msg.value not equal to deposit", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [0,0,1,0] // should fail
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('userAuthorizedUpdate: msg.value is not equal to pending user deposit')
    })

    it("FAIL: token deposit", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [0,0,1,0] // should fail

      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('VM Exception while processing transaction: revert')
    })

    it("FAIL: Wei transfer", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [0,0,0,1] // should fail

      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('VM Exception while processing transaction: revert')
    })

    it("FAIL: Token transfer", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [0,0,0,1] // should fail

      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('VM Exception while processing transaction: revert')
    })

    it("FAIL: _verifyAuthorizedUpdate: global txCount", async() => {
      init.txCount = [1,1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('global txCount must be higher than the current global txCount')
    })

    it("FAIL: _verifyAuthorizedUpdate: onchain txCount", async() => {
      init.txCount = [2,0]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
    })

    it("FAIL: _verifyAuthorizedUpdate: timeout", async() => {
      init.txCount = [2,1]
      init.timeout = 1
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('the timeout must be zero or not have passed')
    })

    it("FAIL: _verifyAuthorizedUpdate: wei conservation", async() => {
      init.txCount = [2,1]
      init.weiBalances = [0, 1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('wei must be conserved')
    })

    it("FAIL: _verifyAuthorizedUpdate: token conservation", async() => {
      init.txCount = [2,1]
      init.tokenBalances = [0, 1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('tokens must be conserved')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient reserve wei", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [1,0,0,0]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('insufficient reserve wei for deposits')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient reserve token", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [1,0,0,0]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('insufficient reserve tokens for deposits')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [0,1,0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('insufficient wei')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [0,1,0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('insufficient token')
    })

    it("FAIL: _verifySig: user is hub", async() => {
      init.txCount = [2,1]
      init.user = hub.address
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, hub.address).should.be.rejectedWith('user can not be hub')
    })

    it("FAIL: _verifySig: hub signature invalid", async() => {
      init.txCount = [2,1]
      init.user = hub.address
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('hub signature invalid')
    })

    it("FAIL: _verifyAuthorizedUpdate: Channel not open", async() => {
      init.txCount = [2,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      await channelManager.startExit(alice) // channel.status = Status.ChannelDispute
      await userAuthorizedUpdate(init, alice).should.be.rejectedWith('channel must be open')
    })

  })
});
  

contract("ChannelManager::startExit", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  describe('startExit', () => {
    it("happy case", async() => {
      await channelManager.startExit(
        accounts[0]
      )
    })
  })
});


contract("ChannelManager::startExitWithUpdate", accounts => {
  let init
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  beforeEach(async () => {
    init = {
      "user" : [accounts[1], accounts[2]],
      "weiBalances" : [0, 0],
      "tokenBalances" : [0, 0],
      "pendingWeiUpdates" : [0, 0, 0, 0],
      "pendingTokenUpdates" : [0, 0, 0, 0],
      "txCount" : [1,1],
      "threadRoot" : emptyRootHash,
      "threadCount" : 0,
      "timeout" : 0
    }
  })  

  describe('startExitWithUpdate', () => {
    it("happy case", async() => {
      const hash = await web3.utils.soliditySha3(
        channelManager.address,
        {type: 'address[2]', value: init.user},
        {type: 'uint256[2]', value: init.weiBalances},
        {type: 'uint256[2]', value: init.tokenBalances},
        {type: 'uint256[4]', value: init.pendingWeiUpdates},
        {type: 'uint256[4]', value: init.pendingTokenUpdates},
        {type: 'uint256[2]', value: init.txCount},
        {type: 'bytes32', value: init.threadRoot},
        init.threadCount,
        init.timeout
      )
      const signatureHub = await web3.eth.accounts.sign(hash, privKeys[0])
      const signatureUser = await web3.eth.accounts.sign(hash, privKeys[1])

      init.sigHub = signatureHub.signature
      init.sigUser = signatureUser.signature
      
      await channelManager.startExitWithUpdate(
        init.user, 
        init.weiBalances,
        init.tokenBalances,
        init.pendingWeiUpdates,
        init.pendingTokenUpdates,
        init.txCount,
        init.threadRoot,
        init.threadCount,
        init.timeout,
        init.sigHub,
        init.sigUser
      )
    })
  })
});

contract("ChannelManager::emptyChannelWithChallenge", accounts => {
  let init
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  beforeEach(async () => {
    init = {
      "user" : [accounts[1], accounts[1]],
      "weiBalances" : [0, 0],
      "tokenBalances" : [0, 0],
      "pendingWeiUpdates" : [0, 0, 0, 0],
      "pendingTokenUpdates" : [0, 0, 0, 0],
      "txCount" : [1,1],
      "threadRoot" : emptyRootHash,
      "threadCount" : 0,
      "timeout" : 0
    }
  })  

  describe('emptyChannelWithChallenge', () => {
    it("happy case", async() => {
      const hash = await web3.utils.soliditySha3(
        channelManager.address,
        {type: 'address[2]', value: init.user},
        {type: 'uint256[2]', value: init.weiBalances},
        {type: 'uint256[2]', value: init.tokenBalances},
        {type: 'uint256[4]', value: init.pendingWeiUpdates},
        {type: 'uint256[4]', value: init.pendingTokenUpdates},
        {type: 'uint256[2]', value: init.txCount},
        {type: 'bytes32', value: init.threadRoot},
        init.threadCount,
        init.timeout
      )
      const signatureHub = await web3.eth.accounts.sign(hash, privKeys[0])
      const signatureUser = await web3.eth.accounts.sign(hash, privKeys[1])

      init.sigHub = signatureHub.signature
      init.sigUser = signatureUser.signature
      
      await channelManager.startExit(
        accounts[1]
      )

      await channelManager.emptyChannelWithChallenge(
        init.user, 
        init.weiBalances,
        init.tokenBalances,
        init.pendingWeiUpdates,
        init.pendingTokenUpdates,
        init.txCount,
        init.threadRoot,
        init.threadCount,
        init.timeout,
        init.sigHub,
        init.sigUser, 
        {from: accounts[1]}
      )
    })
  })
});

contract("ChannelManager::emptyChannel", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  describe('emptyChannel', () => {
    it("happy case", async() => {
      await channelManager.startExit(
        accounts[0]
      )
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(
        accounts[0]
      )
    })
  })
});

/*
contract("ChannelManager::startExitThread", accounts => {
  let init
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
    init = {
      "user" : accounts[0],
      "sender" : accounts[1],
      "receiver" : accounts[2],
      "weiBalances" : [0, 0],
      "tokenBalances" : [0, 0],
      "txCount" : 2,
      "proof" : emptyRootHash
    }
  })  

  describe('startExitThread', () => {
    it("happy case", async() => {

      const hash = await web3.utils.soliditySha3(
        channelManager.address,
        {type: 'address', value: init.user},
        {type: 'address', value: init.sender},
        {type: 'address', value: init.receiver},
        {type: 'uint256[2]', value: init.weiBalances},
        {type: 'uint256[2]', value: init.tokenBalances},
        {type: 'uint256[2]', value: init.txCount}
      )
      const sig = await web3.eth.accounts.sign(hash, privKeys[1])
  
      init.sig = sig.signature

      await hubDeposit(init.sender, init.receiver, 1, channelManager)

      await channelManager.startExit(
        accounts[1]
      )

      await moveForwardSecs(config.timeout + 1)

      await channelManager.emptyChannel(
        accounts[1]
      )

      await channelManager.startExitThread(
        init.user,
        init.sender,
        init.receiver,
        init.weiBalances,
        init.tokenBalances,
        init.txCount,
        init.proof,
        init.sig
      )
    })
  })
});


// TODO
contract("ChannelManager::startExitThreadWithUpdate", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  describe('startExitThreadWithUpdate', () => {
    it("happy case", async() => {
      await channelManager.startExitThreadWithUpdate(
        accounts[0]
      )
    })
  })
});

// TODO
contract("ChannelManager::fastEmptyThread", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  describe('fastEmptyThread', () => {
    it("happy case", async() => {
      await channelManager.fastEmptyThread(
        accounts[0]
      )
    })
  })
});

// TODO
contract("ChannelManager::emptyThread", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  describe('emptyThread', () => {
    it("happy case", async() => {
      await channelManager.emptyThread(
        accounts[0]
      )
    })
  })
});

// TODO
contract("ChannelManager::nukeThreads", accounts => {
  before('deploy contracts', async () => {
    channelManager = await Ledger.deployed()
  })  

  describe('nukeThreads', () => {
    it("happy case", async() => {
      await channelManager.nukeThreads(
        accounts[0]
      )
    })
  })
});

*/