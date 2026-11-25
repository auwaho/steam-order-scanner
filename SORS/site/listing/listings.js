var SORSListingDetails = (() => {
    const cardSelector = '.TfblJ5tKSxE-'
    const netAttribute = 'data-sors-seller-net'
    const volumeAttribute = 'data-sors-sales-volume'
    const day = 86400

    function normalize(value) {
        return typeof value === 'string' ? value.replaceAll('&nbsp;', ' ').replace(/\s+/g, ' ').trim() : ''
    }

    function readListings(queries, listingQuery) {
        const searchKey = JSON.stringify(listingQuery)
        const search = queries.find(({ queryKey }) => queryKey?.[0] === 'market_item_search' && JSON.stringify(queryKey[1]) === searchKey)
        const byId = new Map()
        const byNameAndPrice = new Map()
        for (const page of search?.state?.data?.pages ?? []) {
            for (const lot of page?.listings ?? []) {
                if (byId.has(lot.listingid)) continue
                const name = normalize(lot.description?.market_name ?? lot.description?.name)
                const gross = normalize(lot.strSubtotal)
                const valid = name && gross && Number.isSafeInteger(lot.unPrice) && lot.unPrice > 0 &&
                    Number.isSafeInteger(lot.unFee) && lot.unFee >= 0 && getCurrencyCodeById(lot.eCurrency)
                const net = valid ? formatSteamMoney(lot.unPrice, lot.eCurrency) : null
                byId.set(lot.listingid, { name, gross, net })
                const key = JSON.stringify([name, gross])
                // Lots in another seller's currency can round to the same displayed total.
                if (!byNameAndPrice.has(key)) byNameAndPrice.set(key, net)
                else if (byNameAndPrice.get(key) !== net) byNameAndPrice.set(key, null)
            }
        }
        return { byId, byNameAndPrice, ordered: [...byId.values()] }
    }

    function renderNetPrices(lots, sameSearch) {
        const cards = document.querySelectorAll(cardSelector)
        const updated = new Set()
        for (const [index, card] of cards.entries()) {
            const price = card.querySelector('button[data-accent-color="green"]')?.previousElementSibling
            if (price?.tagName !== 'SPAN') continue
            const gross = normalize(price.textContent)
            const name = normalize(card.firstElementChild?.querySelector('[style*="--line-clamp"]')?.textContent)
            const image = card.querySelector('[style*="/market_listings/ea/"]')
            const id = image?.getAttribute('style').match(/\/market_listings\/ea\/\d+\/(\d+)\//)?.[1]
            let net
            if (id) {
                const lot = lots?.byId.get(id)
                if (lot && lot.name === name && lot.gross === gross) net = lot.net
            } else if (sameSearch) {
                const lot = lots.ordered[index]
                if (lot?.name === name && lot.gross === gross) net = lots.byNameAndPrice.get(JSON.stringify([name, gross]))
            }
            if (net) {
                price.setAttribute(netAttribute, '(' + net + ')')
                updated.add(price)
            }
        }
        for (const price of document.querySelectorAll('[' + netAttribute + ']')) {
            if (!updated.has(price)) price.removeAttribute(netAttribute)
        }
    }

    function priceChart() {
        // The median chart has a heading and time-scale controls in its own header.
        // The cumulative order chart has a separate, unwrapped heading.
        return [...document.querySelectorAll('.recharts-wrapper')].find((wrapper) =>
            wrapper.parentElement?.previousElementSibling?.querySelector('h2'))
    }

    function renderVolume(chart, prices, itemName) {
        let label = document.querySelector('[' + volumeAttribute + ']')
        if (!chart || !Array.isArray(prices)) {
            label?.remove()
            return
        }
        const now = Math.floor(Date.now() / 1000)
        let sales = 0
        for (const entry of prices) {
            if (!Number.isSafeInteger(entry?.time)) { label?.remove(); return }
            if (entry.time > now - day && entry.time <= now) {
                if (!Number.isSafeInteger(entry.purchases) || entry.purchases < 0) { label?.remove(); return }
                sales += entry.purchases
            }
        }
        if (!label) {
            label = document.createElement('div')
            label.setAttribute(volumeAttribute, '')
        }
        const graph = chart.parentElement
        if (label.previousElementSibling !== graph) graph.after(label)
        const text = sales.toLocaleString() + ' sold in the last 24 hours'
        if (label.textContent !== text) label.textContent = text
        label.title = itemName
    }

    function clear() {
        document.querySelector('[' + volumeAttribute + ']')?.remove()
        for (const price of document.querySelectorAll('[' + netAttribute + ']')) price.removeAttribute(netAttribute)
    }

    return { cardSelector, readListings, renderNetPrices, priceChart, renderVolume, clear }
})()

// Older item pages expose their prices and graph in the HTML alongside the old market tables.
document.addEventListener('DOMContentLoaded', async () => {
    if (!location.pathname.startsWith('/market/listings/')) return
    const graph = document.querySelector('.zoom_controls.pricehistory_zoom_controls')
    const buyTable = document.getElementById('market_commodity_buyreqeusts_table')
    const ownOrder = document.querySelector('#tabContentsMyListings .market_listing_inline_buyorder_qty')
    if (!graph && !buyTable && !ownOrder && !document.querySelector('.market_listing_price_without_fee')) return
    document.documentElement.setAttribute('data-sors-legacy-listing', '')
    const scripts = [...document.querySelectorAll('script:not([src])')].map((script) => script.textContent)
    const findValue = (pattern) => scripts.map((script) => script.match(pattern)).find(Boolean)?.[1]

    if (graph) {
        try {
            const entries = JSON.parse(findValue(/\bvar\s+line1\s*=\s*(\[[^\n;]*\])\s*;/))
            const now = Date.now()
            const sales = entries.reduce((sum, [date, , quantity]) => {
                const time = Date.parse(date)
                return time > now - 86400000 && time <= now ? sum + (Number(quantity) || 0) : sum
            }, 0)
            const label = document.createElement('div')
            label.textContent = sales.toLocaleString() + ' sold in the last 24 hours'
            graph.before(label)
        } catch { /* Steam may omit history for a new item. */ }
    }
    if (ownOrder) {
        const fees = document.createElement('script')
        fees.src = chrome.runtime.getURL('site/market/steam-market-fees.js')
        fees.onload = () => {
            const script = document.createElement('script')
            script.src = chrome.runtime.getURL('site/listing/listings.page.js')
            document.head.append(script)
        }
        document.head.append(fees)
    }
    if (!buyTable) return
    const settings = await chrome.storage.local.get(['showMoreOrdersSORS', 'showMoreOrdersQtySORS'])
    const itemId = findValue(/\bMarket_LoadOrderSpread\(\s*(\d+)\s*\)/)
    if (!settings.showMoreOrdersSORS || !itemId) return
    const query = new URLSearchParams({
        item_nameid: itemId,
        country: findValue(/\bg_strCountryCode\s*=\s*"([^"]*)"/) ?? '',
        currency: findValue(/"wallet_currency"\s*:\s*(\d+)/) ?? '1',
        language: findValue(/\bg_strLanguage\s*=\s*"([^"]*)"/) ?? ''
    })
    try {
        const response = await fetch('/market/itemordershistogram?' + query)
        if (!response.ok) return
        const histogram = await response.json()
        const limit = Math.min(9999, Math.max(1, Number(settings.showMoreOrdersQtySORS) || 20))
        for (const [table, levels] of [[buyTable, histogram.buy_order_graph],
            [document.getElementById('market_commodity_forsale_table'), histogram.sell_order_graph]]) {
            if (!table?.isConnected || !Array.isArray(levels) || !levels.length) continue
            const expanded = document.createElement('table')
            expanded.className = 'market_commodity_orders_table'
            const header = expanded.createTHead().insertRow()
            for (const text of ['Price', 'Quantity']) {
                const cell = document.createElement('th')
                cell.textContent = text
                header.append(cell)
            }
            const body = expanded.createTBody()
            let previous = 0
            for (const [price, cumulative] of levels.slice(0, limit)) {
                const row = body.insertRow()
                row.insertCell().textContent = histogram.price_prefix + Number(price).toFixed(2) + histogram.price_suffix
                row.insertCell().textContent = cumulative - previous
                previous = cumulative
            }
            table.replaceWith(expanded)
        }
        if (!document.getElementById('market_commodity_order_spread')) {
            document.getElementById('market_buyorder_info_show_details')?.style.setProperty('display', 'none')
            document.getElementById('market_buyorder_info_details')?.style.setProperty('display', 'block')
        }
    } catch (error) {
        console.warn('SORS could not expand the legacy order table', error)
    }
}, { once: true })
