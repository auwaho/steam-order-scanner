const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function loadMarketData(fetch) {
    const context = vm.createContext({
        URL,
        AbortController,
        location: { origin: 'https://steamcommunity.com' },
        fetch
    })
    const filename = path.join(__dirname, '../SORS/site/market/account-market-data.js')
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename })
    return context.SORSAccountMarketData
}

function jsonResponse(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => data }
}

function buyOrders(currency) {
    return {
        success: true,
        buy_orders: [{
            buy_orderid: '9007199254741999',
            appid: 730,
            hash_name: 'Example item',
            price: '4000',
            wallet_currency: currency,
            quantity: '1',
            quantity_remaining: '1'
        }]
    }
}

function wallet(currency) {
    return {
        wallet_info: {
            wallet_currency: currency,
            wallet_market_minimum: 1,
            wallet_currency_increment: 1
        }
    }
}

test('a new account read refreshes the wallet after an account currency change', async () => {
    let currency = 1
    let walletRequests = 0
    const market = loadMarketData(async (url, options) => {
        assert.equal(options.cache, 'no-store')
        if (url === '/market/mylistings/?norender=1') return jsonResponse(buyOrders(currency))
        assert.equal(url, '/market/userbillinginfo')
        walletRequests++
        return jsonResponse(wallet(currency))
    })

    const originalAccount = await market.getBuyOrders()
    currency = 18
    const changedAccount = await market.getBuyOrders()

    assert.equal(originalAccount.wallet.wallet_currency, 1)
    assert.equal(changedAccount.wallet.wallet_currency, 18)
    assert.equal(changedAccount.orders[0].wallet_currency, 18)
    assert.equal(changedAccount.orders[0].buy_orderid, '9007199254741999')
    assert.equal(walletRequests, 2)
})

test('concurrent readers share only the pending wallet request', { timeout: 2000 }, async () => {
    let finishWallet
    let announceWallet
    let walletRequests = 0
    const walletStarted = new Promise((resolve) => { announceWallet = resolve })
    const walletResponse = new Promise((resolve) => { finishWallet = resolve })
    const market = loadMarketData(async (url) => {
        if (url === '/market/mylistings/?norender=1') return jsonResponse(buyOrders(18))
        assert.equal(url, '/market/userbillinginfo')
        walletRequests++
        announceWallet()
        return walletResponse
    })

    const first = market.getBuyOrders()
    const second = market.getBuyOrders()
    await walletStarted
    await new Promise(setImmediate)
    assert.equal(walletRequests, 1)

    finishWallet(jsonResponse(wallet(18)))
    const accounts = await Promise.all([first, second])
    assert.equal(accounts[0].wallet.wallet_currency, 18)
    assert.equal(accounts[1].wallet.wallet_currency, 18)

    await market.getBuyOrders()
    assert.equal(walletRequests, 2)
})

test('a failed wallet response can recover on the next account read', async () => {
    let walletRequests = 0
    const market = loadMarketData(async (url) => {
        if (url === '/market/mylistings/?norender=1') return jsonResponse(buyOrders(18))
        assert.equal(url, '/market/userbillinginfo')
        walletRequests++
        return walletRequests === 1 ? jsonResponse({}, 429) : jsonResponse(wallet(18))
    })

    assert.equal((await market.getBuyOrders()).wallet, null)
    assert.equal((await market.getBuyOrders()).wallet.wallet_currency, 18)
    assert.equal(walletRequests, 2)
})

test('cancellation forwards its abort signal and preserves the exact order ID', async () => {
    const controller = new AbortController()
    let requests = 0
    const market = loadMarketData(async (url, options) => {
        requests++
        assert.equal(url, '/market/actions')
        assert.equal(options.method, 'POST')
        assert.equal(options.signal, controller.signal)
        assert.equal(options.headers['x-valve-request-type'], 'mutationAction')
        assert.deepEqual(JSON.parse(options.body), {
            m: 'CancelBuyOrder',
            mp: ['9007199254741999']
        })
        return jsonResponse({ data: 1 })
    })

    await market.cancelBuyOrder('9007199254741999', controller.signal)
    assert.equal(requests, 1)
})

test('an already aborted cancellation sends no POST', async () => {
    const controller = new AbortController()
    const stopped = new Error('The scan was stopped.')
    controller.abort(stopped)
    let requests = 0
    const market = loadMarketData(async () => {
        requests++
        return jsonResponse({ data: 1 })
    })

    await assert.rejects(market.cancelBuyOrder('9007199254741999', controller.signal),
        (error) => error === stopped)
    assert.equal(requests, 0)
})

test('the shared formatter uses Steam currency separators and whole-unit display', () => {
    const filename = path.join(__dirname, '../SORS/site/market/steam-currency.js')
    const context = vm.createContext({})
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename })

    assert.equal(context.formatSteamMoney(1174043, 1), '$11,740.43')
    assert.equal(context.formatSteamMoney(4000, 18), '40₴')
    assert.equal(context.formatSteamMoney(123456, 3), '1 234,56€')
    assert.equal(context.formatSteamMoney(123400, 8), '¥ 1,234')
    assert.equal(context.formatSteamMoney(12345, 8), '¥ 123.45')
})
