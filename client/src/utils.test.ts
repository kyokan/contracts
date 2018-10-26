require('dotenv').config()
const Web3 = require('web3')
const HttpProvider = require(`ethjs-provider-http`)
import mocha = require('mocha')
import BN = require('bn.js')
import { expect } from 'chai'
import { ChannelStateFingerprint, ThreadStateFingerprint } from './types'
import { Utils } from './Utils'
import { MerkleUtils } from './helpers/merkleUtils'
// import { MerkleTree } from './helpers/merkleTree'
import MerkleTree from './helpers/merkleTree'

describe('Utils', () => {
  let web3: any
  let accounts: string[]
  let partyA: string
  before('instantiate web3', async () => {
    // instantiate web3
    web3 = new Web3(new HttpProvider('http://localhost:8545'))
    accounts = await web3.eth.getAccounts()
    partyA = accounts[1]
  })

  it('should recover the signer from the channel update when there are no threads', async () => {
    // create and sign channel state update
    const channelStateFingerprint: ChannelStateFingerprint = {
      contractAddress: partyA, // doesnt validate
      user: partyA,
      recipient: partyA,
      balanceWeiHub: '10',
      balanceWeiUser: '10',
      balanceTokenHub: '10',
      balanceTokenUser: '10',
      pendingDepositWeiHub: '0',
      pendingDepositWeiUser: '0',
      pendingDepositTokenHub: '0',
      pendingDepositTokenUser: '0',
      pendingWithdrawalWeiHub: '0',
      pendingWithdrawalWeiUser: '0',
      pendingWithdrawalTokenHub: '0',
      pendingWithdrawalTokenUser: '0',
      txCountGlobal: 1,
      txCountChain: 1,
      threadRoot: Utils.emptyRootHash,
      threadCount: 0,
      timeout: 0,
    }
    // generate hash
    const hash = Utils.createChannelStateUpdateHash(channelStateFingerprint)
    // sign
    const sig = await web3.eth.sign(hash, partyA)
    console.log(hash) // log harcode hash for other hash test
    // recover signer
    const signer = Utils.recoverSignerFromChannelStateUpdate(
      channelStateFingerprint,
      sig,
    )
    expect(signer).to.equal(partyA.toLowerCase())
  })

  it('should recover the signer from the thread state update', async () => {
    // create and sign channel state update
    const threadStateFingerprint: ThreadStateFingerprint = {
      contractAddress: partyA, // doesnt validate
      user: partyA,
      sender: partyA,
      receiver: partyA,
      balanceWeiSender: '10',
      balanceWeiReceiver: '10',
      balanceTokenReceiver: '10',
      balanceTokenSender: '10',
      txCount: 1,
    }
    // generate hash
    const hash = Utils.createThreadStateUpdateHash(threadStateFingerprint)
    // sign
    const sig = await web3.eth.sign(hash, partyA)
    console.log(hash) // log harcode hash for other hash test
    // recover signer
    const signer = Utils.recoverSignerFromThreadStateUpdate(
      threadStateFingerprint,
      sig,
    )
    expect(signer).to.equal(partyA.toLowerCase())
  })

  it('should return the correct root hash', async () => {
    const threadStateFingerprint: ThreadStateFingerprint = {
      contractAddress: partyA, // doesnt validate
      user: partyA,
      sender: partyA,
      receiver: partyA,
      balanceWeiSender: '10',
      balanceWeiReceiver: '10',
      balanceTokenReceiver: '10',
      balanceTokenSender: '10',
      txCount: 1,
    }
    // TO DO: merkle tree class imports not working...?
    // generate hash
    const hash = Utils.createThreadStateUpdateHash(threadStateFingerprint)
    // construct elements
    const elements = [
      MerkleUtils.hexToBuffer(hash),
      MerkleUtils.hexToBuffer(Utils.emptyRootHash),
    ]
    const merkle = new MerkleTree(elements)
    const expectedRoot = MerkleUtils.bufferToHex(merkle.getRoot())
    const generatedRootHash = Utils.generateThreadRootHash([
      threadStateFingerprint,
    ])
    expect(generatedRootHash).to.equal(expectedRoot)
  })
})
