"use strict";
const HttpProvider = require(`ethjs-provider-http`)
const EthRPC = require(`ethjs-rpc`)
const ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'))
const Utils = require("./helpers/utils");
const ChannelManager = artifacts.require("./ChannelManager.sol");
const EC = artifacts.require("./ECTools.sol");
const Token = artifacts.require("./lib/StandardToken.sol");
const privKeys = require("./privKeys.json")

const config = require("../config.json")

const should = require("chai")
  .use(require("chai-as-promised"))
  .should();

const emptyRootHash = "0x0000000000000000000000000000000000000000000000000000000000000000"

async function snapshot() {
  return new Promise((accept, reject) => {
    ethRPC.sendAsync({method: `evm_snapshot`}, (err, result)=> {
      if (err) {
        reject(err)
      } else {
        accept(result)
      }
    })
  })
}

async function restore(snapshotId) {
  return new Promise((accept, reject) => {
    ethRPC.sendAsync({method: `evm_revert`, params: [snapshotId]}, (err, result) => {
      if (err) {
        reject(err)
      } else {
        accept(result)
      }
    })
  })
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

// NOTE : ganache-cli -m 'refuse result toy bunker royal small story exhaust know piano base stand'
// NOTE : hub : accounts[0], privKeys[0]

contract('ChannelManager', (accounts) => {
  let snapshotId, channelManager, token, hub, alice, bob, charlie, dan, elon, fred, greg, hank
  
  async function updateHash(data, privateKey) {
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
    const sig = await web3.eth.accounts.sign(hash, privateKey)
    return sig.signature
  }
  
  async function updateThreadHash(data, privateKey) {
    const hash = await web3.utils.soliditySha3(
      channelManager.address,
      {type: 'address', value: data.user},
      {type: 'address', value: data.sender},
      {type: 'address', value: data.receiver},
      {type: 'uint256[2]', value: data.weiBalances},
      {type: 'uint256[2]', value: data.tokenBalances},
      {type: 'uint256[2]', value: data.txCount}
    )
    const sig = await web3.eth.accounts.sign(hash, privateKey)
    return sig.signature
  }
  
  async function hubDeposit(user, userPrivKey, recipient, numThreads, weiBalances=[0,0], tokenBalances=[0,0]) {
    const init = {
      "user" : user,
      "recipient" : recipient,
      "weiBalances" : weiBalances,
      "tokenBalances" : tokenBalances,
      "pendingWeiUpdates" : [0, 0, 0, 0],
      "pendingTokenUpdates" : [0, 0, 0, 0],
      "txCount" : [1,1],
      "threadRoot" : emptyRootHash,
      "threadCount" : numThreads,
      "timeout" : 0
    }
  
    init.sigUser = await updateHash(init, userPrivKey)
  
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
  }
  
  async function userAuthorizedUpdate(data, user, val=0) {
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
      {from: user, value: val}
    )
  }
  
  async function hubAuthorizedUpdate(data, hub) {
    await channelManager.hubAuthorizedUpdate(
      data.user, 
      data.recipient,
      data.weiBalances,
      data.tokenBalances,
      data.pendingWeiUpdates,
      data.pendingTokenUpdates,
      data.txCount,
      data.threadRoot,
      data.threadCount,
      data.timeout,
      data.sigUser,
      {from: hub}
    )
  }
  
  
  async function emptyChannelWithChallenge(data, user) {
    await channelManager.emptyChannelWithChallenge(
      [data.user, data.recipient], 
      data.weiBalances,
      data.tokenBalances,
      data.pendingWeiUpdates,
      data.pendingTokenUpdates,
      data.txCount,
      data.threadRoot,
      data.threadCount,
      data.timeout,
      data.sigHub,
      data.sigUser, 
      {from: user}
    )
  }
  
  async function startExitWithUpdate(data, user) {
    await channelManager.startExitWithUpdate(
      [data.user, data.recipient], 
      data.weiBalances,
      data.tokenBalances,
      data.pendingWeiUpdates,
      data.pendingTokenUpdates,
      data.txCount,
      data.threadRoot,
      data.threadCount,
      data.timeout,
      data.sigHub,
      data.sigUser,
      {from:user}
    ) 
  }
  
  async function startExitThread(data, user) {
    await channelManager.startExitThread(
      data.user,
      data.sender,
      data.receiver,
      data.weiBalances,
      data.tokenBalances,
      data.txCount,
      data.proof,
      data.sig,
      {from: user}
    )
  }
  
  async function emptyThread(data, user) {
    await channelManager.emptyThread(
      data.user,
      data.sender,
      data.receiver,
      {from: user}
    )
  }
  
  async function startExitThreadWithUpdate(data, user) {
    await channelManager.startExitThreadWithUpdate(
      data.user,
      [data.sender,data.receiver],
      data.weiBalances,
      data.tokenBalances,
      data.txCount,
      data.proof,
      data.sig,
      data.updatedWeiBalances,
      data.updatedTokenBalances,
      data.updatedTxCount,
      {from: user}
    )
  }

  before('deploy contracts', async () => {
    channelManager = await ChannelManager.deployed()
    token = await Token.deployed()
    hub = {
      address: accounts[0],
      privateKey : privKeys[0]
    }
    alice = {
      address: accounts[1],
      privateKey : privKeys[1]
    }
    bob = {
      address: accounts[2],
      privateKey : privKeys[2]
    }
    charlie = {
      address: accounts[3],
      privateKey : privKeys[3]
    }
    dan = {
      address: accounts[4],
      privateKey : privKeys[4]
    }
    elon = {
      address: accounts[5],
      privateKey: privKeys[5]
    }
    fred = {
      address: accounts[6],
      privateKey: privKeys[6]
    }
    greg = {
      address: accounts[7],
      privateKey: privKeys[7]
    }
    hank = {
      address: accounts[8],
      privateKey: privKeys[8]
    }
  })

  beforeEach(async () => {
    snapshotId = await snapshot()
  })

  afterEach(async () => {
    await restore(snapshotId)
  })
  
  describe("constructor", () => {
    it("verify initialized parameters", async() => {
      const hubAddress = await channelManager.hub()
      const challengePeriod = await channelManager.challengePeriod()
      const approvedToken = await channelManager.approvedToken()
      assert.equal(hubAddress, accounts[0])
      assert.equal(challengePeriod.toNumber(), config.timeout)
      assert.equal(approvedToken, token.address)
    })
  })
  
  describe("hubContractWithdraw", () => {  
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
  
  describe("hubAuthorizedUpdate", () => {
    let init
  
    beforeEach(async () => {
      init = {
        "user" : alice.address,
        "recipient" : bob.address,
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
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address)
    })

    it("FAIL : pending wei updates", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [0,0,0,1]
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('VM Exception while processing transaction: revert')
    })

    it("FAIL: _verifyAuthorizedUpdate: timeout", async() => {
      init.txCount = [2,1]
      init.timeout = 1
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('the timeout must be zero or not have passed')
    })

    it("FAIL: _verifyAuthorizedUpdate: global txCount", async() => {
      init.txCount = [1,1]
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('global txCount must be higher than the current global txCount')
    })

    it("FAIL: _verifyAuthorizedUpdate: onchain txCount", async() => {
      init.txCount = [2,0]
      
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
    })

    it("FAIL: _verifyAuthorizedUpdate: wei conservation", async() => {
      init.txCount = [2,1]
      init.weiBalances = [0, 1]
      
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('wei must be conserved')
    })

    it("FAIL: _verifyAuthorizedUpdate: token conservation", async() => {
      init.txCount = [2,1]
      init.tokenBalances = [0, 1]
      
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('tokens must be conserved')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient reserve wei", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [1,0,0,0]
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('insufficient reserve wei for deposits')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient reserve token", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [1,0,0,0]
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('insufficient reserve tokens for deposits')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [0,1,0,1]
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('insufficient wei')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient token", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [0,1,0,1]
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('insufficient token')
    })

    it("FAIL: _verifySig: user is hub", async() => {
      init.txCount = [2,1]
      init.user = hub.address
      init.sigUser = await updateHash(init, alice.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('user can not be hub')
    })

    it("FAIL: _verifySig: user signature invalid", async() => {
      init.txCount = [2,1]
      init.sigUser = await updateHash(init, bob.privateKey)
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('user signature invalid')
    })

    it("FAIL: _verifyAuthorizedUpdate: Channel not open", async() => {
      init.txCount = [2,1]
      init.sigUser = await updateHash(init, alice.privateKey)
      await channelManager.startExit(alice.address) // channel.status = Status.ChannelDispute
      await hubAuthorizedUpdate(init, hub.address).should.be.rejectedWith('channel must be open')
    })
  });
  
  describe("userAuthorizedUpdate", () => {
    let init

    beforeEach(async () => {
      init = {
        "user" : alice.address,
        "recipient" : bob.address,
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
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('userAuthorizedUpdate: msg.value is not equal to pending user deposit')
    })

    it("FAIL: token deposit", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [0,0,1,0] // should fail

      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('VM Exception while processing transaction: revert')
    })

    it("FAIL: Wei transfer", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [0,0,0,1] // should fail

      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('VM Exception while processing transaction: revert')
    })

    it("FAIL: Token transfer", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [0,0,0,1] // should fail

      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('VM Exception while processing transaction: revert')
    })

    it("FAIL: _verifyAuthorizedUpdate: global txCount", async() => {
      init.txCount = [1,1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('global txCount must be higher than the current global txCount')
    })

    it("FAIL: _verifyAuthorizedUpdate: onchain txCount", async() => {
      init.txCount = [2,0]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
    })

    it("FAIL: _verifyAuthorizedUpdate: timeout", async() => {
      init.txCount = [2,1]
      init.timeout = 1
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('the timeout must be zero or not have passed')
    })

    it("FAIL: _verifyAuthorizedUpdate: wei conservation", async() => {
      init.txCount = [2,1]
      init.weiBalances = [0, 1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('wei must be conserved')
    })

    it("FAIL: _verifyAuthorizedUpdate: token conservation", async() => {
      init.txCount = [2,1]
      init.tokenBalances = [0, 1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('tokens must be conserved')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient reserve wei", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [1,0,0,0]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('insufficient reserve wei for deposits')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient reserve token", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [1,0,0,0]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('insufficient reserve tokens for deposits')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
      init.txCount = [2,1]
      init.pendingWeiUpdates = [0,1,0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('insufficient wei')
    })

    it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
      init.txCount = [2,1]
      init.pendingTokenUpdates = [0,1,0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('insufficient token')
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
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('hub signature invalid')
    })

    it("FAIL: _verifyAuthorizedUpdate: Channel not open", async() => {
      init.txCount = [2,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      await channelManager.startExit(alice.address) // channel.status = Status.ChannelDispute
      await userAuthorizedUpdate(init, alice.address).should.be.rejectedWith('channel must be open')
    })
  })
  
  describe("startExit", () => {
    let init

    it("FAIL : not user or hub", async() => {
      await channelManager.startExit(
        hub.address,
        {from: bob.address}
      ).should.be.rejectedWith('exit initiator must be user or hub')
    })

    it("happy case", async() => {
      await channelManager.startExit(
        hub.address
      )
    })

    it("FAIL : channel not open", async() => {
      await channelManager.startExit(
        hub.address
      ).should.be.rejectedWith('channel must be open')
    })
  });
  
  describe("startExitWithUpdate", accounts => {
    let init 
  
    beforeEach(async () => {
      init = {
        "user" : alice.address,
        "recipient" : bob.address,
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
      init.user = charlie.address
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, charlie.privateKey)

      await startExitWithUpdate(init, hub.address)
    })

    it("FAIL : not user or hub", async() => {
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)
      
      await startExitWithUpdate(init, bob.address).should.be.rejectedWith('exit initiator must be user or hub')
    })

    it("FAIL : timeout not zero", async() => {
      init.timeout = 1
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)

      await startExitWithUpdate(init, hub.address).should.be.rejectedWith('can\'t start exit with time-sensitive states')
    })

    it("FAIL: _verifySig: user is hub", async() => {
      init.user = hub.address
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)

      await startExitWithUpdate(init, hub.address).should.be.rejectedWith('user can not be hub')
    })

    it("FAIL: _verifyAuthorizedUpdate: global txCount", async() => {
      init.txCount = [0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)

      await startExitWithUpdate(init, hub.address).should.be.rejectedWith('global txCount must be higher than the current global txCount')
    })

    // it("FAIL: _verifyAuthorizedUpdate: onchain txCount", async() => {
    //   const weiDeposit = 1
    //   init.user = bob.address
    //   init.txCount = [2,0]
    //   init.pendingWeiUpdates = [0,0,weiDeposit,0]
    //   init.sigHub = await updateHash(init, hub.privateKey)
    //   init.sigUser = await updateHash(init, alice.privateKey)

    //   await userAuthorizedUpdate(init, bob.address, weiDeposit)
    //   await startExitWithUpdate(init, hub.address).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
    // })

    it("FAIL: _verifyAuthorizedUpdate: wei conservation", async() => {
      init.txCount = [2,1]
      init.weiBalances = [0, 1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)
      await startExitWithUpdate(init, hub.address).should.be.rejectedWith('wei must be conserved')
    })

    it("FAIL: _verifyAuthorizedUpdate: token conservation", async() => {
      init.txCount = [2,1]
      init.tokenBalances = [0, 1]
      
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)
      await startExitWithUpdate(init, hub.address).should.be.rejectedWith('tokens must be conserved')
    })


    it("FAIL: channel not open", async() => {
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)
      
      await channelManager.startExit(alice.address) // channel.status = Status.ChannelDispute
      await startExitWithUpdate(init, hub.address).should.be.rejectedWith('channel must be open')
    })
  })
  
  describe("emptyChannelWithChallenge", () => {
    let init 
  
    beforeEach(async () => {
      init = {
        "user" : alice.address,
        "recipient" : bob.address,
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
  
    it("FAIL: channel not in dispute", async() => {
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)

      await emptyChannelWithChallenge(init, alice.address).should.be.rejectedWith('channel must be in dispute')
    })

    it("FAIL: channel timeout", async() => {
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, alice.privateKey)

      await channelManager.startExit(alice.address)
      await moveForwardSecs(config.timeout + 1)
      await emptyChannelWithChallenge(init, alice.address).should.be.rejectedWith('channel closing time must not have passed')
    })

    it("FAIL: challenger is exit initiator", async() => {
      init.user = bob.address
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, bob.privateKey)
      init.timeout = Math.floor(Date.now()/1000) + config.timeout
      
      await channelManager.startExit(bob.address, {from: bob.address})
      await emptyChannelWithChallenge(init, bob.address).should.be.rejectedWith('challenger can not be exit initiator')
    })

    it("FAIL: challenger either user or hub", async() => {
      init.user = bob.address
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, bob.privateKey)
      init.timeout = Math.floor(Date.now()/1000) + config.timeout
      
      await emptyChannelWithChallenge(init, alice.address).should.be.rejectedWith('challenger must be either user or hub')
    })
    
    it("FAIL: non-zero timeout", async() => {
      init.user = bob.address
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, bob.privateKey)
      init.timeout = 1
      
      await emptyChannelWithChallenge(init, hub.address).should.be.rejectedWith('can\'t start exit with time-sensitive states')
    })

    it("FAIL: global txCount", async() => {
      init.txCount = [1,1]
      init.user = charlie.address
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, charlie.privateKey)
      await hubAuthorizedUpdate(init, hub.address)
      await channelManager.startExit(charlie.address)
      await emptyChannelWithChallenge(init, charlie.address).should.be.rejectedWith('global txCount must be higher than the current global txCount')
    })
    
    it("FAIL: onchain txCount", async() => {
      init.txCount = [2,0]
      init.user = charlie.address
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, charlie.privateKey)
      await emptyChannelWithChallenge(init, charlie.address).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
    })

    it("FAIL: wei conservation", async() => {
      init.txCount = [2,1]
      init.user = charlie.address
      init.weiBalances = [0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, charlie.privateKey)
      await emptyChannelWithChallenge(init, charlie.address).should.be.rejectedWith('wei must be conserved')
    })

    it("FAIL: tokens conservation", async() => {
      init.txCount = [2,1]
      init.user = charlie.address
      init.tokenBalances = [0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, charlie.privateKey)
      await emptyChannelWithChallenge(init, charlie.address).should.be.rejectedWith('tokens must be conserved')
    })

    it("happy case", async() => {
      const weiDeposit = 100
      init.txCount = [1,1]
      init.user = dan.address
      init.pendingWeiUpdates = [0,0,weiDeposit,0]
      init.tokenBalances = [0,0]
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, dan.privateKey)
      await userAuthorizedUpdate(init, dan.address, weiDeposit)
      
      await channelManager.startExit(dan.address)
      
      init.txCount = [2,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, dan.privateKey)
      await emptyChannelWithChallenge(init, dan.address) //.should.be.rejectedWith('tokens must be conserved')
    })
  })

  describe("emptyChannel", () => {
    let init
  
    it("FAIL : channel not in dispute", async() => {
      await channelManager.emptyChannel(hub.address).should.be.rejectedWith('channel must be in dispute')
    })

    it("FAIL : channel closing time not passed", async() => {
      await channelManager.startExit(hub.address)
      await channelManager.emptyChannel(hub.address).should.be.rejectedWith('channel closing time must have passed')
    })

    it("happy case", async() => {
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(hub.address)
    })
  })

  describe("startExitThread", accounts => {
    let init

    beforeEach('deploy contracts', async () => {
      init = {
        "user" : alice.address,
        "sender" : hub.address,
        "receiver" : bob.address,
        "weiBalances" : [0, 0],
        "tokenBalances" : [0, 0],
        "txCount" : 2,
        "proof" : emptyRootHash
      }
    })  
  
    it("FAIL : not in thread dispute phase", async() => {
      init.sig = await updateThreadHash(init, alice.privateKey)
      await startExitThread(init, hub.address).should.be.rejectedWith('channel must be in thread dispute phase')
    })

    it("FAIL : channel closing time has not passed", async() => {
      await hubDeposit(alice.address, alice.privateKey, bob.address, 2)
      await channelManager.startExit(alice.address)
      await moveForwardSecs(config.timeout + 1) 
      await channelManager.emptyChannel(alice.address)
      await moveForwardSecs(config.timeout + 1) 
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address).should.be.rejectedWith('channel thread closing time must not have passed')
    })

    it("FAIL: initiator is not user or hub", async() => {
      init.user = bob.address
      init.receiver = chad.address
      await hubDeposit(bob.address, bob.privateKey, chad.address, 2)
      await channelManager.startExit(bob.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(bob.address)
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, alice.address).should.be.rejectedWith('thread exit initiator must be user or hub')
    })

    it("FAIL: already in dispute", async() => {
      init.user = chad.address
      init.receiver = alice.address
      await hubDeposit(chad.address, chad.privateKey, alice.address, 2)
      await channelManager.startExit(chad.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(chad.address)
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address)
      await startExitThread(init, hub.address).should.be.rejectedWith('thread must not already be in dispute')
    })

    it("FAIL: txCount not higher", async() => {
      init.user = elon.address
      init.receiver = chad.address
      await hubDeposit(elon.address, elon.privateKey, chad.address, 2)
      await channelManager.startExit(elon.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(elon.address)
      init.txCount = 1
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address)
    })

    it("FAIL: _verifyThread - sender is receiver", async() => {
      init.user = init.receiver = fred.address
      await hubDeposit(fred.address, fred.privateKey, fred.address, 2)
      await channelManager.startExit(fred.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(fred.address)
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address)
    })

    it("FAIL: _verifyThread - signature does not match", async() => {
      init.user = dan.address
      init.receiver = chad.address
      await hubDeposit(dan.address, dan.privateKey, chad.address, 2)
      await channelManager.startExit(dan.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(dan.address)
      init.sig = await updateThreadHash(init, alice.privateKey)
      await startExitThread(init, hub.address).should.be.rejectedWith('revert')
    })

    it("FAIL: not in threadRoot", async() => {
      init.user = hank.address
      init.receiver = alice.address
      init.threadRoot = "0x000000000000000000000000000000000000000000000000000000000000001"
      await hubDeposit(hank.address, hank.privateKey, alice.address, 2)
      await channelManager.startExit(hank.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(hank.address)
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address)
    })

    it("happy case", async() => {
      init.user = greg.address
      init.receiver = chad.address
      await hubDeposit(greg.address, greg.privateKey, chad.address, 2)
      await channelManager.startExit(greg.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(greg.address)
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address)
    })
  })
  
  
  /*
  // TODO
  contract("ChannelManager::startExitThreadWithUpdate", accounts => {
    let hub, alice, bob, chad, dan, elon, fred, greg, hank, init
    before('deploy contracts', async () => {
      channelManager = await Ledger.deployed()
      hub = {
        address: accounts[0],
        privateKey: privKeys[0]
      }
      alice = {
        address: accounts[1],
        privateKey: privKeys[1]
      }
      bob = {
        address: accounts[2],
        privateKey: privKeys[2]
      }
      chad = {
        address: accounts[3],
        privateKey: privKeys[3]
      }
      dan = {
        address: accounts[4],
        privateKey: privKeys[4]
      }
      elon = {
        address: accounts[5],
        privateKey: privKeys[5]
      }
      fred = {
        address: accounts[6],
        privateKey: privKeys[6]
      }
      greg = {
        address: accounts[7],
        privateKey: privKeys[7]
      }
      hank = {
        address: accounts[8],
        privateKey: privKeys[8]
      }
      init = {
        "user" : alice.address,
        "sender" : hub.address,
        "receiver" : bob.address,
        "weiBalances" : [1, 0],
        "tokenBalances" : [1, 0],
        "txCount" : 2,
        "proof" : emptyRootHash,
        "updatedWeiBalances" : [0,1],
        "updatedTokenBalances" : [0,1],
        "updatedTxCount" : 3,
      }
      
    })  
  
    describe('startExitThreadWithUpdate', () => {
      it("happy case", async() => {
        init.user = alice.address
        init.receiver = bob.address
        await hubDeposit(alice.address, alice.privateKey, bob.address, init.txCount, init.weiBalances, init.tokenBalances)
        await channelManager.startExit(alice.address)
        await moveForwardSecs(config.timeout + 1)
        await channelManager.emptyChannel(alice.address)
        init.sig = await updateThreadHash(init, hub.privateKey)
        await startExitThreadWithUpdate(init, hub.address)
      })
    })
  });
  */
  
  /*
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
  
  */
  
  describe("emptyThread", accounts => {
    let init
  
    beforeEach(async () => {
      init = {
        "user" : alice.address,
        "sender" : hub.address,
        "receiver" : bob.address,
        "weiBalances" : [0, 0],
        "tokenBalances" : [0, 0],
        "txCount" : 2,
        "proof" : emptyRootHash
      }
    })
  
    it("FAIL: channel must be in thread dispute", async () => {
      init.user = alice.address
      init.receiver = bob.address
      await hubDeposit(alice.address, alice.privateKey, bob.address, 2)
      await channelManager.startExit(alice.address)
      await emptyThread(init, hub.address).should.be.rejectedWith('channel must be in thread dispute')
    })

    it("FAIL: thread closing time must have passed", async () => {
      init.user = alice.address
      init.receiver = bob.address
      await hubDeposit(alice.address, alice.privateKey, bob.address, 2)
      await channelManager.startExit(alice.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(alice.address)
      await emptyThread(init, hub.address).should.be.rejectedWith('thread closing time must have passed')
    })

    it("FAIL: thread closing time must have passed", async () => {
      init.user = alice.address
      init.receiver = bob.address
      await hubDeposit(alice.address, alice.privateKey, bob.address, 2)
      await channelManager.startExit(alice.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(alice.address)
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address)
      await emptyThread(init, hub.address).should.be.rejectedWith('thread closing time must have passed')
    })

    it("happy path", async () => {
      init.user = alice.address
      init.receiver = bob.address
      await hubDeposit(alice.address, alice.privateKey, bob.address, 2)
      await channelManager.startExit(alice.address)
      await moveForwardSecs(config.timeout + 1)
      await channelManager.emptyChannel(alice.address)
      init.sig = await updateThreadHash(init, hub.privateKey)
      await startExitThread(init, hub.address)
      await moveForwardSecs(config.timeout + 1)
      await emptyThread(init, hub.address)
    })
  })
  
  /*
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
})
