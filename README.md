# Connext-contracts
Ethereum contracts for simple [Set](https://docs.google.com/document/d/1aQdLnBNAWYIqDoYLjBPcyh3Pjo0rcQMZtjcrOzIYVek/edit) style channels specific to unidirectional payment hubs

## Local Development Quickstart Guide

### Prerequisities
-  [Ganache](https://truffleframework.com/ganache) or another similar local blockchain.
- Global installation of [Truffle](https://truffleframework.com/docs/truffle/getting-started/installation) 

### Getting Started
 
When launching your local blockchain, be sure that the block time is greater than zero seconds. 

Once it's launched, open ```truffle.js``` in a text editor. 

Change the account address in line 10 to reflect the account you'd like to use to instantiate the contracts (if you're using Ganache, any of the provided accounts are fine).

Next, make sure that the port, host, and network ID of your local blockchain match the relevant entry in the `networks` dictionary of `truffle.js`. For example, if your instance of Ganache is broadcasting to 127.0.0.1 on port 8545 with network ID 4447, the corresponding entry in `truffle.js` should read:

    ganache: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "4447",
      gas: 4700000
    }
In Ganache, you can find and edit this information on the Settings page.

Navigate to the directory root, and run:

    connext-contracts$ truffle migrate --reset --network ganache
While this example uses Ganache, you should point Truffle to your local blockchain instance.

Once you migrate the contracts, they should be live on your local blockchain. Happy coding!


## Method Reference

#### createChannel
    Parameters:
        Channel ID - bytes32
        Hub Address - address
        Timout period - uint256
        Token Address - address
        Array of party Balances - uint256[2]
Creates a channel with the Hub using specified balances. `Msg.sender` serves as the first party.

#### channelOpenTimeout
    Parameters:
        Channel ID - bytes32
Emits a DidChannelClose event if createChannel exceeds the timeout period.

#### joinChannel
    Parameters:
        Channel ID - bytes32 
        Array of party balances - uint256[2] 
Allows a counterparty to join an already-created channel. Emits a DidChannelJoin event.

#### deposit
    Parameters:
        Channel ID - bytes32  
        Recipient Address - address 
        Balance to deposit - uint256 
        Boolean indicating whether deposit is a token - bool
Allows deposit of funds to an existing channel. Emits a DidChannelDeposit event.

#### consensusCloseChannel
    Parameters:
        Channel ID - bytes32
        Sequence uint256  
        PartyA ETH Balance, Hub ETH Balance, PartyA Token Balance, Hub Token Balance - uint256[4]
        PartyA Signature - string
        Hub Signature - string 
Closes channel when all parties are in agreement. Sequence refers to the nonce of the on-chain state.

#### updateChannelState
    Parameters:
        Channel ID - bytes32 _channelId, 
        Sequence, Number of open threads, PartyA ETH balance, Hub ETH Balance, PartyA Token Balance, Hub Token Balance uint256[6] 
        Thread Merkle Root - bytes32 
        PartyA Signature - string
        Hub Signature - string 
Updates on-chain channel state.

### Byzantine Functions

#### initThreadState
    Parameters:
        Channel ID - bytes32 _channelId, 
        Thread ID - bytes32 _threadId, 
        Proof - bytes _proof, 
        PartyA Address - address _partyA, 
        PartyB Address _partyB, 
        Hub Stakes in Thread (for both parties) uint256[2] _bond,
        PartyA ETH Balance, Hub ETH Balance, PartyA Token Balance, Hub Token Balance - uint256[4] 
        PartyA Signature - string
Supplies the inital thread state to prime dispute game. Emits DidThreadInit event to indicate validity.

#### settleThread
    Parameters:
        Channel ID - bytes32  
        Thread ID - bytes32 
        Sequence - uint256
        PartyA Address - address 
        PartyB Address - address 
        PartyA ETH Balance, PartyB ETH Balance, PartyA Token Balance, PartyB Token Balance - uint256[4] 
        PartyA Signature - string
Updates balances of parties in thread using on-chain thread state. Emits DidThreadSettle event.

#### closeThread
    Parameters:
        Channel ID - bytes32
        Thread ID - bytes32
Closes an already-settled thread and emits DidThreadClose event.

#### byzantineCloseChannel
    Parameters:
        Channel ID - bytes32
Close channel that is in settlement state [[CONFIRM]].

### Getters

#### getChannel
    Parameters:
        Channel ID - bytes32
Returns structure containing 

`partyAddresses (address[2])`  
`ethBalances (uint256[4])`  
`erc20Balances (uint256[4])`  
`initialDeposit (uint256[2])`  
`sequence (uint256)`  
`confirmTime (uint256)`  
`threadRootHash (bytes32)`  
`openTimeout (uint256)`  
`updateChannelTimeout (uint256)`  
`isOpen (bool)`  
`isUpdateChannelSettling (bool)`  
`numOpenThread (uint256)`

#### getThread
    Parameters:
        Thread ID - bytes32
Returns structure containing  
`isClose (bool)`  
`isInSettlementState (bool)`  
`sequence (uint256)`  
`challenger (address)`  
`updateThreadTimeout (uint256)`  
`partyA (address)`  
`partyB (address)`   
`Hub (address)`  
`ethBalances (uint256[2])`
`erc20Balances (uint256[2])`
`bond (uint256[2])`