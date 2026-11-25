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

function itemBook(bid = 100, sale = 200) {
    return { eCurrency: 1, cBuyOrders: 1, amtMaxBuyOrder: bid, cSellOrders: 1, rgCompactSellOrders: [sale, 1] }
}

function bookReply(book = itemBook()) {
    return response({ data: { success: true, data: book } })
}

function itemPage(name, bid, sale, { appId = 570, commodity = true, description = { commodity }, book = itemBook(bid, sale) } = {}) {
    const queries = [
        { queryKey: ['market', 'orderbook', appId, name], state: { data: book } },
        { queryKey: ['market', 'description', appId, name], state: { data: description } }
    ]
    const ssr = { renderContext: { queryData: JSON.stringify({ queries }) } }
    return '<script id="valve-ssr-data">' + JSON.stringify(ssr) + '</script>'
}

function response(data, status = 200) {
    return { ok: status === 200, status, json: async () => data,
        text: async () => typeof data === 'string' ? data : JSON.stringify(data) }
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
    const pages = []
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
        if (target.pathname === '/market/orderbook') {
            assert.equal(target.origin, new URL(base).origin)
            assert.equal(request.credentials, 'same-origin')
            assert.equal(target.searchParams.get('q'), 'Load')
            assert.deepEqual([...target.searchParams.keys()].sort(), ['q', 'qp'])
            const [appId, name] = JSON.parse(target.searchParams.get('qp'))
            assert.equal(Number.isInteger(appId), true)
            assert.equal(typeof name, 'string')
            items.push(name)
            return options.onItem ? options.onItem(name, items.length) : bookReply()
        }
        const match = /^\/market\/listings\/(\d+)\/([^/]+)$/.exec(target.pathname)
        assert.ok(match, 'Unexpected request: ' + target.pathname)
        const appId = Number(match[1])
        const pathName = decodeURIComponent(match[2])
        const selected = orders.find((entry) => entry.appid === appId &&
            (entry.hash_name === pathName || entry.description?.market_bucket_group_id === pathName))
        assert.ok(selected, 'Unexpected listing: ' + pathName)
        pages.push(selected.hash_name)
        return options.onPage ? options.onPage(selected.hash_name, pages.length) :
            response(itemPage(selected.hash_name, 100, 200, { appId }))
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

    return { local, session, writes, items, pages, posts, delays, openTab, tab: openTab(1),
        expire: (delay) => {
            const timer = [...timers.values()].find((entry) => entry.delay === delay)
            assert.ok(timer, 'No pending timeout of ' + delay)
            timer.fire()
        },
        finished: () => until(() => !session.scanOwner && !!local.scanStatusSORS?.finishedAt)
    }
}

for (const commodity of [true, false]) {
    test('the direct book preserves the existing price estimate for ' + (commodity ? 'commodities' : 'individual items'), async () => {
        const selected = order(1)
        selected.description.commodity = commodity
        const book = { ...itemBook(), cSellOrders: 21, rgCompactSellOrders: [100, 5, 200, 2, 300, 3, 400, 1, 500, 10] }
        const s = scanner({ orders: [selected], onItem: () => bookReply(book) })
        await s.tab.start()
        await s.finished()
        const row = s.local.scanLastCompletedSORS.rows[0]
        assert.deepEqual(s.items, ['Item 1'])
        assert.deepEqual(s.pages, [])
        assert.deepEqual(row.slice(0, 7), [570, 'Item 1', '1.00', '1.00', commodity ? '2.49' : '2.59',
            commodity ? '2.49' : '2.59', true])
        assert.equal(row[7].belowThreshold, false)
        assert.equal(s.local.scanStatusSORS.skipped, 0)
    })
}

for (const commodity of [true, false]) {
    test('insufficient depth in both sources cannot cancel ' + (commodity ? 'commodities' : 'individual items'), async () => {
        const selected = order(1)
        selected.description.commodity = commodity
        const book = { ...itemBook(), cSellOrders: 20, rgCompactSellOrders: [50, 1, 60, 1] }
        const s = scanner({ orders: [selected], initial: { cancelFirstOrdersSORS: true, cancelHighOrdersSORS: true },
            onItem: () => bookReply(book),
            onPage: (name) => response(itemPage(name, 100, 200, { commodity, book })) })
        await s.tab.start()
        await s.finished()
        assert.deepEqual(s.items, ['Item 1'])
        assert.deepEqual(s.pages, ['Item 1'])
        assert.equal(s.posts.length, 0)
        assert.equal(s.local.scanStatusSORS.skipped, 0)
        assert.equal(s.local.scanStatusSORS.withoutSalePrice, 1)
        const row = s.local.scanLastCompletedSORS.rows[0]
        assert.deepEqual(row.slice(4, 7), [null, null, true])
        assert.equal(row[7].belowThreshold, null)
    })
}

