const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const base = 'https://steamcommunity.com/market/buyorders'
const files = new Map()

function load(context, filename) {
    if (!files.has(filename)) {
        const fullPath = path.join(__dirname, '..', 'SORS', filename)
        files.set(filename, new vm.Script(fs.readFileSync(fullPath, 'utf8'), { filename }))
    }
    files.get(filename).runInContext(context)
}

async function until(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate()) return
        await new Promise(setImmediate)
    }
    assert.fail('The scanner did not reach the expected state')
}

function event() {
    const listeners = []
    return { addListener: (listener) => listeners.push(listener), emit: (...args) => listeners.map((fn) => fn(...args)) }
}

function deliver(listener, message, sender) {
    return new Promise((resolve) => {
        if (!listener?.emit(structuredClone(message), sender, resolve).includes(true)) resolve(undefined)
    })
}

function order(id) {
    return { buy_orderid: String(id), appid: 570, hash_name: 'Item ' + id, price: 100, wallet_currency: 1,
        quantity: 1, quantity_remaining: 1, description: { commodity: true } }
}

function itemPage(name, bid, sale) {
    const book = { eCurrency: 1, cBuyOrders: 1, amtMaxBuyOrder: bid, cSellOrders: 1, rgCompactSellOrders: [sale, 1] }
    const queries = [{ queryKey: ['market', 'orderbook', 570, name], state: { data: book } }]
    const ssr = { renderContext: { queryData: JSON.stringify({ queries }) } }
    return '<script id="valve-ssr-data">' + JSON.stringify(ssr) + '</script>'
}

function response(data, status = 200) {
    return { ok: status === 200, status, json: async () => data, text: async () => data }
}

function scanner(options = {}) {
    let now = 1700000000000
    const tabs = new Map()
    const workerMessages = event()
    const removed = event()
    const changed = event()
    const timers = new Map()
    const delays = []
    const writes = []
    const posts = []
    const items = []
    const session = {}
    const local = { accountWideScanSettingsSORS: true, delayPerOrderSORS: 0, ...options.initial }
    const orders = options.orders || [order(1)]

    function area(data) {
        return {
            get: async (keys) => structuredClone(Object.fromEntries(
                (Array.isArray(keys) ? keys : [keys]).filter((key) => key in data).map((key) => [key, data[key]])
            )),
            set: async (values) => {
                const updates = structuredClone(values)
                if (data === local && updates.scanStatusSORS?.pendingCancellation && !local.scanStatusSORS?.pendingCancellation) {
                    now += options.saveIntent?.() ?? 0
                }
                Object.assign(data, updates)
                if (data === local) {
                    writes.push(updates)
                    changed.emit(Object.fromEntries(Object.entries(updates).map(([k, v]) => [k, { newValue: v }])), 'local')
                }
            },
            remove: async (key) => { delete data[key] }
        }
    }

    const storage = { local: area(local), session: area(session), onChanged: changed }
    const quiet = { warn() {}, error() {}, log() {} }
    class Clock extends Date { static now() { return now } }
    const worker = vm.createContext({ Date: Clock, console: quiet, crypto: { randomUUID }, chrome: {
        storage, runtime: { onMessage: workerMessages },
        tabs: { onRemoved: removed, onUpdated: event(), sendMessage: (id, msg) => deliver(tabs.get(id), msg, {}) }
    } })
    load(worker, 'background.js')

    function timed(callback, delay) {
        const id = Symbol()
        const fire = () => {
            if (!timers.delete(id)) return
            now += delay
            callback()
        }
        timers.set(id, { delay, fire })
        if (delay !== 15000 && delay !== 30000) {
            delays.push(delay)
            queueMicrotask(fire)
        }
        return id
    }

    async function fetch(url, request = {}) {
        const target = new URL(url, base)
        if (target.pathname === '/market/mylistings/') {
            return response({ success: true, buy_orders: orders }, options.listStatus)
        }
        if (target.pathname === '/market/userbillinginfo') return response({ wallet_info: { wallet_currency: 1 } })
        if (target.pathname === '/market/actions' && request.method === 'POST') {
            const { mp: [id] } = JSON.parse(request.body)
            assert.equal(local.scanStatusSORS.pendingCancellation.orderId, id)
            posts.push({ id, signal: request.signal })
            return options.onCancel ? options.onCancel(id) : response({ data: 1 })
        }
        if (target.searchParams.get('q') === 'QueryFeeStructure') {
            if (options.feeDelay) now += options.feeDelay
            const fee = { ecurrency: 1, fee_rate: 0, fee_cap: 0 }
            return response({ data: { steam_fee: fee, publisher_fee: fee } })
        }
        assert.equal(target.pathname.startsWith('/market/listings/570/'), true)
        const name = decodeURIComponent(target.pathname.split('/').at(-1))
        items.push(name)
        return options.onItem ? options.onItem(name, items.length) : response(itemPage(name, 100, 200))
    }

    function openTab(id) {
        const listener = event()
        tabs.set(id, listener)
        const send = (msg) => deliver(workerMessages, msg, { tab: { id, url: base }, url: base })
        const context = vm.createContext({ URL, Date: Clock, AbortController, console: quiet, fetch, setTimeout: timed,
            clearTimeout: (key) => timers.delete(key), location: new URL(base), window: { addEventListener() {} },
            chrome: { storage, runtime: { onMessage: listener, sendMessage: send } } })
        for (const file of ['market/steam-currency.js', 'market/account-market-data.js', 'scanner/item-prices.js', 'scanner/runner.js']) {
            load(context, 'site/' + file)
        }
        return { start: () => send({ type: 'sors-scan-start' }), stop: () => send({ type: 'sors-scan-stop' }),
            close: () => { tabs.delete(id); removed.emit(id) } }
    }

    return { local, session, writes, items, posts, delays, openTab, tab: openTab(1),
        expire: (delay) => {
            const timer = [...timers.values()].find((entry) => entry.delay === delay)
            assert.ok(timer, 'No pending timeout of ' + delay)
            timer.fire()
        },
        finished: () => until(() => !session.scanOwner && !!local.scanStatusSORS?.finishedAt)
    }
}

