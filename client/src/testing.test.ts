import * as t from './testing'
import { assert } from './testing'

describe('makeSussinct', () => {
  it('should work', () => {
    assert.deepEqual(t.makeSussinct({
      balanceWeiHub: '1',
      balanceWeiUser: '2',
      timeout: 69,
    }), {
      balanceWei: ['1', '2'],
      timeout: 69,
    })
  })
})

describe('expandSussinct', () => {
  it('should work', () => {
    assert.deepEqual(t.expandSussinct({
      balanceWei: ['1', '2'],
      timeout: 69,
    }), {
      balanceWeiHub: '1',
      balanceWeiUser: '2',
      timeout: 69,
    })
  })
})

describe('assertStateEqual', () => {
  it('should work', () => {
    let state = t.getChannelState({
      balanceWei: [100, 200],
    })

    t.assertStateEqual(state, {
      balanceWeiHub: '100',
      balanceWeiUser: '200',
    })

    state = t.updateState(state, {
      timeout: 69,
      balanceWeiUser: 42,
      balanceToken: [6, 9],
    })

    t.assertStateEqual(state, {
      balanceWei: [100, 42],
      balanceTokenHub: '6',
      balanceTokenUser: '9',
      timeout: 69,
    })
  })
})