for (const description of [{}, { commodity: 'unknown' }]) {
    test('an unclassified item in both order and HTML cannot produce an estimate or cancellation: ' + JSON.stringify(description), async () => {
        const selected = order(1)
        selected.description = description
        const s = scanner({ orders: [selected], initial: { cancelFirstOrdersSORS: true, cancelHighOrdersSORS: true },
            onPage: (name) => response(itemPage(name, 100, 50, { description })) })
        await s.tab.start()
        await s.finished()
        assert.deepEqual(s.items, [])
        assert.deepEqual(s.pages, ['Item 1'])
        assert.equal(s.posts.length, 0)
        assert.equal(s.local.scanStatusSORS.skipped, 0)
        assert.equal(s.local.scanStatusSORS.withoutSalePrice, 1)
        const row = s.local.scanLastCompletedSORS.rows[0]
        assert.deepEqual(row.slice(4, 7), [null, null, true])
        assert.equal(row[7].belowThreshold, null)
    })
}

test('a direct CS2 quote preserves the exact wear and quality in the report link metadata', async () => {
    const selected = { ...order(1), appid: 730, hash_name: 'StatTrak™ M4A1-S | Electrum (Field-Tested)',
        description: { commodity: false, market_bucket_group_id: 'G183C20990B3004', tags: [] } }
    const s = scanner({ orders: [selected] })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.items, [selected.hash_name])
    assert.deepEqual(s.pages, [])
    assert.deepEqual(s.local.scanLastCompletedSORS.rows[0][7], {
        quality: 'strange', exterior: 'WearCategory2', groupId: 'G183C20990B3004', belowThreshold: false
    })
})

for (const commodity of [undefined, null, 'unknown']) {
    test('unknown commodity metadata loads HTML before calculating a quote: ' + commodity, async () => {
        const selected = order(1)
        selected.description = { commodity }
        const s = scanner({ orders: [selected] })
        await s.tab.start()
        await s.finished()
        assert.deepEqual(s.items, [])
        assert.deepEqual(s.pages, ['Item 1'])
        assert.equal(s.local.scanStatusSORS.checked, 1)
        assert.equal(s.local.scanStatusSORS.skipped, 0)
        assert.equal(s.local.scanLastCompletedSORS.rows[0][4], '1.99')
    })
}

for (const direct of ['invalid JSON', 'unsuccessful reply', 'wrong currency', 'missing sell levels']) {
    test('HTML recovers a direct quote with ' + direct, async () => {
        const s = scanner({ onItem: () => {
            if (direct === 'invalid JSON') return response('{invalid')
            if (direct === 'unsuccessful reply') return response({ data: { success: false } })
            const book = itemBook()
            if (direct === 'wrong currency') book.eCurrency = 6
            else book.rgCompactSellOrders = []
            return bookReply(book)
        } })
        await s.tab.start()
        await s.finished()
        assert.deepEqual(s.items, ['Item 1'])
        assert.deepEqual(s.pages, ['Item 1'])
        assert.equal(s.local.scanStatusSORS.skipped, 0)
        assert.equal(s.local.scanStatusSORS.withoutSalePrice, 0)
        assert.equal(s.local.scanLastCompletedSORS.rows[0][4], '1.99')
    })
}

test('a currency mismatch in both sources cannot cancel an order', async () => {
    const foreignBook = { ...itemBook(), eCurrency: 6 }
    const s = scanner({ initial: { cancelFirstOrdersSORS: true, cancelHighOrdersSORS: true },
        onItem: () => bookReply(foreignBook),
        onPage: (name) => response(itemPage(name, 100, 200, { book: foreignBook })) })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.pages, ['Item 1'])
    assert.equal(s.posts.length, 0)
    assert.equal(s.local.scanStatusSORS.skipped, 1)
    assert.match(s.local.scanStatusSORS.recentIssues[0], /currency is 6; expected 1/)
    assert.deepEqual(s.local.scanLastCompletedSORS.rows, [])
})

test('unusable JSON and HTML skip only that order without cancelling it', async () => {
    const s = scanner({ orders: [order(1), order(2)], initial: { cancelFirstOrdersSORS: true },
        onItem: (name) => name === 'Item 1' ? response('{invalid') : bookReply(),
        onPage: () => response('<html>No exact order book</html>') })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.items, ['Item 1', 'Item 2'])
    assert.deepEqual(s.pages, ['Item 1'])
    assert.deepEqual(s.posts.map((post) => post.id), ['2'])
    assert.equal(s.local.scanStatusSORS.checked, 2)
    assert.equal(s.local.scanStatusSORS.skipped, 1)
    assert.equal(s.local.scanLastCompletedSORS.rows.length, 1)
    assert.equal(s.local.scanLastCompletedSORS.rows[0][1], 'Item 2')
})

