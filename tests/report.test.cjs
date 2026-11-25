const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const extension = path.resolve(__dirname, '../SORS')
const source = relative => fs.readFileSync(path.join(extension, relative), 'utf8')

function element(tag = 'div') {
    const attributes = new Map()
    const listeners = new Map()
    return {
        tag, children: [], textContent: '', value: '',
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
        addEventListener(event, listener) { listeners.set(event, listener) },
        dispatch(event) { listeners.get(event)?.() },
        click() { this.dispatch('click') },
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
    function buttonsFor(attribute) {
        const matches = source('ext/report/report.html').matchAll(new RegExp('data-' + attribute + '="([^"]+)"', 'g'))
        return [...matches].map(([, key]) => ({
            ...element('button'), parentElement: element('th'), dataset: { [attribute]: key }
        }))
    }
    const buttons = buttonsFor('sort')
    const filters = buttonsFor('filter')
    getElementById('reportTable').querySelectorAll = () => buttons
    getElementById('filters').querySelectorAll = () => filters
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
        sort: key => buttons.find(button => button.dataset.sort === key),
        filter: key => filters.find(button => button.dataset.filter === key),
        context,
        getElementById,
        update(changes) {
            update(Object.fromEntries(Object.entries(changes).map(([key, newValue]) => [key, { newValue }])), 'local')
        },
        get rows() { return getElementById('badOrd').children },
        get visibleRows() { return this.rows.filter(row => !row.hidden) }
    }
}

const entry = (name, price = '1.00') => [570, name, price, '1.16', '0.88', '1.01', true]
const rowName = row => row.children[0].children[0].textContent

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
    assert.equal(report.rows[0].children[2].textContent, '1.00₴')
    report.getElementById('switchReport').click()
    assert.equal(report.rows.length, 0)
    assert.equal(report.getElementById('reportViewLabel').textContent, 'Showing current scan')
})

test('a completed snapshot with no live report still shows its rows and its currency', () => {
    const report = openReport({ scanLastCompletedSORS: {
        rows: [entry('Last item')], currencyAffixes: ['', '€'], finishedAt: 'Yesterday'
    } })
    assert.equal(report.getElementById('scanStatus').textContent, 'Last completed scan')
    assert.deepEqual(report.visibleRows.map(rowName), ['Last item'])
    assert.equal(report.rows[0].children[2].textContent, '1.00€')
})

test('incoming rows preserve sorting and existing row nodes', () => {
    const rows = [entry('A', '1.00'), entry('B', '3.00')]
    const status = { runId: 'live', phase: 'scanning', checked: 2, total: 5 }
    const report = openReport({ scanStatusSORS: status, scanTableBadSORS: rows })
    report.sort('order').click()
    assert.equal(report.sort('order').parentElement.getAttribute('aria-sort'), 'descending')
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
    report.sort('order').click()
    assert.deepEqual(report.rows.map(rowName), ['A', 'C', 'B'])
    assert.equal(report.sort('order').parentElement.getAttribute('aria-sort'), 'ascending')
})

test('filters use the recorded reason, handle old rows and keep searches active as rows arrive', () => {
    const both = [730, 'AK-47 | Slate (Field-Tested)', '4.72', '5.42', '4.30', '4.94', true, { belowThreshold: true }]
    const oldTop = entry('Legacy highest')
    const oldBelow = [...entry('Legacy below').slice(0, 6), false]
    const missing = [570, 'Unknown quote', '1.00', null, null, null, true]
    const report = openReport({ scanTableBadSORS: [both, oldTop, oldBelow, missing], scanPrefSuffSORS: ['$', ''] })
    assert.equal(report.filter('all').textContent, 'All 4')
    assert.equal(report.filter('top').textContent, 'Highest bid 3')
    assert.equal(report.filter('below').textContent, 'Below target 2')
    assert.equal(report.filter('missing').textContent, 'Unavailable 1')
    assert.deepEqual(report.rows[0].children.slice(2).map(cell => [cell.textContent, cell.children[0].textContent]), [
        ['$4.72', '($5.42)'], ['$4.94', '($4.30)'], ['−9.77%', '(−$0.42)']
    ])
    report.filter('below').click()
    assert.deepEqual(report.visibleRows.map(rowName), ['AK-47 | Slate', 'Legacy below'])
    const search = report.getElementById('reportSearch')
    search.value = '  fIeLd-TeStEd '
    search.dispatch('input')
    assert.deepEqual(report.visibleRows.map(rowName), ['AK-47 | Slate'])
    assert.equal(report.getElementById('scanCounts').textContent, '1 of 4 shown')
    report.update({ scanTableTailSORS: [[730, 'AK-47 | Other (Field-Tested)', '1.00', null, '0.99', '1.12', false]] })
    assert.deepEqual(report.visibleRows.map(rowName), ['AK-47 | Slate', 'AK-47 | Other'])
    report.filter('missing').click()
    assert.equal(report.getElementById('emptyReport').textContent, 'No findings match your filters.')
    search.value = ''
    search.dispatch('input')
    assert.deepEqual(report.visibleRows.map(rowName), ['Unknown quote'])
})

test('price sorts put missing amounts last in both directions and auxiliary sorts work on the same rows', () => {
    const lower = [730, 'Lower', '5.00', '5.75', '4.00', '4.60', false]
    const higher = [570, 'Higher', '1.00', '1.15', '9.00', '10.35', true]
    const unavailable = [730, 'Unavailable', '2.00', null, null, null, true]
    const report = openReport({ scanTableBadSORS: [lower, unavailable, higher] })
    for (const key of ['market', 'profit']) {
        report.sort(key).click()
        assert.deepEqual(report.rows.map(rowName), ['Higher', 'Lower', 'Unavailable'])
        report.sort(key).click()
        assert.deepEqual(report.rows.map(rowName), ['Lower', 'Higher', 'Unavailable'])
    }
    const extraSort = report.getElementById('extraSort')
    for (const [option, expected] of [
        ['scan:asc', ['Lower', 'Unavailable', 'Higher']],
        ['app:asc', ['Higher', 'Lower', 'Unavailable']],
        ['top:desc', ['Unavailable', 'Higher', 'Lower']]
    ]) {
        extraSort.value = option
        extraSort.dispatch('change')
        assert.deepEqual(report.rows.map(rowName), expected)
    }
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
