import * as chai from 'chai'
import BN = require('bn.js')
import { Address, SignedChannelState } from './types'

//
// chai
//
chai.use(require('chai-subset'))
export const assert = chai.assert


export type SussinctChannelState<T=string|number|BN> = {
  contractAddress: Address
  user: Address
  recipient: Address
  balanceWei: [T, T],
  balanceToken: [T, T],
  pendingDepositWei: [T, T],
  pendingDepositToken: [T, T],
  pendingWithdrawalWei: [T, T],
  pendingWithdrawalToken: [T, T],
  txCount: [number, number],
  sigs: [string, string],
  threadRoot: string
  threadCount: number
  timeout: number
}

export type SignedOrSussinct = SussinctChannelState | SignedChannelState
export type PartialSignedOrSussinct = Partial<SussinctChannelState & SignedChannelState<string|number|BN>>


export function expandSussinct(s: SignedOrSussinct): SignedChannelState<string>
export function expandSussinct(s: PartialSignedOrSussinct): Partial<SignedChannelState<string>>
export function expandSussinct(s: SignedOrSussinct | Partial<SignedOrSussinct>) {
  let res = {} as any
  Object.entries(s).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      res[name + 'Hub'] = value[0].toString()
      res[name + 'User'] = value[1].toString()
    } else {
      if (name.endsWith('Hub') || name.endsWith('User'))
        value = (!value && value != 0) ? value : value.toString()
      res[name] = value
    }
  })
  return res
}

export function makeSussinct(s: SignedOrSussinct): SussinctChannelState<string>
export function makeSussinct(s: PartialSignedOrSussinct): Partial<SussinctChannelState<string>>
export function makeSussinct(s: SignedOrSussinct | Partial<SignedOrSussinct>): SussinctChannelState<string> {
  let res = {} as any
  Object.entries(s).forEach(([name, value]) => {
    let didMatchSuffix = false
    ;['Hub', 'User'].forEach((suffix, idx) => {
      if (name.endsWith(suffix)) {
        name = name.replace(suffix, '')
        if (!res[name])
          res[name] = []
        res[name][idx] = value && value.toString()
        didMatchSuffix = true
      }
    })
    if (!didMatchSuffix)
      res[name] = value
  })

  return res
}

export function mkAddress(prefix: string = '0x'): Address {
  return prefix.padEnd(42, '0')
}

export function mkHash(prefix: string = '0x') {
  return prefix.padEnd(66, '0')
}

export function updateState(s: SignedOrSussinct, ...rest: PartialSignedOrSussinct[]): SignedChannelState<string> {
  let res = expandSussinct(s)
  for (let s of rest) {
    res = {
      ...res,
      ...expandSussinct(s)
    }
  }
  return res
}

export function getChannelState(overrides?: Partial<SignedOrSussinct>): SignedChannelState<string> {
  return updateState({
    contractAddress: mkAddress('0xCCC'),
    user: mkAddress('0xAAA'),
    recipient: mkAddress('0x222'),
    balanceWeiHub: '1',
    balanceWeiUser: '2',
    balanceTokenHub: '3',
    balanceTokenUser: '4',
    pendingDepositWeiHub: '4',
    pendingDepositWeiUser: '5',
    pendingDepositTokenHub: '6',
    pendingDepositTokenUser: '7',
    pendingWithdrawalWeiHub: '8',
    pendingWithdrawalWeiUser: '9',
    pendingWithdrawalTokenHub: '10',
    pendingWithdrawalTokenUser: '11',
    txCountGlobal: 1,
    txCountChain: 1,
    threadRoot: mkHash(),
    threadCount: 0,
    timeout: 0,
    sigUser: '',
    sigHub: '',
  }, overrides || {})
}

export function assertStateEqual(actual: SignedChannelState, expected: Partial<SignedOrSussinct>): void {
  assert.containSubset(
    expandSussinct(actual),
    expandSussinct(expected),
  )
}
