'use strict'

import MerkleTree from '../helpers/MerkleTree'
const Utils = require('../helpers/utils')
const Ledger = artifacts.require('./ChannelManager.sol')
const EC = artifacts.require('./ECTools.sol')
const Token = artifacts.require('./token/HumanStandardToken.sol')

const Web3latest = require('web3')
const web3latest = new Web3latest(new Web3latest.providers.HttpProvider("http://localhost:8545")) //ganache port
const BigNumber = web3.BigNumber

const should = require('chai').use(require('chai-as-promised')).use(require('chai-bignumber')(BigNumber)).should()
let SolRevert = (txId) => {
	return `Transaction: ${txId} exited with an error (status 0).\nPlease check that the transaction:\n    - satisfies all conditions set by Solidity \`require\` statements.\n    - does not trigger a Solidity \`revert\` statement.\n`
}

let channelManager
let ec
let token
let bond

// state
let partyA 
let partyB 
let partyI 
let partyN

let threadRootHash
let initialThreadState

let payload
let sigA
let sigI
let sigB
let fakeSig

//is close flag, channel state sequence, number open thread, thread root hash, partyA/B, partyI, balA/B, balI

contract('ChannelManager :: createChannel()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await channelManager.createChannel(channel_id_fail, partyI, '1000000000000000000', token.address, [0, 0], {from:partyA, value: 0})
  })

	describe('Creating a channel has 6 possible cases:', () => {
	  it("1. Fail: Channel with that ID has already been created", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
    	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
    	let approval = await token.approve(channelManager.address, sentBalance[1])
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.not.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(partyI).to.not.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(sentBalance[0]).to.be.above(0) //pass
  	    expect(sentBalance[1]).to.be.above(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass
 
		try {
			await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		}
	  })
	  it("2. Fail: No Hub address was provided.", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
    	let approval = await token.approve(channelManager.address, sentBalance[1])
    	let channel = await channelManager.getChannel(channel_id)
    	let partyI_fail = ('0x0000000000000000000000000000000000000000')
  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(partyI_fail).to.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(sentBalance[0]).to.be.above(0) //pass
  	    expect(sentBalance[1]).to.be.above(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass

		  try {
			await channelManager.createChannel(channel_id, partyI_fail, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }

	  })
	  it("3. Fail: Token balance input is negative.", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('-10')]
    	let approval = await token.approve(channelManager.address, sentBalance[1])
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(partyI).to.not.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(sentBalance[0]).to.be.above(0) //fail
  	    expect(sentBalance[1]).to.not.be.above(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('-10')) //pass

		try {
			await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("4. Fail: Eth balance doesn't match paid value.", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
    	let approval = await token.approve(channelManager.address, sentBalance[1])
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(partyI).to.not.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(sentBalance[0]).to.be.above(0) //pass
  	    expect(sentBalance[1]).to.be.above(0) //pass
  	    expect(sentBalance[0]).to.not.be.equal(web3latest.utils.toWei('1')) //fail
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass

		try {
			await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: web3latest.utils.toWei('1')})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("5. Fail: Token transferFrom failed.", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
    	let approval = await token.approve(channelManager.address, web3latest.utils.toWei('1'))
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(partyI).to.not.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(sentBalance[0]).to.be.above(0) //pass
  	    expect(sentBalance[1]).to.be.above(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.not.be.equal(web3latest.utils.toWei('1')) //fail

		try {
			await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("6. Success: Channel created!", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
    	let approval = await token.approve(channelManager.address, web3latest.utils.toWei('10'))
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(partyI).to.not.be.equal('0x0000000000000000000000000000000000000000') //pass
  	    expect(sentBalance[0]).to.be.above(0) //pass
  	    expect(sentBalance[1]).to.be.above(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass

		const tx = await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
		expect(tx.logs[0].event).to.equal('DidLCOpen')
	  })
	})
})

contract('ChannelManager :: channelOpenTimeout()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	let approval = await token.approve(channelManager.address, sentBalance[1])
    let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await channelManager.createChannel(channel_id_fail, partyI, '1000000000000000000', token.address, [0, 0], {from:partyA, value: 0})
  })


	describe('channelopenTimeout() has 5 possible cases:', () => {
	  it("1. Fail: Sender is not PartyA of channel", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.not.be.equal(partyB) //fail
  	    expect(channel[0][0]).to.not.be.equal(null) //pass
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[7]*1000).to.be.below(Date.now()) //pass


		try {
			await channelManager.channelOpenTimeout(channel_id, {from:partyB})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("2. Fail: Channel does not exist", async () => {
	  	let channel_id = web3latest.utils.sha3('0000', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.not.be.equal(partyB) //pass
  	    expect(channel[0][0]).to.be.equal(null || '0x0000000000000000000000000000000000000000') //fail
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[7]*1000).to.be.below(Date.now()) //pass

		try {
			await channelManager.channelOpenTimeout(channel_id, {from:partyA})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("3. Fail: Channel is already open", async () => {
	  	let channel_id = web3latest.utils.sha3('0000', {encoding: 'hex'})
  	    await channelManager.createChannel(channel_id, partyI, '0', token.address, ['0', '0'], {from:partyA})
	  	await channelManager.joinChannel(channel_id, ['0', '0'], {from: partyI})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[0][0]).to.not.be.equal(null) //pass
  	    expect(channel[9]).to.be.equal(true) //fail
  	    expect(channel[7]*1000).to.be.below(Date.now()) //pass
  
		try {
			await channelManager.channelOpenTimeout(channel_id, {from:partyA})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("4. Fail: channelopenTimeout has not expired", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[0][0]).to.not.be.equal(null) //pass
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[7]*1000).to.be.above(Date.now()) //fail
  
		try {
			await channelManager.channelOpenTimeout(channel_id, {from:partyA})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })	 
	  //******
	  // NOTE: there's one more require in the contract for a failed token transfer. Unfortunately we can't recreate that here.
	  //******
	  it("5. Success!", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[0][0]).to.not.be.equal(null) //pass
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[7]*1000).to.be.below(Date.now()) //pass

  	    let oldBalanceEth = await web3latest.eth.getBalance(partyA)
  	    let oldBalanceToken = await token.balanceOf(partyA)

  	    await channelManager.channelOpenTimeout(channel_id, {from:partyA})

  	    let newBalanceEth = await web3latest.eth.getBalance(partyA)
  	    let newBalanceToken = await token.balanceOf(partyA)
  	    newBalanceToken = newBalanceToken - oldBalanceToken
  	    let balanceToken = await (newBalanceToken).toString()
  	    //TODO gas estimate for this test
  	    // expect(newBalanceEth - oldBalanceEth).to.be.equal(web3latest.utils.toWei('10'))
  	    expect(balanceToken).to.be.equal(web3latest.utils.toWei('10'))
	  })
	})
})

contract('ChannelManager :: joinChannel()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	let approval = await token.approve(channelManager.address, sentBalance[1])
    let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await channelManager.createChannel(channel_id_fail, partyI, '0', token.address, [0, 0], {from:partyA, value: 0})
    await channelManager.joinChannel(channel_id_fail, [0,0], {from: partyI, value: 0})
  })


	describe('joinChannel() has 6 possible cases:', () => {
	  it("1. Fail: Channel with that ID has already been opened", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		let approval = await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[9]).to.be.equal(true) //fail
  	    expect(channel[0][1]).to.be.equal(partyI) //pass
  	    expect(sentBalance[1]).to.be.at.least(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass

		try {
			await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("2. Fail: Msg.sender is not PartyI of this channel", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		let approval = await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[0][1]).to.not.be.equal(partyB) //fail
  	    expect(sentBalance[1]).to.be.at.least(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass

		  try {
			await channelManager.joinChannel(channel_id, sentBalance, {from: partyB, value: sentBalance[0]})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("3. Fail: Token balance is negative", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('-10')]
		let approval = await token.approve(channelManager.address, sentBalance[1], {from: partyI})
		let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[0][1]).to.be.equal(partyI) //pass
  	    expect(sentBalance[1]).to.be.below(0) //fail
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('-10')) //pass

		 try {
			await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		 }
	  })
	  it("4. Fail: Eth balance does not match paid value", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('1'), web3latest.utils.toWei('10')]
		let approval = await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[0][1]).to.be.equal(partyI) //pass
  	    expect(sentBalance[1]).to.be.at.least(0) //pass
  	    expect(sentBalance[0]).to.not.be.equal(web3latest.utils.toWei('10')) //fail
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass

		try {
			await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: web3latest.utils.toWei('10')})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		}
	})
	  it("5. Fail: Token transferFrom failed", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('1')]
		let approval = await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[0][1]).to.be.equal(partyI) //pass
  	    expect(sentBalance[1]).to.be.at.least(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.not.be.equal(web3latest.utils.toWei('10')) //fail

		  try {
			await channelManager.joinChannel(channel_id, [sentBalance[0], web3latest.utils.toWei('10')], {from: partyI, value: sentBalance[0]})
		} catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("6. Success: channel Joined!", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		let approval = await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    	let channel = await channelManager.getChannel(channel_id)
  	    expect(channel[9]).to.be.equal(false) //pass
  	    expect(channel[0][1]).to.be.equal(partyI) //pass
  	    expect(sentBalance[1]).to.be.at.least(0) //pass
  	    expect(sentBalance[0]).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sentBalance[1]).to.be.equal(web3latest.utils.toWei('10')) //pass

		const tx = await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})
		expect(tx.logs[0].event).to.equal('DidLCJoin')
	  })
	})
})