test('an explicitly empty sell side can confirm the highest bid without an HTML request', async () => {
    const book = { ...itemBook(), cSellOrders: 0, rgCompactSellOrders: [] }
    const s = scanner({ initial: { cancelFirstOrdersSORS: true }, onItem: () => bookReply(book) })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.pages, [])
    assert.equal(s.posts.length, 1)
    assert.equal(s.local.scanStatusSORS.canceled, 1)
    assert.equal(s.local.scanStatusSORS.withoutSalePrice, 1)
    assert.equal(s.local.scanLastCompletedSORS.rows[0][4], null)
})

test('a partial sell side stays unconfirmed when HTML is unavailable', async () => {
    const book = { ...itemBook(), rgCompactSellOrders: [] }
    const s = scanner({ initial: { cancelFirstOrdersSORS: true }, onItem: () => bookReply(book),
        onPage: () => response('<html>No exact order book</html>') })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.pages, ['Item 1'])
    assert.equal(s.posts.length, 0)
    assert.equal(s.local.scanStatusSORS.skipped, 0)
    assert.equal(s.local.scanStatusSORS.withoutSalePrice, 1)
    assert.equal(s.local.scanLastCompletedSORS.rows[0][6], true)
})

for (const commodity of [true, false]) {
    test('a short direct sample falls back to HTML for ' + (commodity ? 'commodities' : 'individual items'), async () => {
        const selected = order(1)
        selected.description.commodity = commodity
        const incomplete = { ...itemBook(), cSellOrders: 20, rgCompactSellOrders: [150, 1, 200, 1] }
        const complete = { ...itemBook(), cSellOrders: 20, rgCompactSellOrders: [150, 1, 200, 1, 250, 1, 300, 17] }
        const s = scanner({ orders: [selected], onItem: () => bookReply(incomplete),
            onPage: (name) => response(itemPage(name, 100, 200, { commodity, book: complete })) })
        await s.tab.start()
        await s.finished()
        assert.deepEqual(s.pages, ['Item 1'])
        assert.equal(s.local.scanStatusSORS.skipped, 0)
        assert.equal(s.local.scanLastCompletedSORS.rows[0][4], commodity ? '2.24' : '2.99')
    })
}

for (const checkFirst of [true, false]) {
    test('a fresh order book can revoke an automatic cancellation based on ' + (checkFirst ? 'highest bid' : 'sale price'), async () => {
        const s = scanner({ initial: checkFirst ? { cancelFirstOrdersSORS: true } : { cancelHighOrdersSORS: true },
            feeDelay: 16000, onItem: (name, index) => bookReply(itemBook(
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
        onItem: (name, index) => index === 2 ? response(null, 429) : bookReply() })
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

test('order book HTTP 429 keeps its original retry cadence without fetching HTML', async () => {
    const s = scanner({ onItem: (name, index) => index <= 7 ? response(null, 429) : bookReply() })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.delays, [5000, 10000, 10000, 10000, 10000, 120000, 5000])
    const { scanStatusSORS: firstRetry } = s.writes.find((update) => update.scanStatusSORS?.phase === 'retrying')
    assert.equal(firstRetry.itemName, 'Item 1')
    assert.equal(firstRetry.itemAppId, 570)
    assert.equal(s.local.scanStatusSORS.checked, 1)
    assert.equal(s.local.scanStatusSORS.itemAppId, null)
    assert.deepEqual(s.pages, [])
})

test('HTML fallback retains the existing request retry cadence', async () => {
    const selected = order(1)
    delete selected.description.commodity
    const s = scanner({ orders: [selected],
        onPage: (name, index) => index <= 7 ? response(null, 429) : response(itemPage(name, 100, 200)) })
    await s.tab.start()
    await s.finished()
    assert.deepEqual(s.delays, [5000, 10000, 10000, 10000, 10000, 120000, 5000])
    assert.deepEqual(s.items, [])
    assert.equal(s.pages.length, 8)
    assert.equal(s.local.scanStatusSORS.checked, 1)
    assert.equal(s.local.scanStatusSORS.skipped, 0)
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

test('reports both matching reasons independently and counts each flagged order once', async () => {
    const quotes = [[100, 200], [100, 90], [125, 90], [100, 0], [125, 200]]
    const s = scanner({ orders: quotes.map((_, index) => order(index + 1)),
        onItem: (name, index) => bookReply(itemBook(...quotes[index - 1])),
        onPage: (name) => response(itemPage(name, ...quotes[Number(name.slice(5)) - 1])) })
    await s.tab.start()
    await s.finished()
    assert.equal(s.local.scanStatusSORS.checked, 5)
    assert.equal(s.local.scanStatusSORS.flagged, 4)
    assert.equal(s.local.scanStatusSORS.withoutSalePrice, 1)
    assert.deepEqual(s.local.scanLastCompletedSORS.rows.map((row) => [row[1], row[6], row[7].belowThreshold]), [
        ['Item 1', true, false],
        ['Item 2', true, true],
        ['Item 3', false, true],
        ['Item 4', true, null]
    ])
    assert.equal(s.posts.length, 0)
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
