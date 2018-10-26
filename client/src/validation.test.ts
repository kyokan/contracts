require('dotenv').config()
const Web3 = require('web3')
const HttpProvider = require(`ethjs-provider-http`)
import mocha = require('mocha')
import BN = require('bn.js')
import { expect } from 'chai'
import { ChannelStateFingerprint } from './types'
import { Utils } from './Utils'
import { Validation } from './Validation'

describe('Validation', () => {
  let web3
  let accounts
  const utils = new Validation()
  let partyA
  before('instantiate web3', async () => {
    web3 = new Web3(new HttpProvider('http://localhost:8545'))
    accounts = await web3.eth.getAccounts()
    partyA = accounts[1]
    // instantiate web3
  })

  // it('should recover the signer from the channel update', async () => {
  //   const userBalance = {
  //     weiBalance: new BN('10').toString(),
  //     tokenBalance: new BN('10').toString(),
  //   }

  //   const hubBalance = {
  //     weiBalance: '0',
  //     tokenBalance: '0',
  //   }

  //   // create update sig
  //   const updatedChannel = await connext.createChannelStateUpdate(
  //     userBalance,
  //     hubBalance,
  //     'ProposePending', // reason
  //     30, // period in s
  //     null, // exchange rate
  //     null, // meta
  //     partyA, // user aka signer
  //   )
  //   console.log('updatedChannel:2::', updatedChannel)
  //   const signer = Connext.utils.recoverSignerFromChannelStateUpdate(
  //     updatedChannel,
  //     updatedChannel.sigUser,
  //   )
  //   console.log(signer)
  //   expect(signer.toLowerCase()).to.equal(partyA.toLowerCase())
  //   // signer should be partyA
  //   // create an update to sign
  // })
})