// // //TODO deposit unit tests

contract('ChannelManager :: consensusCloseChannel()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	await token.approve(channelManager.address, sentBalance[1])
	await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id },
      { type: 'bool', value: true }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '0' }, // open threads
      { type: 'bytes32', value: '0x0' }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('5') },
      { type: 'uint256', value: web3latest.utils.toWei('15') },
      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    ) 

    fakeSig = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // ID
      { type: 'bool', value: true }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '0' }, // open threads
      { type: 'string', value: '0x0' }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    )

    sigA = await web3latest.eth.sign(payload, partyA)
    sigI = await web3latest.eth.sign(payload, partyI)
    fakeSig = await web3latest.eth.sign(fakeSig, partyA)

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await token.approve(channelManager.address, sentBalance[1])
    await channelManager.createChannel(channel_id_fail, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
  })


	describe('consensusCloseChannel() has 7 possible cases:', () => {
	  it("1. Fail: Channel with that ID does not exist", async () => {
	  	let channel_id = web3latest.utils.sha3('2222', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
		let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
		let verificationA = await web3latest.eth.sign(payload, partyA)
		let verificationI = await web3latest.eth.sign(payload, partyI)
  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(channel[9]).to.not.be.equal(true) //pass
  	    expect(totalEthDeposit).to.not.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.not.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass

		  try {
			await channelManager.consensusCloseChannel(channel_id, '1', balances, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("2. Fail: Channel with that ID is not open", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
		let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)
  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(false) //fail
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass

		  try {
			await channelManager.consensusCloseChannel(channel_id, '1', balances, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("3. Fail: Total Eth deposit is not equal to submitted Eth balances", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('5'), web3latest.utils.toWei('5'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.not.be.equal(web3latest.utils.toWei('10')) //fail
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass

		  try {
			await channelManager.consensusCloseChannel(channel_id, '1', balances, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("4. Fail: Total token deposit is not equal to submitted token balances", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('5')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.not.be.equal(web3latest.utils.toWei('10')) //fail
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass

		  try {
			await channelManager.consensusCloseChannel(channel_id, '1', balances, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("5. Fail: Incorrect sig for partyA", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(fakeSig).to.not.be.equal(verificationA) //fail
  	    expect(sigI).to.be.equal(verificationI) //pass

		  try {
			await channelManager.consensusCloseChannel(channel_id, '1', balances, fakeSig, sigI)
		  } catch (e) {
			  expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		}
	  })
	  it("6. Fail: Incorrect sig for partyI", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(fakeSig).to.not.be.equal(verificationI) //fail

		  
		  try {
			await channelManager.consensusCloseChannel(channel_id, '1', balances, sigA, fakeSig)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("7. Success: Channel Closed", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let openChansInit = await channelManager.numChannels();
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass

  	    await channelManager.consensusCloseChannel(channel_id, '1', balances, sigA, sigI)
  	    let openChansFinal = await channelManager.numChannels();
  	    expect(openChansInit - openChansFinal).to.be.equal(1);
	  })
	})
})

contract('ChannelManager :: updateChannelState()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	await token.approve(channelManager.address, sentBalance[1])
	await token.approve(channelManager.address, sentBalance[1], {from: partyI})

    let channel_id_1 = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id_1, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    await channelManager.joinChannel(channel_id_1, sentBalance, {from: partyI, value: sentBalance[0]})

    await token.approve(channelManager.address, sentBalance[1])
	await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    let channel_id_2 = web3latest.utils.sha3('2222', {encoding: 'hex'})
    await channelManager.createChannel(channel_id_2, partyI, '100000', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    await channelManager.joinChannel(channel_id_2, sentBalance, {from: partyI, value: sentBalance[0]})

    threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
    payload = web3latest.utils.soliditySha3(
      { type: 'bytes32', value: channel_id_1 },
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '2' }, // sequence
      { type: 'uint256', value: '1' }, // open threads
      { type: 'bytes32', value: threadRootHash }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('5') },
      { type: 'uint256', value: web3latest.utils.toWei('15') },
      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    ) 

    fakeSig = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id_1 }, // ID
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '2' }, // sequence
      { type: 'uint256', value: '1' }, // open threads
      { type: 'bytes32', value: '0x1' }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    )

    sigA = await web3latest.eth.sign(payload, partyA)
    sigI = await web3latest.eth.sign(payload, partyI)
    fakeSig = await web3latest.eth.sign(fakeSig, partyA)

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await token.approve(channelManager.address, sentBalance[1])
    await channelManager.createChannel(channel_id_fail, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
  })


	describe('updateChannelState() has 10 possible cases:', () => {
	  it("1. Fail: Channel with that ID does not exist", async () => {
	  	let channel_id = web3latest.utils.sha3('nochannel', {encoding: 'hex'})
	  	let sequence = '2';
	  	let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(channel[9]).to.not.be.equal(true) //pass
  	    expect(totalEthDeposit).to.not.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.not.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.be.above(Date.now()) //pass

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("2. Fail: Channel with that ID is not open", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
	  	let sequence = '2';
	  	let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(false) //fail
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('10')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.be.above(Date.now()) //pass

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("3. Fail: Total Eth deposit is not equal to submitted Eth balances", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	let sequence = '2';
	  	let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('5'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.not.be.equal(web3latest.utils.toWei('10')) //fail
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.be.above(Date.now()) //pass

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("4. Fail: Total token deposit is not equal to submitted Eth balances", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	let sequence = '2';
	  	let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('5')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.not.be.equal(web3latest.utils.toWei('10')) //fail
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.be.above(Date.now()) //pass

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("5. Fail: Incorrect sig for partyA", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	let sequence = '2';
	  	let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('5')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(fakeSig).to.not.be.equal(verificationA) //fail
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.be.above(Date.now()) //pass

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, fakeSig, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("6. Fail: Incorrect sig for partyI", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	let sequence = '2';
	  	let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('5')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(fakeSig).to.not.be.equal(verificationI) //fail
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.be.above(Date.now()) //pass

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, fakeSig)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("7. Success 1: updateChannelState called first time and timeout started", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	let sequence = '2';
	  	// let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.be.above(Date.now()) //pass

  	    await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)

  	    channel = await channelManager.getChannel(channel_id)
  	    expect(channel[10]).to.be.equal(true)
	  })
	  it("8. Error: State nonce below onchain latest sequence", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	let sequence = '1';
	  	// let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();

  		payload = web3latest.utils.soliditySha3(
	      { type: 'bytes32', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '1' }, // sequence
	      { type: 'uint256', value: '1' }, // open threads
	      { type: 'bytes32', value: threadRootHash }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    ) 

  		let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

	    sigA = await web3latest.eth.sign(payload, partyA)
	    sigI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.not.be.below(sequence) //fail
  	    if(channel[10] == true) expect(channel[8]*1000).to.not.be.above(Date.now()) //pass ==== Technically this is a fail right now, but sequence is checked earlier. Needs to be fixed later

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("9. Error: Updatechannel timed out", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	let sequence = '3';
	  	// let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();

  		payload = web3latest.utils.soliditySha3(
	      { type: 'bytes32', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '3' }, // sequence
	      { type: 'uint256', value: '1' }, // open threads
	      { type: 'bytes32', value: threadRootHash }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    )

	    let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI) 

	    sigA = await web3latest.eth.sign(payload, partyA)
	    sigI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.not.be.above(Date.now()) //fail

		  try {
			await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("10. Success 2: new state submitted to updatechannel", async () => {
	  	let channel_id = web3latest.utils.sha3('2222', {encoding: 'hex'})
	  	let sequence = '3';
	  	// let threadRootHash = web3latest.utils.soliditySha3({type: 'bytes32', value: '0x1'})
		let updateParams = [sequence, '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	let channel = await channelManager.getChannel(channel_id)
    	let totalEthDeposit = channel[3][0].add(channel[1][2]).add(channel[1][3]).toString();
    	let totalTokenDeposit = channel[3][1].add(channel[2][2]).add(channel[2][3]).toString();

  		payload = web3latest.utils.soliditySha3(
	      { type: 'bytes32', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '3' }, // sequence
	      { type: 'uint256', value: '1' }, // open threads
	      { type: 'bytes32', value: threadRootHash }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    ) 

    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	let verificationI = await web3latest.eth.sign(payload, partyI)

	    sigA = await web3latest.eth.sign(payload, partyA)
	    sigI = await web3latest.eth.sign(payload, partyI)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(totalEthDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(totalTokenDeposit).to.be.equal(web3latest.utils.toWei('20')) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(sigI).to.be.equal(verificationI) //pass
  	    expect(channel[4]).to.be.below(sequence) //pass
  	    if(channel[10] == true) expect(channel[8]*1000).to.not.be.above(Date.now()) //pass

  	    await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)

  	    sequence = '4';
  	    updateParams = [sequence, '1', web3latest.utils.toWei('10'), web3latest.utils.toWei('10'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]

  	    payload = web3latest.utils.soliditySha3(
	      { type: 'bytes32', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '4' }, // sequence
	      { type: 'uint256', value: '1' }, // open threads
	      { type: 'bytes32', value: threadRootHash }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('10') },
	      { type: 'uint256', value: web3latest.utils.toWei('10') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    ) 

	    sigA = await web3latest.eth.sign(payload, partyA)
	    sigI = await web3latest.eth.sign(payload, partyI)

	    await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)

	    channel = await channelManager.getChannel(channel_id)
	    expect(channel[4].toString()).to.be.equal(sequence); //new state updated successfully!
	  })
	})
})

contract('ChannelManager :: initThreadState()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	await token.approve(channelManager.address, sentBalance[1])
	await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id, partyI, '1', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

    initialThreadState = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // thread ID
      { type: 'uint256', value: 0 }, // sequence
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyB }, // partyB
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
    )

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id },
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '1' }, // open threads
      { type: 'bytes32', value: initialThreadState }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('5') },
      { type: 'uint256', value: web3latest.utils.toWei('15') },
      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    ) 

    fakeSig = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // ID
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '0' }, // open threads
      { type: 'string', value: '0x0' }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    )

    sigA = await web3latest.eth.sign(payload, partyA)
    sigI = await web3latest.eth.sign(payload, partyI)
    fakeSig = await web3latest.eth.sign(fakeSig, partyA)

    threadRootHash = initialThreadState
    bond = [web3latest.utils.toWei('1'), web3latest.utils.toWei('1')]
    let updateParams = ['1', '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await token.approve(channelManager.address, sentBalance[1])
    await channelManager.createChannel(channel_id_fail, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
  })


	describe('initThreadState() has 8 possible cases:', () => {
	  it("1. Fail: Channel with that ID does not exist", async () => {
	  	let channel_id = web3latest.utils.sha3('nochannel', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)
    	let verificationA = await web3latest.eth.sign(initialThreadState, partyA)
    	sigA = await web3latest.eth.sign(initialThreadState, partyA)

  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(channel[9]).to.not.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass (inverted because channel[8] is 0 for nonexistent channel)
  	    expect(thread[4].toString()).to.be.equal('0') //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(threadRootHash).to.be.equal(initialThreadState) //pass (this is a way of checking isContained() if there is only one thread open)

		try {
			await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("2. Fail: Channel with that ID is not open", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)
    	let verificationA = await web3latest.eth.sign(initialThreadState, partyA)
    	sigA = await web3latest.eth.sign(initialThreadState, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.not.be.equal(true) //fail
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass (inverted because channel[8] is 0 for non open channel)
  	    expect(thread[4].toString()).to.be.equal('0') //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(threadRootHash).to.be.equal(initialThreadState) //pass (this is a way of checking isContained() if there is only one thread open)
		  try {
			await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
		  expect(e.name).to.equal('StatusError')
	  	}
	  })
	  it("TODO Fail: 3. Fail: thread with that ID is closed already", async () => {
	  		//Sometimes reverts on initial close, unclear why. :(
		let channel_id = web3latest.utils.sha3('closed', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		await token.approve(channelManager.address, sentBalance[1])
		await token.approve(channelManager.address, sentBalance[1], {from: partyI})
	    await channelManager.createChannel(channel_id, partyI, 0, token.address, sentBalance, {from:partyA, value: sentBalance[0]})
	    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

	    let threadRootHash_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 0 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
	    )

	    let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: 1 }, // sequence
	      { type: 'uint256', value: 1 }, // open threads
	      { type: 'bytes32', value: threadRootHash_temp }, // Thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    )

	    sigA = await web3latest.eth.sign(payload_temp, partyA)
   	 	sigI = await web3latest.eth.sign(payload_temp, partyI)
   	 	let updateParams = [1, 1, web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	await channelManager.updateChannelState(channel_id, updateParams, threadRootHash_temp, sigA, sigI)

    	let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
	    sigA = await web3latest.eth.sign(threadRootHash_temp, partyA)
	    await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)

	    await channelManager.closeThread(channel_id, channel_id)

    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)
    	let verificationA = await web3latest.eth.sign(threadRootHash_temp, partyA)
    	sigA = await web3latest.eth.sign(threadRootHash_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.be.equal(true) //fail
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass (inverted because thread was already closed)
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(threadRootHash_temp).to.be.equal(threadRootHash_temp) //pass (this is a way of checking isContained() if there is only one thread open)

		try {
			await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		 }
	  })
	  it("4. Fail: channel update timer has not yet expired", async () => {
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	  	await token.approve(channelManager.address, sentBalance[1])
		await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    	let channel_id = web3latest.utils.sha3('2222', {encoding: 'hex'})
    	await channelManager.createChannel(channel_id, partyI, '100000000', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    	await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

    	let threadRootHash_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 0 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
	    )

    	let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '1' }, // sequence
	      { type: 'uint256', value: '1' }, // open threads
	      { type: 'bytes32', value: threadRootHash_temp }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    ) 
    	let channel = await channelManager.getChannel(channel_id)

    	let sigA_temp = await web3latest.eth.sign(payload_temp, partyA)
    	let sigI_temp = await web3latest.eth.sign(payload_temp, partyI)
    	let updateParams = ['1', '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	await channelManager.updateChannelState(channel_id, updateParams, threadRootHash_temp, sigA_temp, sigI_temp)

		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    	channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)
    	let verificationA = await web3latest.eth.sign(threadRootHash_temp, partyA)
    	sigA = await web3latest.eth.sign(threadRootHash_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(channel[8]*1000).to.not.be.below(Date.now()) //fail
  	    expect(thread[4].toString()).to.be.equal('0') //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(threadRootHash_temp).to.be.equal(threadRootHash_temp) //pass (this is a way of checking isContained() if there is only one thread open)

		  try {
			await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("5. Fail: Alice has not signed initial state (or wrong state)", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    	let channel = await channelManager.getChannel(channel_id)
    	let verificationA = await web3latest.eth.sign(initialThreadState, partyA)
    	sigA = await web3latest.eth.sign(initialThreadState, partyA)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass (inverted because channel[8] is 0 for non open channel)
  	    expect(thread[4].toString()).to.be.equal('0') //pass
  	    expect(fakeSig).to.not.be.equal(verificationA) //fail
  	    expect(threadRootHash).to.be.equal(initialThreadState) //pass (this is a way of checking isContained() if there is only one thread open)
		  try {
			await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, fakeSig)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("6. Fail: Old state not contained in root hash", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

    	let threadRootHash_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 0 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
	    )

	    let verificationA = await web3latest.eth.sign(threadRootHash_temp, partyA)
	    sigA = verificationA

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass (inverted because channel[8] is 0 for non open channel)
  	    expect(thread[4].toString()).to.be.equal('0') //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(threadRootHash_temp).to.not.be.equal(initialThreadState) //fail (this is a way of checking isContained() if there is only one thread open)

		  try {
			await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("7. Success: thread inited successfully", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    	let channel = await channelManager.getChannel(channel_id)
    	let verificationA = await web3latest.eth.sign(initialThreadState, partyA)
    	sigA = await web3latest.eth.sign(initialThreadState, partyA)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass (inverted because channel[8] is 0 for non open channel)
  	    expect(thread[4].toString()).to.be.equal('0') //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(threadRootHash).to.be.equal(initialThreadState) //pass (this is a way of checking isContained() if there is only one thread open)

		const tx = await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)
		expect(tx.logs[0].event).to.equal('DidthreadInit')
	  })
	  it("8. Fail: Update thread timer is not 0 (initThreadState has already been called before)", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    	let channel = await channelManager.getChannel(channel_id)
    	let verificationA = await web3latest.eth.sign(initialThreadState, partyA)
    	sigA = await web3latest.eth.sign(initialThreadState, partyA)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass (inverted because channel[8] is 0 for non open channel)
  	    expect(thread[4].toString()).to.not.be.equal('0') //fail
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    expect(threadRootHash).to.be.equal(initialThreadState) //pass (this is a way of checking isContained() if there is only one thread open)

		  try {
			await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	})
})

contract('ChannelManager :: settleThread()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	await token.approve(channelManager.address, sentBalance[1])
	await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id, partyI, 0, token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

    initialThreadState = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // thread ID
      { type: 'uint256', value: 0 }, // sequence
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyB }, // partyB
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
    )

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id },
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '1' }, // open threads
      { type: 'bytes32', value: initialThreadState }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('5') },
      { type: 'uint256', value: web3latest.utils.toWei('15') },
      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    ) 

    fakeSig = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // ID
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '0' }, // open threads
      { type: 'string', value: '0x0' }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    )

    sigA = await web3latest.eth.sign(payload, partyA)
    sigI = await web3latest.eth.sign(payload, partyI)
    fakeSig = await web3latest.eth.sign(fakeSig, partyA)

    threadRootHash = initialThreadState
    bond = [web3latest.utils.toWei('1'), web3latest.utils.toWei('1')]
    let updateParams = ['1', '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)

    let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
    sigA = await web3latest.eth.sign(initialThreadState, partyA)
    await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await token.approve(channelManager.address, sentBalance[1])
    await channelManager.createChannel(channel_id_fail, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // thread ID
      { type: 'uint256', value: 1 }, // sequence
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyB }, // partyB
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
    )

  })


	describe('settleThread() has 14 possible cases:', () => {
	  it("1. Fail: Channel with that ID does not exist", async () => {
	  	let channel_id = web3latest.utils.sha3('nochannel', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	sigA = await web3latest.eth.sign(payload, partyA)

  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(channel[9]).to.not.be.equal(true) //pass (inverted for nonexistent channel)
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.not.be.equal(web3latest.utils.toWei('1')) //pass (inverted because thread state not inited yet)
  	    expect(thread[10][1].toString()).to.not.be.equal(web3latest.utils.toWei('1')) //pass (inverted because thread state not inited yet)
  	    expect(thread[4].toString()).to.be.equal('0') //pass (inverted because thread state not inited yet)
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("2. Fail: Channel with that ID is not open", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	sigA = await web3latest.eth.sign(payload, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.not.be.equal(true) //fail
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.not.be.equal(web3latest.utils.toWei('1')) //pass (inverted because thread state not inited yet)
  	    expect(thread[10][1].toString()).to.not.be.equal(web3latest.utils.toWei('1')) //pass (inverted because thread state not inited yet)
  	    expect(thread[4].toString()).to.be.equal('0') //pass (inverted because thread state not inited yet)
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("3. Fail: thread with that ID is already closed", async () => {
	  	//Sometimes reverts on initial close, unclear why. :(

		let channel_id = web3latest.utils.sha3('closed', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		await token.approve(channelManager.address, sentBalance[1])
		await token.approve(channelManager.address, sentBalance[1], {from: partyI})
	    await channelManager.createChannel(channel_id, partyI, 0, token.address, sentBalance, {from:partyA, value: sentBalance[0]})
	    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

	    initialThreadState = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 0 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
	    )

	    let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: 1 }, // sequence
	      { type: 'uint256', value: 1 }, // open threads
	      { type: 'bytes32', value: initialThreadState }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    )

	    sigA = await web3latest.eth.sign(payload_temp, partyA)
   	 	sigI = await web3latest.eth.sign(payload_temp, partyI)
   	 	let updateParams = [1, 1, web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	await channelManager.updateChannelState(channel_id, updateParams, initialThreadtate, sigA, sigI)

    	let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
	    sigA = await web3latest.eth.sign(initialThreadState, partyA)
	    await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)

	    await channelManager.closeThread(channel_id, channel_id)

    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

    	balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]

    	payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 2 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
	    )
    	sigA = await web3latest.eth.sign(payload_temp, partyA)
    	let verificationA = sigA

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.be.equal(true) //fail
  	    expect(thread[2]).to.be.below(2) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass 
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    // expect(thread[4]*1000).to.be.above(Date.now()) //pass

		//  await channelManager.settleThread(channel_id, channel_id, 2, partyA, partyB, balances, sigA).should.be.rejectedWith(SolRevert)
		 
		 try {
			await channelManager.settleThread(channel_id, channel_id, 2, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("4. Fail: Onchain thread sequence is higher than submitted sequence", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 0
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)
    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	sigA = await web3latest.eth.sign(payload, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.not.be.below(sequence) //fail
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("5. Fail: State update decreases recipient balance", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

	    let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 1 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
	    )

    	let verificationA = await web3latest.eth.sign(payload_temp, partyA)
    	sigA = await web3latest.eth.sign(payload_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.not.be.below(balances[1]) //fail
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("6. Fail: State update decreases recipient balance", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

	    let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 1 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
	    )

    	let verificationA = await web3latest.eth.sign(payload_temp, partyA)
    	sigA = await web3latest.eth.sign(payload_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.not.be.below(balances[3]) //fail
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass
	 
		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("7. Fail: Eth balances do not match bonded amount", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

	    let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 1 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
	    )

    	let verificationA = await web3latest.eth.sign(payload_temp, partyA)
    	sigA = await web3latest.eth.sign(payload_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.not.be.equal(web3latest.utils.toWei('2')) //fail
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("8. Fail: Eth balances do not match bonded amount", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('1'), web3latest.utils.toWei('1')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

	    let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 1 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
	    )

    	let verificationA = await web3latest.eth.sign(payload_temp, partyA)
    	sigA = await web3latest.eth.sign(payload_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[10][1].toString()).to.not.be.equal(web3latest.utils.toWei('2')) //fail
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("9. Fail: Initthread was not called first", async () => {
	  	let channel_id = web3latest.utils.sha3('2222', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 1

		let initial_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 0 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
	    )

    	let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '1' }, // sequence
	      { type: 'uint256', value: '1' }, // open threads
	      { type: 'bytes32', value: initial_temp }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    ) 

	    let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		await token.approve(channelManager.address, sentBalance[1])
		await token.approve(channelManager.address, sentBalance[1], {from: partyI})
	    await channelManager.createChannel(channel_id, partyI, '1', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
	    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

		sigA = await web3latest.eth.sign(payload_temp, partyA)
		sigI = await web3latest.eth.sign(payload_temp, partyI)

		let updateParams = ['1', '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
		await channelManager.updateChannelState(channel_id, updateParams, initial_temp, sigA, sigI)

    	let verificationA = await web3latest.eth.sign(initial_temp, partyA)
    	sigA = await web3latest.eth.sign(initial_temp, partyA)

    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.not.be.equal(web3latest.utils.toWei('1')) //pass (inverted because initthread not called)
  	    expect(thread[10][1].toString()).to.not.be.equal(web3latest.utils.toWei('1')) //pass (inverted because initthread not called)
  	    expect(thread[4].toString()).to.be.equal('0') //fail
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("TODO 10. Fail: updatechannel timeout has not expired", async () => {
	  		//Not sure how to test this since Initthread can only be called after timeout expires.
	  })
	  it("11. Fail: Incorrect partyA signature or payload", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

    	let verificationA = await web3latest.eth.sign(payload, partyA)
    	sigA = await web3latest.eth.sign(payload, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(fakeSig).to.not.be.equal(verificationA) //fail
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

		 try {
			await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, fakeSig)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("TODO 12. Fail: Updatethread timer has expired", async () => {
	  		//also unclear how best to unit test
	  })
	  it("13. Success 1: First state added!", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0.5'), web3latest.utils.toWei('0.5'), web3latest.utils.toWei('0.5'), web3latest.utils.toWei('0.5')]
		let sequence = 1
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

		let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 1 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('0.5') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0.5') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0.5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('0.5') }  // token
	    )

    	let verificationA = await web3latest.eth.sign(payload_temp, partyA)
    	sigA = await web3latest.eth.sign(payload_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(thread[8][1].toString()).to.be.below(balances[1]) //pass
  	    expect(thread[9][1].toString()).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

 	    await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)

 	    thread = await channelManager.getThread(channel_id)
 	    expect(thread[1]).to.be.equal(true) //pass
	  })
	  it("14. Success 2: Disputed with higher sequence state!", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
		let balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
		let sequence = 2
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

    	let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 2 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
	    )

    	let verificationA = await web3latest.eth.sign(payload_temp, partyA)
    	sigA = await web3latest.eth.sign(payload_temp, partyA)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[2]).to.be.below(sequence) //pass
  	    expect(parseInt(thread[8][1])).to.be.below(balances[1]) //pass
  	    expect(parseInt(thread[9][1])).to.be.below(balances[3]) //pass
  	    expect(thread[10][0].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[10][1].toString()).to.be.equal(web3latest.utils.toWei('1')) //pass
  	    expect(thread[4].toString()).to.not.be.equal('0') //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(sigA).to.be.equal(verificationA) //pass
  	    //expect(thread[4]*1000).to.be.above(Date.now()) //pass

 	    await channelManager.settleThread(channel_id, channel_id, sequence, partyA, partyB, balances, sigA)

 	    thread = await channelManager.getThread(channel_id)
 	    expect(parseInt(thread[2])).to.be.equal(sequence) //pass
	  })
	})
})

contract('ChannelManager :: closeThread()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	await token.approve(channelManager.address, sentBalance[1])
	await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id, partyI, 0, token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

    initialThreadState = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // thread ID
      { type: 'uint256', value: 0 }, // sequence
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyB }, // partyB
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
    )

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id },
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '1' }, // open threads
      { type: 'bytes32', value: initialThreadState }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('5') },
      { type: 'uint256', value: web3latest.utils.toWei('15') },
      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    ) 

    fakeSig = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // ID
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '0' }, // open threads
      { type: 'string', value: '0x0' }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    )

    sigA = await web3latest.eth.sign(payload, partyA)
    sigI = await web3latest.eth.sign(payload, partyI)
    fakeSig = await web3latest.eth.sign(fakeSig, partyA)

    threadRootHash = initialThreadState
    bond = [web3latest.utils.toWei('1'), web3latest.utils.toWei('1')]
    let updateParams = ['1', '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)

    let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
    sigA = await web3latest.eth.sign(initialThreadState, partyA)
    await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)


    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await token.approve(channelManager.address, sentBalance[1])
    await channelManager.createChannel(channel_id_fail, partyI, 0, token.address, sentBalance, {from:partyA, value: sentBalance[0]})

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // thread ID
      { type: 'uint256', value: 1 }, // sequence
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyB }, // partyB
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
    )

    balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    sigA = await web3latest.eth.sign(payload, partyA)
    await channelManager.settleThread(channel_id, channel_id, 1, partyA, partyB, balances, sigA)
  })

	describe('closeThread() has 6 possible cases:', () => {
	  it("1. Fail: Channel with that ID does not exist", async () => {
	  	let channel_id = web3latest.utils.sha3('nochannel', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(channel[9]).to.not.be.equal(true) //pass (inverted for nonexistent channel)
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[1]).to.not.be.equal(true) //pass (inverted for nonexistent thread)
  	    expect(thread[4]*1000).to.be.below(Date.now()) //pass


		 try {
			await channelManager.closeThread(channel_id, channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("2. Fail: Channel with that ID is not open", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.not.be.equal(true) //fail 
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[1]).to.not.be.equal(true) //pass (inverted for nonexistent thread)
  	    expect(thread[4]*1000).to.be.below(Date.now()) //pass
 
		 try {
			await channelManager.closeThread(channel_id, channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("3. Fail: thread with that ID already closed", async () => {
	  	let channel_id = web3latest.utils.sha3('closed', {encoding: 'hex'})
		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		await token.approve(channelManager.address, sentBalance[1])
		await token.approve(channelManager.address, sentBalance[1], {from: partyI})
	    await channelManager.createChannel(channel_id, partyI, 0, token.address, sentBalance, {from:partyA, value: sentBalance[0]})
	    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

	    initialThreadState = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id }, // thread ID
	      { type: 'uint256', value: 0 }, // sequence
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyB }, // partyB
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
	      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
	    )

	    let payload_temp = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '1' }, // sequence
	      { type: 'uint256', value: '1' }, // open threads
	      { type: 'bytes32', value: initialThreadState }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    )

	    sigA = await web3latest.eth.sign(payload_temp, partyA)
   	 	sigI = await web3latest.eth.sign(payload_temp, partyI)
   	 	let updateParams = ['1', '1', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	await channelManager.updateChannelState(channel_id, updateParams, initialThreadState, sigA, sigI)

    	let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
	    sigA = await web3latest.eth.sign(initialThreadState, partyA)
	    await channelManager.initThreadState(channel_id, channel_id, 0, partyA, partyB, bond, balances, sigA)

	    await channelManager.closeThread(channel_id, channel_id)

    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.be.equal(true) //fail
  	    expect(thread[1]).to.be.equal(true) //pass
  	    expect(thread[4]*1000).to.be.below(Date.now()) //pass

		//  await channelManager.closeThread(channel_id, channel_id).should.be.rejectedWith(SolRevert)
		 
		 try {
			await channelManager.closeThread(channel_id, channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("4. Fail: thread is not in settlement state", async () => {
	  	// no point testing this since threads cannot exist unless they're in settlement state. We probably don't need this flag too, since its
	  	// only checked in closethread()
	  })
	  it("TO DO 5. Fail: updatethreadtimeout has not expired", async () => {
	  	// figure out how to test this (need to wait for time to pass)
	  })
	  it("6. Fail: Channel with that ID is not open", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(thread[0]).to.not.be.equal(true) //pass
  	    expect(thread[1]).to.be.equal(true) //pass 
  	    expect(thread[4]*1000).to.be.below(Date.now()) //pass

 	    await channelManager.closeThread(channel_id, channel_id)
	  })
	})
})

contract('ChannelManager :: byzantineCloseChannel()', function(accounts) {

  before(async () => {
  	partyA = accounts[0]
	partyB = accounts[1]
	partyI = accounts[2]
	partyN = accounts[3]

    ec = await EC.new()
    token = await Token.new(web3latest.utils.toWei('1000'), 'Test', 1, 'TST')
    Ledger.link('HumanStandardToken', token.address)
    Ledger.link('ECTools', ec.address)
    channelManager = await Ledger.new()

    await token.transfer(partyB, web3latest.utils.toWei('100'))
    await token.transfer(partyI, web3latest.utils.toWei('100'))

	let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
	await token.approve(channelManager.address, sentBalance[1])
	await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    await channelManager.createChannel(channel_id, partyI, '0', token.address, sentBalance, {from:partyA, value: sentBalance[0]})
    await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

    initialThreadState = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // thread ID
      { type: 'uint256', value: '0' }, // sequence
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyB }, // partyB
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('0') }  // token
    )

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id },
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '1' }, // open threads
      { type: 'bytes32', value: initialThreadState }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('4') },
      { type: 'uint256', value: web3latest.utils.toWei('15') },
      { type: 'uint256', value: web3latest.utils.toWei('4') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    ) 

    fakeSig = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // ID
      { type: 'bool', value: false }, // isclose
      { type: 'uint256', value: '1' }, // sequence
      { type: 'uint256', value: '0' }, // open threads
      { type: 'string', value: '0x0' }, // thread root hash
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyI }, // hub
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('15') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
    )

    sigA = await web3latest.eth.sign(payload, partyA)
    sigI = await web3latest.eth.sign(payload, partyI)
    fakeSig = await web3latest.eth.sign(fakeSig, partyA)

    threadRootHash = initialThreadState
    bond = [web3latest.utils.toWei('1'), web3latest.utils.toWei('1')]
    let updateParams = ['1', '1', web3latest.utils.toWei('4'), web3latest.utils.toWei('15'), web3latest.utils.toWei('4'), web3latest.utils.toWei('15')]
    await channelManager.updateChannelState(channel_id, updateParams, threadRootHash, sigA, sigI)

    let balances = [web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0')]
    sigA = await web3latest.eth.sign(initialThreadState, partyA)
    await channelManager.initThreadState(channel_id, channel_id, '0', partyA, partyB, bond, balances, sigA)

    let channel_id_fail = web3latest.utils.sha3('fail', {encoding: 'hex'})
    await token.approve(channelManager.address, sentBalance[1])
    await channelManager.createChannel(channel_id_fail, partyI, '100', token.address, sentBalance, {from:partyA, value: sentBalance[0]})

    payload = web3latest.utils.soliditySha3(
      { type: 'uint256', value: channel_id }, // thread ID
      { type: 'uint256', value: 1 }, // sequence
      { type: 'address', value: partyA }, // partyA
      { type: 'address', value: partyB }, // partyB
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // bond token
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('1') }, // eth
      { type: 'uint256', value: web3latest.utils.toWei('0') }, // token
      { type: 'uint256', value: web3latest.utils.toWei('1') }  // token
    )

    balances = [web3latest.utils.toWei('0'), web3latest.utils.toWei('1'), web3latest.utils.toWei('0'), web3latest.utils.toWei('1')]
    sigA = await web3latest.eth.sign(payload, partyA)

  })


	describe('byzantineCloseChannel() has 6 possible cases:', () => {
	  it("1. Fail: Channel with that ID does not exist", async () => {
	  	let channel_id = web3latest.utils.sha3('nochannel', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal('0x0000000000000000000000000000000000000000') //fail
  	    expect(channel[9]).to.not.be.equal(true) //pass (inverted for nonexistent channel)
  	    expect(channel[10]).to.not.be.equal(true) //pass (inverted for nonexistent channel)
  	    expect(channel[8]*1000).to.not.be.above(Date.now()) //pass (inverted for nonexistent thread)
  	    expect(parseInt(channel[11])).to.be.equal(0) //pass
  	    expect(parseInt(channel[3][0])).to.be.at.least(parseInt(channel[1][0]) + parseInt(channel[1][1])) //pass
  	    expect(parseInt(channel[3][1])).to.be.at.least(parseInt(channel[2][0]) + parseInt(channel[2][1])) //pass

		 try {
			await channelManager.byzantineCloseChannel(channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("2. Fail: Channel with that ID is not open", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.not.be.equal(true) //fail
  	    expect(channel[10]).to.not.be.equal(true) //pass (inverted for nonexistent channel)
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(parseInt(channel[11])).to.be.equal(0) //pass
  	    expect(parseInt(channel[3][0])).to.be.at.least(parseInt(channel[1][0]) + parseInt(channel[1][1])) //pass
  	    expect(parseInt(channel[3][1])).to.be.at.least(parseInt(channel[2][0]) + parseInt(channel[2][1])) //pass

		 try {
			await channelManager.byzantineCloseChannel(channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("3. Fail: Channel is not in dispute", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})

		let sentBalance = [web3latest.utils.toWei('10'), web3latest.utils.toWei('10')]
		await token.approve(channelManager.address, sentBalance[1], {from: partyI})
    	await channelManager.joinChannel(channel_id, sentBalance, {from: partyI, value: sentBalance[0]})

    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(channel[10]).to.be.equal(false) //fail
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(parseInt(channel[11])).to.be.equal(0) //pass
  	    expect(parseInt(channel[3][0])).to.be.at.least(parseInt(channel[1][0]) + parseInt(channel[1][1])) //pass
  	    expect(parseInt(channel[3][1])).to.be.at.least(parseInt(channel[2][0]) + parseInt(channel[2][1])) //pass

		 try {
			await channelManager.byzantineCloseChannel(channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("4. Fail: UpdatechannelTimeout has not yet expired", async () => {
	  	let channel_id = web3latest.utils.sha3('fail', {encoding: 'hex'})

	    payload = web3latest.utils.soliditySha3(
	      { type: 'uint256', value: channel_id },
	      { type: 'bool', value: false }, // isclose
	      { type: 'uint256', value: '1' }, // sequence
	      { type: 'uint256', value: '0' }, // open threads
	      { type: 'bytes32', value: '0x0' }, // thread root hash
	      { type: 'address', value: partyA }, // partyA
	      { type: 'address', value: partyI }, // hub
	      { type: 'uint256', value: web3latest.utils.toWei('5') },
	      { type: 'uint256', value: web3latest.utils.toWei('15') },
	      { type: 'uint256', value: web3latest.utils.toWei('5') }, // token
	      { type: 'uint256', value: web3latest.utils.toWei('15') }  // token
	    ) 
	    let sigA_temp = await web3latest.eth.sign(payload, partyA)
	    let sigI_temp = await web3latest.eth.sign(payload, partyI)

		let updateParams = ['1', '0', web3latest.utils.toWei('5'), web3latest.utils.toWei('15'), web3latest.utils.toWei('5'), web3latest.utils.toWei('15')]
    	await channelManager.updateChannelState(channel_id, updateParams, '0x0', sigA_temp, sigI_temp)

		let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(channel[10]).to.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.above(Date.now()) //fail
  	    expect(parseInt(channel[11])).to.be.equal(0) //pass
  	    expect(parseInt(channel[3][0])).to.be.at.least(parseInt(channel[1][0]) + parseInt(channel[1][1])) //pass
  	    expect(parseInt(channel[3][1])).to.be.at.least(parseInt(channel[2][0]) + parseInt(channel[2][1])) //pass

		 try {
			await channelManager.byzantineCloseChannel(channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("5. Fail: threads are still open", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(channel[10]).to.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(parseInt(channel[11])).to.be.equal(1) //fail
  	    expect(parseInt(channel[3][0])).to.be.at.least(parseInt(channel[1][0]) + parseInt(channel[1][1])) //pass
  	    expect(parseInt(channel[3][1])).to.be.at.least(parseInt(channel[2][0]) + parseInt(channel[2][1])) //pass

		 try {
			await channelManager.byzantineCloseChannel(channel_id)
		  } catch (e) {
			expect(e.message).to.equal(SolRevert(e.tx))
			expect(e.name).to.equal('StatusError')
		  }
	  })
	  it("6. Fail: Onchain Eth balances are greater than deposit", async () => {
	  		// can't test this until deposits are complete
	  })
	  it("7. Fail: Onchain token balances are greater than deposit", async () => {
	  		// can't test this until deposits are complete
	  })
	  it("8. Success: Channel byzantine closed!", async () => {
	  	let channel_id = web3latest.utils.sha3('1111', {encoding: 'hex'})
	  	await channelManager.closeThread(channel_id, channel_id)

    	let channel = await channelManager.getChannel(channel_id)
    	let thread = await channelManager.getThread(channel_id)

  	    expect(channel[0][0]).to.be.equal(partyA) //pass
  	    expect(channel[9]).to.be.equal(true) //pass
  	    expect(channel[10]).to.be.equal(true) //pass
  	    expect(channel[8]*1000).to.be.below(Date.now()) //pass
  	    expect(parseInt(channel[11])).to.be.equal(0) //pass
  	    expect(parseInt(channel[3][0])).to.be.at.least(parseInt(channel[1][0]) + parseInt(channel[1][1])) //pass
  	    expect(parseInt(channel[3][1])).to.be.at.least(parseInt(channel[2][0]) + parseInt(channel[2][1])) //pass

 	    await channelManager.byzantineCloseChannel(channel_id)

 	    channel = await channelManager.getChannel(channel_id)
 	    expect(channel[9]).to.be.equal(false)
	  })
	})
})