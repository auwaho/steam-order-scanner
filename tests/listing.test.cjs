const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

function load(context, filename) {
    const file = path.join(__dirname, '../SORS/site', filename)
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file })
}

test('a grouped commodity follows the Steam picker, retries 429 once due, and cancels on navigation', async () => {
    const normal = 'Music Kit | Example'
    const stattrak = 'StatTrak™ Music Kit | Example'
    const listing = { appid: 730, success: true, bCommodity: true, initialFallbackBucketID: normal, buckets: [
        { bucket_id: normal, localized_name_inside_group: 'Normal' },
        { bucket_id: stattrak, localized_name_inside_group: 'StatTrak™' }
    ] }
    const script = { textContent: JSON.stringify({ loaderData: [listing], renderContext: { queryData: { queries: [] } } }) }
    let label = 'Normal'
    const tab = { querySelector: () => ({ textContent: label }) }
    const picker = { previousElementSibling: { querySelector: () => tab } }
    const table = { hasAttribute: () => false, getClientRects: () => [1], textContent: 'native', removeAttribute() {} }
    const timers = new Map()
    const requests = []
    const frames = []
    const events = {}
    const location = new URL('https://steamcommunity.com/market/listings/730/G12345')
    const document = {
        documentElement: { nodeType: 1, querySelector: () => script },
        readyState: 'complete', addEventListener() {},
        querySelector: (selector) => selector === '.Gfv8gLv9Z74-' ? picker : null,
        querySelectorAll: (selector) => selector === 'table.APEAY0rnAbo-' ? [table] : []
    }
    const context = vm.createContext({
        document, location, URL, URLSearchParams, AbortController, AbortSignal,
        history: { state: { marketQuery: { appid: 730, strItemName: normal } } },
        window: { addEventListener: (type, handler) => { events[type] = handler } },
        chrome: { storage: {
            local: { get: (keys, callback) => callback({ showMoreOrdersSORS: true }) },
            onChanged: { addListener() {} }
        } },
        console: { warn() {} }, MutationObserver: class { observe() {} },
        requestAnimationFrame: (callback) => frames.push(callback),
        setTimeout: (callback, delay) => { timers.set(callback, delay); return callback },
        clearTimeout: (id) => timers.delete(id),
        fetch: async (url, { signal }) => {
            requests.push({ name: JSON.parse(url.searchParams.get('qp'))[1], signal })
            if (requests.length < 3) return new Response(null, { status: 429, headers: { 'Retry-After': '45' } })
            return new Promise(() => {})
        }
    })
    load(context, 'listing/listings.js')
    load(context, 'listing/listing-order-depth.js')
    async function render() {
        events.popstate()
        while (frames.length) frames.shift()()
        await new Promise(setImmediate)
    }
    await render()
    assert.deepEqual(requests.map(r => r.name), [normal])
    assert.deepEqual([...timers.values()], [45000])
    await render()
    assert.equal(requests.length, 1)
    const retry = [...timers.keys()][0]
    timers.delete(retry)
    retry()
    await render()
    assert.deepEqual(requests.map(r => r.name), [normal, normal])
    label = 'StatTrak™'
    await render()
    assert.deepEqual(requests.map(r => r.name), [normal, normal, stattrak])
    assert.equal(timers.size, 0)
    location.pathname = '/market/buyorders'
    await render()
    assert.equal(requests[2].signal.aborted, true)
})

test('volume counts sales in the last 24 hours of wall-clock time, including more than 24 entries', () => {
    const graph = { after(node) { this.label = node; node.previousElementSibling = this } }
    const context = vm.createContext({ document: {
        addEventListener() {}, querySelector: () => graph.label,
        createElement: () => ({ setAttribute() {} })
    } })
    load(context, 'listing/listings.js')
    const now = 1800000000
    vm.runInContext('Date.now = () => 1800000000000', context)
    const prices = [{ time: 1000, purchases: 999 }, { time: now - 86400, purchases: 70 },
        { time: now - 86399, purchases: 2 }, { time: now + 1, purchases: 99 },
        ...Array.from({ length: 25 }, (_, i) => ({ time: now - i, purchases: 1 }))]
    context.SORSListingDetails.renderVolume({ parentElement: graph }, prices, 'Item')
    assert.equal(graph.label.textContent, '27 sold in the last 24 hours')
    context.SORSListingDetails.renderVolume({ parentElement: graph }, [prices[0]], 'Item')
    assert.equal(graph.label.textContent, '0 sold in the last 24 hours')
})

test('a card needs its own matching subtotal and unambiguous seller proceeds', () => {
    const cards = ['1', null, '9'].map((id) => {
        const amount = { tagName: 'SPAN', textContent: 'USD 1.15',
            setAttribute(key, value) { this.net = value }, removeAttribute() { delete this.net } }
        return {
            amount, firstElementChild: { querySelector: () => ({ textContent: 'Example' }) },
            querySelector: (selector) => selector.startsWith('button') ? { previousElementSibling: amount } :
                id && { getAttribute: () => 'url(/market_listings/ea/570/' + id + '/image)' }
        }
    })
    const context = vm.createContext({ document: {
        addEventListener() {},
        querySelectorAll: selector => selector.startsWith('.') ? cards : cards.map(c => c.amount).filter(p => p.net)
    } })
    load(context, 'market/steam-currency.js')
    load(context, 'listing/listings.js')
    const query = { appid: 570, strItemName: 'Example' }
    const source = { description: { market_name: 'Example' }, strSubtotal: 'USD\u00a01.15', eCurrency: 1 }
    const lots = context.SORSListingDetails.readListings([{ queryKey: ['market_item_search', query],
        state: { data: { pages: [{ listings: [
            { ...source, listingid: '1', unPrice: 100, unFee: 15 },
            { ...source, listingid: '2', unPrice: 99, unFee: 16 }
        ] }] } } }], query)
    context.SORSListingDetails.renderNetPrices(lots, true)
    assert.deepEqual(cards.map(card => card.amount.net), ['($1.00)', undefined, undefined])
    cards[0].amount.textContent = 'USD 9.00'
    context.SORSListingDetails.renderNetPrices(lots, true)
    assert.equal(cards[0].amount.net, undefined)
})
