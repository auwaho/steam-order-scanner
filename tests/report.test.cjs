const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const extension = path.resolve(__dirname, '../SORS')
const source = relative => fs.readFileSync(path.join(extension, relative), 'utf8')

function element(tag = 'div') {
    const attributes = new Map()
    let click
    return {
        tag, children: [], style: {}, textContent: '',
        get childNodes() { return this.children },
        appendChild(node) {
            if (node.tag === 'fragment') this.children.push(...node.children)
            else this.children.push(node)
            return node
        },
        append(...nodes) {
            for (const node of nodes) {
                this.children = this.children.filter(child => child !== node)
                this.appendChild(node)
            }
        },
        insertCell() { return this.appendChild(element('td')) },
        insertBefore(node, next) {
            const index = next ? this.children.indexOf(next) : this.children.length
            this.children.splice(index, 0, node)
        },
        replaceChildren() { this.children = [] },
        addEventListener(event, listener) { if (event === 'click') click = listener },
        click() { click?.() },
        setAttribute(key, value) { attributes.set(key, value) },
        removeAttribute(key) { attributes.delete(key) },
        getAttribute(key) { return attributes.get(key) }
    }
}

function openReport(initial) {
    const ids = new Map()
    function getElementById(id) {
        if (!ids.has(id)) ids.set(id, element())
        return ids.get(id)
    }
    const buttons = Array.from({ length: 7 }, () => ({ ...element('button'), parentElement: element('th') }))
    getElementById('reportTable').querySelectorAll = () => buttons
    let update
    const context = vm.createContext({
        URLSearchParams,
        document: { getElementById, createElement: element, createDocumentFragment: () => element('fragment') },
        chrome: { storage: {
            local: { get: (_keys, callback) => callback(initial) },
            onChanged: { addListener: listener => { update = listener } }
        } }
    })
    vm.runInContext(source('ext/report/report.js'), context)
    return {
        buttons,
        context,
        getElementById,
        update(changes) {
            update(Object.fromEntries(Object.entries(changes).map(([key, newValue]) => [key, { newValue }])), 'local')
        },
        get rows() { return getElementById('badOrd').children }
    }
}

const entry = (name, price = '1.00') => [570, name, price, '1.16', '0.88', '1.01', true]
const rowName = row => row.children[2].children[0].textContent

test('a failed scan can show the last completed report without hiding the current failure', () => {
    const report = openReport({
        scanStatusSORS: { runId: 'new', phase: 'error', error: 'Steam request failed (429)' },
        scanTableBadSORS: [],
        scanPrefSuffSORS: ['$', ''],
        scanLastCompletedSORS: { runId: 'previous', rows: [entry('Saved')], currencyAffixes: ['', '₴'], finishedAt: 'Yesterday' }
    })
    assert.equal(report.getElementById('scanStatus').textContent, 'Scan failed')
    assert.equal(report.getElementById('scanIssue').textContent, 'Steam request failed (429)')
    assert.equal(report.getElementById('lastScan').textContent, 'Yesterday')
    assert.equal(rowName(report.rows[0]), 'Saved')
    assert.equal(report.rows[0].children[4].textContent, '1.00₴')
    report.getElementById('switchReport').click()
    assert.equal(report.rows.length, 0)
    assert.equal(report.getElementById('reportViewLabel').textContent, 'Showing current scan')
})

test('incoming rows preserve sorting and existing row nodes', () => {
    const rows = [entry('A', '1.00'), entry('B', '3.00')]
    const status = { runId: 'live', phase: 'scanning', checked: 2, total: 5 }
    const report = openReport({ scanStatusSORS: status, scanTableBadSORS: rows })
    report.buttons[4].click()
    assert.equal(report.buttons[4].parentElement.getAttribute('aria-sort'), 'descending')
    assert.deepEqual(report.rows.map(rowName), ['B', 'A'])
    const original = report.rows[0]
    const pending = entry('C', '2.00')
    report.update({ scanStatusSORS: { ...status, checked: 3 }, scanTableTailSORS: [pending] })
    assert.deepEqual(report.rows.map(rowName), ['B', 'C', 'A'])
    assert.equal(report.rows[0], original)
    assert.equal(report.getElementById('scanCounts').textContent, '3 flagged')
    report.update({ scanTableBadSORS: [...rows, pending], scanTableTailSORS: [] })
    assert.deepEqual(report.rows.map(rowName), ['B', 'C', 'A'])
    assert.equal(report.rows[0], original)
    report.buttons[4].click()
    assert.deepEqual(report.rows.map(rowName), ['A', 'C', 'B'])
    assert.equal(report.buttons[4].parentElement.getAttribute('aria-sort'), 'ascending')
})

test('a grouped StatTrak Music Kit keeps the exact quality in the report without Exterior', () => {
    const context = vm.createContext({ URL })
    vm.runInContext(source('site/scanner/item-prices.js'), context)
    const appid = 730
    const hash_name = 'StatTrak™ Music Kit | Austin Wintory, Bachram'
    const groupId = 'G18A20A300488012B'
    const book = { eCurrency: 1, amtMaxBuyOrder: 100, cBuyOrders: 1, cSellOrders: 1, rgCompactSellOrders: [120, 1] }
    const queryData = JSON.stringify({ queries: [{ queryKey: ['market', 'orderbook', appid, hash_name], state: { data: book } }] })
    const loaderData = [{ appid, listingQuery: { strItemName: groupId }, buckets: [{ bucket_id: hash_name, filters: [['Quality', 'strange']] }] }]
    const html = '<script id="valve-ssr-data">' + JSON.stringify({ renderContext: { queryData }, loaderData }) + '</script>'
    const parsed = context.SORSItemPrices.readItemPage(html, { appid, hash_name, wallet_currency: 1 })
    const metadata = parsed.getReportVariant()
    assert.equal(metadata.quality, 'strange')
    assert.equal(metadata.groupId, groupId)
    assert.equal(metadata.exterior, undefined)
    const { getListingUrl } = openReport({}).context
    const reportUrl = new URL(getListingUrl(appid, hash_name, metadata))
    assert.equal(reportUrl.pathname, '/market/listings/730/' + groupId)
    assert.equal(reportUrl.searchParams.get('category_Quality'), 'strange')
    assert.equal(reportUrl.searchParams.has('category_Exterior'), false)
    assert.equal(new URL(getListingUrl(570, 'Full-Bore Bonanza', metadata)).search, '')
})