for (const checkFirst of [true, false]) {
    test('fresh HTML can revoke an automatic cancellation based on ' + (checkFirst ? 'highest bid' : 'sale price'), async () => {
        const s = scanner({ initial: checkFirst ? { cancelFirstOrdersSORS: true } : { cancelHighOrdersSORS: true },
            feeDelay: 16000, onItem: (name, index) => response(itemPage(name,
                checkFirst && index === 1 ? 100 : 125, !checkFirst && index === 1 ? 90 : 200)) })
        await s.tab.start()
        await s.finished()
        assert.deepEqual(s.items, ['Item 1', 'Item 1'])
        assert.equal(s.posts.length, 0)
        assert.equal(s.local.scanStatusSORS.skipped, 0)
        assert.deepEqual(s.local.scanLastCompletedSORS.rows, [])
    })
}

test('a failed freshness check skips only that order and never submits the stale cancellation', async () => {
    const s = scanner({ orders: [order(1), order(2)], initial: { cancelFirstOrdersSORS: true }, feeDelay: 16000,
        onItem: (name, index) => index === 2 ? response(null, 429) : response(itemPage(name, 100, 200)) })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.items, ['Item 1', 'Item 1', 'Item 2'])
    assert.deepEqual(s.posts.map((post) => post.id), ['2'])
    assert.equal(s.local.scanStatusSORS.skipped, 1)
    assert.match(s.local.scanStatusSORS.recentIssues[0], /verify prices.+429/)
    assert.equal(s.local.scanStatusSORS.canceled, 1)
})

test('a quote that expires while persisting intent is refreshed once before POST', async () => {
    let saves = 0
    const s = scanner({ initial: { cancelFirstOrdersSORS: true }, saveIntent: () => ++saves === 1 ? 16000 : 0 })
    await s.tab.start()
    await s.finished()
    assert.equal(s.items.length, 2)
    assert.equal(s.posts.length, 1)
    assert.equal(s.local.scanStatusSORS.canceled, 1)
})

test('if the intent cannot be persisted no cancellation is sent or counted as pending', async () => {
    const s = scanner({ initial: { cancelFirstOrdersSORS: true }, saveIntent: () => { throw new Error('Storage unavailable') } })
    await s.tab.start()
    await s.finished()
    assert.equal(s.posts.length, 0)
    assert.equal(s.local.scanStatusSORS.pendingCancellation, null)
    assert.equal(s.local.scanStatusSORS.skipped, 1)
    assert.equal(s.local.scanStatusSORS.failedCancellations, 0)
    assert.match(s.local.scanStatusSORS.recentIssues[0], /Storage unavailable/)
})

test('ordinary item HTML keeps its original retry cadence', async () => {
    const s = scanner({ onItem: (name, index) => index <= 7 ? response(null, 429) : response(itemPage(name, 100, 200)) })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.delays, [5000, 10000, 10000, 10000, 10000, 120000, 5000])
    assert.equal(s.local.scanStatusSORS.checked, 1)
})

