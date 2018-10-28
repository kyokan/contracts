    "use strict";
const HttpProvider = require(`ethjs-provider-http`)
const EthRPC = require(`ethjs-rpc`)
const ethRPC = new EthRPC(new HttpProvider('http://localhost:8545'))
const Utils = require("./helpers/utils");
const Ledger = artifacts.require("./ChannelManager.sol");
const EC = artifacts.require("./ECTools.sol");
const Token = artifacts.require("./lib/StandardToken.sol");
const Connext = require("../client/dist/Utils.js");
const privKeys = require("./privKeys.json")


const config = require("../config.json")

const should = require("chai")
  .use(require("chai-as-promised"))
  .should();

const SolRevert = "VM Exception while processing transaction: revert";

const emptyRootHash =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
  
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

async function hubAuthorizedUpdate(data) {
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
    {from: hub.address}
  )
}

async function userAuthorizedUpdate(data, user, wei=0) {
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
      {from: user.address, value:wei}
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

// NOTE : ganache-cli -m 'refuse result toy bunker royal small story exhaust know piano base stand'

// NOTE : hub : accounts[0], privKeys[0]

let channelManager, tokenAddress, hubAddress, challengePeriod, approvedToken
let hub, performer, viewer, init

contract("ChannelManager", accounts => {
    let snapshotId
    
    before('deploy contracts', async () => {
        channelManager = await Ledger.deployed()
        tokenAddress = await Token.deployed()

        hub = {
            address: accounts[0],
            privateKey : privKeys[0]
        }
        performer = {
            address: accounts[1],
            privateKey : privKeys[1]
        }
        viewer = {
            address: accounts[2],
            privateKey : privKeys[2]
        }
    })

    beforeEach(async () => {
        snapshotId = await snapshot()
        init = {
            "hub": hub.address,
            "user" : viewer.address,
            "recipient" : performer.address,
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
    afterEach(async () => {
        await restore(snapshotId)
    })


   describe('emptyChannelWithChallenge', () => {
    it("happy case", async() => {
        const weiDeposit = 100
        init.pendingWeiUpdates = [0,0,weiDeposit,0]
        init.tokenBalances = [0,0]
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await userAuthorizedUpdate(init, viewer, weiDeposit)
        
        await channelManager.startExit(viewer.address)
        
        init.txCount = [2,1]
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await emptyChannelWithChallenge(init, viewer.address) 
      })

    it("FAIL: channel not in dispute", async() => {
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await emptyChannelWithChallenge(init, viewer.address).should.be.rejectedWith('channel must be in dispute')
    })

    it("FAIL: channel timeout", async() => {
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await channelManager.startExit(viewer.address)
        await moveForwardSecs(config.timeout + 1)
        await emptyChannelWithChallenge(init, viewer.address).should.be.rejectedWith('channel closing time must not have passed')
    })

    it("FAIL: challenger is exit initiator", async() => {
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await channelManager.startExit(viewer.address, {from: viewer.address})
        await emptyChannelWithChallenge(init, viewer.address).should.be.rejectedWith('challenger can not be exit initiator')
    })

    it("FAIL: challenger either user or hub", async() => {
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await channelManager.startExit(viewer.address, {from: viewer.address})
        await emptyChannelWithChallenge(init, performer.address).should.be.rejectedWith('challenger must be either user or hub')
    })
    
    it("FAIL: non-zero timeout", async() => {
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        init.timeout = 1
        await channelManager.startExit(viewer.address, {from: viewer.address})
        await emptyChannelWithChallenge(init, hub.address).should.be.rejectedWith('can\'t start exit with time-sensitive states')
    })

    it("FAIL: global txCount", async() => {
        init.txCount = [1,1]
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await hubAuthorizedUpdate(init, hub.address)
        await channelManager.startExit(viewer.address)
        await emptyChannelWithChallenge(init, viewer.address).should.be.rejectedWith('global txCount must be higher than the current global txCount')
    })
    
    it("FAIL: onchain txCount", async() => {
        const weiDeposit = 1
        init.sigUser = await updateHash(init, viewer.privateKey)
        await hubAuthorizedUpdate(init)

        init.txCount = [2,2]
        init.pendingWeiUpdates = [0,0,weiDeposit,0]
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await userAuthorizedUpdate(init, viewer, weiDeposit)
        
        init.txCount = [3,1]
        init.pendingWeiUpdates = [0,0,weiDeposit,0]
        init.sigHub = await updateHash(init, hub.privateKey)
        init.sigUser = await updateHash(init, viewer.privateKey)
        await channelManager.startExit(viewer.address)
        await emptyChannelWithChallenge(init, viewer.address).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
    })

    it("FAIL: wei conservation", async() => {
      init.txCount = [2,1]
      init.weiBalances = [0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, viewer.privateKey)
      await channelManager.startExit(viewer.address)
      await emptyChannelWithChallenge(init, viewer.address).should.be.rejectedWith('wei must be conserved')
    })

    it("FAIL: tokens conservation", async() => {
      init.txCount = [2,1]
      init.tokenBalances = [0,1]
      init.sigHub = await updateHash(init, hub.privateKey)
      init.sigUser = await updateHash(init, viewer.privateKey)
      await channelManager.startExit(viewer.address)
      await emptyChannelWithChallenge(init, viewer.address).should.be.rejectedWith('tokens must be conserved')
    })
  })



    describe('deployment', () => {
        it("verify hub address", async() => {
            const hubAddress = await channelManager.hub()
            assert.equal(hubAddress, accounts[0])
        })
        it("verify challenge period", async() => {
            const challengePeriod = await channelManager.challengePeriod()
            assert.equal(+challengePeriod, config.timeout)
        })
        it("verify approved token", async() => {
            const approvedToken = await channelManager.approvedToken()
            assert.equal(approvedToken, tokenAddress.address)
        })
    })

    describe('hubAuthorizedUpdate', () => {
        it("happy case", async() => {
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init)
        })

        it("FAIL : pending wei updates", async() => {
            init.pendingWeiUpdates = [0,0,0,1]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('VM Exception while processing transaction: revert')
        })

        it("FAIL: _verifyAuthorizedUpdate: timeout", async() => {
            init.timeout = 1
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('the timeout must be zero or not have passed')
        })

        it("FAIL: _verifyAuthorizedUpdate: global txCount", async() => {
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init)
            init.txCount = [0,1]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('global txCount must be higher than the current global txCount')
          })
      
        it("FAIL: _verifyAuthorizedUpdate: onchain txCount", async() => {
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init)
            init.txCount = [2,0]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: wei conservation", async() => {
            init.weiBalances = [1,0]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('wei must be conserved')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: token conservation", async() => {
            init.tokenBalances = [0,1]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('tokens must be conserved')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient reserve wei", async() => {
            init.pendingWeiUpdates = [1,0,0,0]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('insufficient reserve wei for deposits')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient reserve token", async() => {
            init.pendingTokenUpdates = [1,0,0,0]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('insufficient reserve tokens for deposits')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
            init.pendingWeiUpdates = [0,1,0,1]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('insufficient wei')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient token", async() => {
            init.pendingTokenUpdates = [0,1,0,1]
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('insufficient token')
        })
    
        it("FAIL: _verifySig: user is hub", async() => {
            init.user = hub.address
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('user can not be hub')
        })
    
        it("FAIL: _verifySig: user signature invalid", async() => {
            init.sigUser = await updateHash(init, performer.privateKey)
            await hubAuthorizedUpdate(init).should.be.rejectedWith('user signature invalid')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: Channel not open", async() => {
            init.sigUser = await updateHash(init, viewer.privateKey)
            await channelManager.startExit(viewer.address) // channel.status = Status.ChannelDispute
            await hubAuthorizedUpdate(init).should.be.rejectedWith('channel must be open')
        })
    })

    describe('userAuthorizedUpdate', () => {    
        it("happy case", async() => {
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer)
        })

        it("FAIL: msg.value not equal to deposit", async() => {
            init.txCount = [2,1]
            init.pendingWeiUpdates = [0,0,1,0]
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('userAuthorizedUpdate: msg.value is not equal to pending user deposit')
        })

        it("FAIL: token deposit", async() => {
            init.txCount = [2,1]
            init.pendingTokenUpdates = [0,0,1,0] // should fail

            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('VM Exception while processing transaction: revert')
        })
    
        it("FAIL: Wei transfer", async() => {
            init.txCount = [2,1]
            init.pendingWeiUpdates = [0,0,0,1] // should fail

            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('VM Exception while processing transaction: revert')
        })
    
        it("FAIL: Token transfer", async() => {
            init.txCount = [2,1]
            init.pendingTokenUpdates = [0,0,0,1] // should fail

            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('VM Exception while processing transaction: revert')
        })
  
        it("FAIL: _verifyAuthorizedUpdate: global txCount", async() => {
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer)
            init.txCount = [0,1]
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('global txCount must be higher than the current global txCount')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: onchain txCount", async() => {
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer)
            init.txCount = [2,0]
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
        })
  
        it("FAIL: _verifyAuthorizedUpdate: timeout", async() => {
            init.txCount = [2,1]
            init.timeout = 1
            
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('the timeout must be zero or not have passed')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: wei conservation", async() => {
            init.txCount = [2,1]
            init.weiBalances = [0, 1]
            
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('wei must be conserved')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: token conservation", async() => {
            init.txCount = [2,1]
            init.tokenBalances = [0, 1]
            
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('tokens must be conserved')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient reserve wei", async() => {
            init.txCount = [2,1]
            init.pendingWeiUpdates = [1,0,0,0]
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('insufficient reserve wei for deposits')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient reserve token", async() => {
            init.txCount = [2,1]
            init.pendingTokenUpdates = [1,0,0,0]
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('insufficient reserve tokens for deposits')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
            init.txCount = [2,1]
            init.pendingWeiUpdates = [0,1,0,1]
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('insufficient wei')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: insufficient wei", async() => {
            init.txCount = [2,1]
            init.pendingTokenUpdates = [0,1,0,1]
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('insufficient token')
        })

        it("FAIL: _verifySig: user is hub", async() => {
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer)
            init.txCount = [2,1]
            init.user = hub.address
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, hub).should.be.rejectedWith('user can not be hub')
        })

        it("FAIL: _verifySig: hub signature invalid", async() => {
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer)
            init.txCount = [2,1]
            init.user = hub.address
            init.sigHub = await updateHash(init, hub.privateKey)
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('hub signature invalid')
        })

        it("FAIL: _verifyAuthorizedUpdate: Channel not open", async() => {

            init.sigHub = await updateHash(init, hub.privateKey)
            await channelManager.startExit(viewer.address) // channel.status = Status.ChannelDispute
            await userAuthorizedUpdate(init, viewer).should.be.rejectedWith('channel must be open')
        })    
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

    describe('startExit', () => {
        it("happy case", async() => {
            await channelManager.startExit(hub.address)
        })
        it("FAIL : not user or hub", async() => {
            await channelManager.startExit(hub.address, {from: performer.address}).should.be.rejectedWith('exit initiator must be user or hub')
        })
        it("FAIL : channel not open", async() => {
            await channelManager.startExit(hub.address)
            await channelManager.startExit(hub.address).should.be.rejectedWith('channel must be open')
        })
    })

    describe('startExitWithUpdate', () => {
        it("happy case", async() => {
          init.user = viewer.address
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
          await startExitWithUpdate(init, hub.address)
        })

        it("FAIL : not user or hub", async() => {
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
          
          await startExitWithUpdate(init, performer.address).should.be.rejectedWith('exit initiator must be user or hub')
        })

        it("FAIL : timeout not zero", async() => {
          init.timeout = 1
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
    
          await startExitWithUpdate(init, hub.address).should.be.rejectedWith('can\'t start exit with time-sensitive states')
        })

        it("FAIL: _verifySig: user is hub", async() => {
          init.user = hub.address
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
    
          await startExitWithUpdate(init, hub.address).should.be.rejectedWith('user can not be hub')
        })

        it("FAIL: _verifyAuthorizedUpdate: global txCount", async() => {
          init.txCount = [0,1]
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
    
          await startExitWithUpdate(init, hub.address).should.be.rejectedWith('global txCount must be higher than the current global txCount')
        })
                
        it("FAIL: _verifyAuthorizedUpdate: onchain txCount", async() => {
            const weiDeposit = 1
            init.sigUser = await updateHash(init, viewer.privateKey)
            await hubAuthorizedUpdate(init)

            init.txCount = [2,2]
            init.pendingWeiUpdates = [0,0,weiDeposit,0]
            init.sigHub = await updateHash(init, hub.privateKey)
            init.sigUser = await updateHash(init, viewer.privateKey)
            await userAuthorizedUpdate(init, viewer, weiDeposit)
            
            init.txCount = [3,1]
            init.pendingWeiUpdates = [0,0,weiDeposit,0]
            init.sigHub = await updateHash(init, hub.privateKey)
            init.sigUser = await updateHash(init, viewer.privateKey)
            await startExitWithUpdate(init, hub.address).should.be.rejectedWith('onchain txCount must be higher or equal to the current onchain txCount')
        })
   
        it("FAIL: _verifyAuthorizedUpdate: wei conservation", async() => {
          init.txCount = [2,1]
          init.weiBalances = [0, 1]
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
          await startExitWithUpdate(init, viewer.address).should.be.rejectedWith('wei must be conserved')
        })
    
        it("FAIL: _verifyAuthorizedUpdate: token conservation", async() => {
          init.txCount = [2,1]
          init.tokenBalances = [0, 1]
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
          await startExitWithUpdate(init, hub.address).should.be.rejectedWith('tokens must be conserved')
        })
    
    
        it("FAIL: channel not open", async() => {
          init.sigHub = await updateHash(init, hub.privateKey)
          init.sigUser = await updateHash(init, viewer.privateKey)
          await channelManager.startExit(viewer.address) // channel.status = Status.ChannelDispute
          await startExitWithUpdate(init, hub.address).should.be.rejectedWith('channel must be open')
        })
    })

    describe('emptyChannel', () => {
        it("happy case", async() => {
            await channelManager.startExit(hub.address)
            await moveForwardSecs(config.timeout + 1)
            await channelManager.emptyChannel(hub.address)
          })
          
        it("FAIL : channel not in dispute", async() => {
          await channelManager.emptyChannel(hub.address).should.be.rejectedWith('channel must be in dispute')
        })
    
        it("FAIL : channel closing time not passed", async() => {
          await channelManager.startExit(hub.address)
          await channelManager.emptyChannel(hub.address).should.be.rejectedWith('channel closing time must have passed')
        })
    })
})