for (const action of ['stop', 'timeout', 'close']) {
    test('pending POST is reported once after ' + action + ', and a second tab can start', async () => {
        let finishPost
        const options = { initial: { cancelFirstOrdersSORS: true },
            onCancel: () => new Promise((resolve) => { finishPost = resolve }) }
        const s = scanner(options)
        await s.tab.start()
        await until(() => s.posts.length === 1)
        if (action === 'close') s.tab.close()
        else if (action === 'stop') await s.tab.stop()
        else s.expire(30000)
        await s.finished()
        const state = s.local.scanStatusSORS
        assert.equal(state.phase, action === 'timeout' ? 'completed' : 'stopped')
        assert.equal(state.failedCancellations, 1)
        assert.equal(state.canceled, 0)
        assert.equal(state.pendingCancellation, null)
        assert.equal(s.posts[0].signal.aborted, action !== 'close')
        assert.match(state.recentIssues[0], /Item 1.+did not confirm/)
        // A delayed Steam success must not overwrite the newer scan.
        options.listStatus = 429
        const next = s.openTab(2)
        assert.equal((await next.start()).ok, true)
        finishPost(response({ data: 1 }))
        await s.finished()
        assert.notEqual(s.local.scanStatusSORS.runId, state.runId)
        assert.equal(s.local.scanStatusSORS.phase, 'error')
        assert.equal(s.local.scanStatusSORS.canceled, 0)
        assert.equal(s.posts.length, 1)
    })
}

test('last complete report migrates, survives startup HTTP 429, and changes only on completion', async () => {
    const oldRow = [570, 'Legacy item', '1.00', '1.15', '1.02', '1.17', true]
    const options = { listStatus: 429, initial: { scanProgressSORS: 100, scanEndTimeSORS: '24.11.2026, 12:00',
        scanTableBadSORS: [oldRow], scanPrefSuffSORS: ['', '€'] } }
    const s = scanner(options)
    await s.tab.start()
    await s.finished()
    assert.equal(s.local.scanStatusSORS.phase, 'error')
    assert.match(s.local.scanStatusSORS.error, /429/)
    assert.deepEqual(s.local.scanLastCompletedSORS, {
        rows: [oldRow], currencyAffixes: ['', '€'], finishedAt: options.initial.scanEndTimeSORS
    })
    options.listStatus = 200
    await s.tab.start()
    await s.finished()
    const saved = s.local.scanLastCompletedSORS
    assert.deepEqual(saved.rows, s.local.scanTableBadSORS)
    assert.equal(saved.rows[0][1], 'Item 1')
    assert.deepEqual(saved.currencyAffixes, ['$', ''])
    assert.equal(saved.runId, s.local.scanStatusSORS.runId)
    assert.equal(saved.finishedAt, s.local.scanStatusSORS.finishedAt)
})

test('Stop keeps both the last complete report and every row checked in this run', async () => {
    const prior = { rows: [], currencyAffixes: ['', '€'], runId: 'previous', finishedAt: 10 }
    const s = scanner({ initial: { cancelFirstOrdersSORS: true, scanLastCompletedSORS: prior },
        orders: Array.from({ length: 28 }, (_, i) => order(i + 1)),
        onCancel: (id) => id === '27' ? new Promise(() => {}) : response({ data: 1 }) })
    await s.tab.start()
    await until(() => s.posts.length === 27)
    await s.tab.stop()
    await s.finished()
    assert.deepEqual(s.local.scanLastCompletedSORS, prior)
    assert.equal(s.local.scanStatusSORS.checked, 26)
    assert.equal(s.local.scanTableBadSORS.length, 25)
    assert.equal(s.local.scanTableTailSORS[0][1], 'Item 26')
    assert.equal(s.local.scanStatusSORS.failedCancellations, 1)
})

test('629 flagged orders persist in batches with a complete live table after every checked order', async () => {
    const s = scanner({ orders: Array.from({ length: 629 }, (_, i) => order(i + 1)) })
    await s.tab.start()
    await s.finished()
    let rows = [], tail = [], fullWrites = 0
    for (const update of s.writes) {
        if (update.scanTableBadSORS) {
            rows = update.scanTableBadSORS
            if (rows.length) fullWrites++
        }
        if (update.scanTableTailSORS) tail = update.scanTableTailSORS
        if (update.scanStatusSORS) assert.equal(rows.length + tail.length, update.scanStatusSORS.checked)
        assert.ok(tail.length < 25)
    }
    assert.equal(fullWrites, 26)
    assert.equal(tail.length, 0)
    assert.equal(s.local.scanLastCompletedSORS.rows.length, 629)
    assert.equal(s.local.scanLastCompletedSORS.rows[628][1], 'Item 629')
})
