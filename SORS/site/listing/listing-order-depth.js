;(() => {
    'use strict'

    const nativeTableSelector = 'table.APEAY0rnAbo-'
    const replacementAttribute = 'data-sors-order-depth'
    const hiddenAttribute = 'data-sors-native-order-depth'
    const replacements = new Map()
    const parsedScripts = new WeakSet()
    const quantityFormat = new Intl.NumberFormat()
    const bookRead = {}
    const metadataRead = {}
    const historyRead = {}
    let metadata
    let enabled = false
    let rowLimit = 20
    let scheduled = false
    let selectionKey
    let currentPath
    let currentSearch
    let volumeTimer

    function pathName() {
        return location.pathname.replace(/\/$/, '')
    }

    function isListing(path) {
        return /^\/market\/listings\/\d+\/[^/]+(?:\/[^/]+)?$/.test(path)
    }

    function searchKey() {
        const params = new URLSearchParams(location.search)
        params.delete('detail')
        params.sort()
        return pathName() + '?' + params
    }

    function bookKey(appId, itemName) {
        return JSON.stringify([appId, itemName])
    }

    function loadBootstrap(data, path, search) {
        const loaders = (data.loaderData ?? []).map((value) => {
            if (typeof value !== 'string') return value
            try { return JSON.parse(value) } catch { return null }
        })
        const listing = loaders.find((value) => value?.success && Array.isArray(value.buckets))
        if (!listing || !Number.isInteger(listing.appid)) return false

        const serialized = data.renderContext?.queryData
        const queries = (typeof serialized === 'string' ? JSON.parse(serialized) : serialized)?.queries
        if (!Array.isArray(queries)) return false
        const books = new Map()
        const histories = new Map()
        for (const query of queries) {
            const key = query?.queryKey
            if (key?.[0] !== 'market' || key[2] !== listing.appid || typeof key[3] !== 'string') continue
            if (key[1] === 'orderbook') books.set(key[3], query.state?.data)
            if (key[1] === 'pricehistory' && Array.isArray(query.state?.data?.prices)) {
                histories.set(key[3], { prices: query.state.data.prices, loadedAt: Date.now() })
            }
        }
        metadata = { path, search, listing, books, histories, lots: SORSListingDetails.readListings(queries, listing.listingQuery),
            currency: loaders.find((value) => value?.filterConfig)?.filterConfig.currency }
        return true
    }

    function captureBootstrap(node) {
        if (node.nodeType !== 1) return false
        const script = node.id === 'valve-ssr-data' ? node : node.querySelector?.('#valve-ssr-data')
        if (!script || parsedScripts.has(script)) return false
        try {
            if (loadBootstrap(JSON.parse(script.textContent), pathName(), searchKey())) {
                parsedScripts.add(script)
                return true
            }
        } catch {
            // The parser may have inserted the script before its text arrives.
        }
        return false
    }

    function activeQuery() {
        return window.navigation?.currentEntry?.getState?.()?.marketQuery ?? history.state?.marketQuery
    }

    function selectedItem() {
        if (metadata?.path !== pathName()) return null
        const { listing } = metadata
        const buckets = listing.buckets.filter((bucket) => typeof bucket.bucket_id === 'string')
        let query = activeQuery()
        if (!query && metadata.search !== searchKey()) {
            const filters = {}
            const params = new URLSearchParams(location.search)
            for (const key of params.keys()) {
                if (key.startsWith('category_')) filters[key.slice(9)] = params.getAll(key)
            }
            query = { appid: listing.appid, filters }
        }
        if (query && query.appid !== listing.appid) return null

        let name
        if (listing.bCommodity) {
            name = buckets.length === 1 ? buckets[0].bucket_id : selectedCommodity(buckets)
        } else if (query) {
            const filters = query.filters ?? {}
            const chosenWear = filters.Exterior
            const namedBucket = buckets.find((bucket) => bucket.bucket_id === query.strItemName)
            const defaultNormal = !namedBucket && listing.appid === 730 && Array.isArray(chosenWear) &&
                chosenWear.length === 1 && filters.Quality === undefined
            const matchesFilters = (bucket) => (bucket.filters ?? []).every(([category, tag]) => {
                const selected = category === 'Quality' && defaultNormal ? ['normal'] : filters[category]
                return selected === undefined || (Array.isArray(selected) && selected.length === 1 && selected[0] === tag)
            })
            const exact = buckets.find((bucket) => bucket.bucket_id === query.strItemName && matchesFilters(bucket))
            if (exact) {
                name = exact.bucket_id
            } else {
                const candidates = buckets.filter((bucket) => matchesFilters(bucket) &&
                    bucket.filters?.some(([category]) => Array.isArray(filters[category]) && filters[category].length === 1))
                if (candidates.length === 1) name = candidates[0].bucket_id
            }
        } else {
            name = listing.initialSelectedBucketID
        }

        if (!buckets.some((bucket) => bucket.bucket_id === name)) return null
        return { appId: listing.appid, itemName: name, commodity: !!listing.bCommodity }
    }

    function selectedCommodity(buckets) {
        // Steam's commodity picker uses local component state. Its URL can still name the previous kit.
        const picker = document.querySelector('.Gfv8gLv9Z74-')?.previousElementSibling
        const tab = picker?.querySelector('[data-selected="true"]') ?? document.querySelector('.j5hLl0uc0ew-[data-selected="true"]')
        const label = (tab?.querySelector('span') ?? picker)?.textContent.trim()
        if (label) {
            const matches = buckets.filter((bucket) => (bucket.localized_name_inside_group || bucket.localized_name) === label)
            if (matches.length === 1) return matches[0].bucket_id
            if (tab) return null
        }
        const names = new Set([...document.querySelectorAll('h2 > span')].map((title) => title.textContent.trim()))
        const matches = buckets.filter((bucket) => names.has(bucket.localized_name) || names.has(bucket.bucket_id))
        return matches.length === 1 ? matches[0].bucket_id : null
    }

    function formatPrice(amount, currency) {
        const details = metadata.currency
        if (details?.eCurrency !== currency) return getCurrencyCodeById(currency) ? formatSteamMoney(amount, currency) : null
        const decimals = details.bWholeUnitsOnly && amount % 100 === 0 ? 0 : 2
        const [whole, fraction] = (amount / 100).toFixed(decimals).split('.')
        const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, () => details.strThousandsSeparator ?? ',')
        const value = fraction === undefined ? grouped : grouped + (details.strDecimalSymbol ?? '.') + fraction
        const symbol = details.strSymbol ?? ''
        const space = details.bSpaceForSymbol ? ' ' : ''
        return details.bSuffixSymbol ? value + space + symbol : symbol + space + value
    }

    function normalizedText(value) {
        return value.replace(/\s+/g, ' ').trim()
    }

    function orderLevels(compact, side) {
        if (!Array.isArray(compact) || compact.length % 2) return null
        const levels = []
        let previous
        for (let index = 0; index < compact.length; index += 2) {
            const price = compact[index]
            const quantity = compact[index + 1]
            if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0 ||
                (previous !== undefined && (side === 'buy' ? price >= previous : price <= previous))) return null
            levels.push({ price, quantity })
            previous = price
        }
        return levels
    }

    function tableRows(table) {
        return [...(table.tBodies[0]?.rows ?? [])]
    }

    function matchesNative(table, levels, currency, total) {
        if (!levels?.length) return false
        const rows = tableRows(table)
        const exact = levels.length > 6 ? 5 : levels.length
        if (rows.length !== Math.min(levels.length, 6)) return false
        const leadingRowsMatch = rows.slice(0, exact).every((row, index) => {
            const price = formatPrice(levels[index].price, currency)
            return row.cells.length === 2 && price !== null &&
                normalizedText(row.cells[0].textContent) === normalizedText(price) &&
                normalizedText(row.cells[1].textContent) === normalizedText(quantityFormat.format(levels[index].quantity))
        })
        if (!leadingRowsMatch || levels.length <= 6) return leadingRowsMatch

        const summary = rows[5]
        const shown = levels.slice(0, 5).reduce((sum, level) => sum + level.quantity, 0)
        return Number.isSafeInteger(total) && total > shown && summary.cells.length === 2 &&
            normalizedText(summary.cells[0].textContent).includes(normalizedText(formatPrice(levels[5].price, currency))) &&
            normalizedText(summary.cells[1].textContent) === normalizedText(quantityFormat.format(total - shown))
    }

    function removeReplacement(table) {
        replacements.get(table)?.element.remove()
        replacements.delete(table)
        table.removeAttribute(hiddenAttribute)
    }

    function restoreTables() {
        for (const table of replacements.keys()) removeReplacement(table)
    }

    function priceRow(template, price, quantity) {
        const row = template.cloneNode(true)
        for (const element of [row, ...row.querySelectorAll('[id]')]) element.removeAttribute('id')
        row.cells[0].firstElementChild.textContent = price
        row.cells[1].firstElementChild.textContent = quantityFormat.format(quantity)
        return row
    }

    function showLevels(table, side, levels, book) {
        const count = Math.min(rowLimit, levels.length)
        const nativeExactCount = levels.length > 6 ? 5 : levels.length
        if (count <= nativeExactCount) {
            removeReplacement(table)
            return
        }
        const total = side === 'buy' ? book.cBuyOrders : book.cSellOrders
        const signature = JSON.stringify([side, rowLimit, book.eCurrency, total, normalizedText(table.textContent), levels.slice(0, count + 1)])
        const existing = replacements.get(table)
        if (existing?.signature === signature) return
        removeReplacement(table)

        const rows = tableRows(table)
        const template = rows[0]
        if (!table.tHead || !template?.cells[0]?.firstElementChild || !template.cells[1]?.firstElementChild) return
        const expanded = table.cloneNode(false)
        expanded.removeAttribute('id')
        expanded.removeAttribute(hiddenAttribute)
        expanded.setAttribute(replacementAttribute, side)
        expanded.appendChild(table.tHead.cloneNode(true))
        const body = document.createElement('tbody')
        for (const level of levels.slice(0, count)) {
            body.appendChild(priceRow(template, formatPrice(level.price, book.eCurrency), level.quantity))
        }

        // Keep Steam's localized remainder label after the extra exact price levels.
        if (count < levels.length && levels.length > 6 && rows.length === 6) {
            const oldCutoff = formatPrice(levels[5].price, book.eCurrency)
            const summary = rows.at(-1)
            const label = summary.cells[0].textContent
            const shown = levels.slice(0, count).reduce((sum, level) => sum + level.quantity, 0)
            if (Number.isSafeInteger(total) && total > shown && label.includes(oldCutoff)) {
                body.appendChild(priceRow(summary, label.replace(oldCutoff, formatPrice(levels[count].price, book.eCurrency)), total - shown))
            }
        }
        expanded.appendChild(body)
        table.after(expanded)
        table.setAttribute(hiddenAttribute, '')
        replacements.set(table, { element: expanded, signature })
    }

    function cancelRead(state) {
        state.controller?.abort()
        clearTimeout(state.timer)
        state.controller = state.timer = state.completed = undefined
        state.failures = 0
        state.unavailable = false
    }

    function read(state, signature, operation) {
        if (state.controller || state.timer || state.unavailable || state.completed === signature) return
        const controller = new AbortController()
        state.controller = controller
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)])
        operation(signal).then(() => {
            signal.throwIfAborted()
            state.completed = signature
            state.failures = 0
            schedule()
        }).catch((error) => {
            if (controller.signal.aborted) return
            if ([400, 401, 403, 404, 410].includes(error.status)) {
                state.unavailable = true
                return
            }
            state.failures = (state.failures || 0) + 1
            const delay = Math.max(error.retryAfter || 0, Math.min(60000, 2000 * 2 ** Math.min(state.failures - 1, 5)))
            state.timer = setTimeout(() => {
                state.timer = undefined
                schedule()
            }, delay)
            if (state.failures === 1) console.warn('SORS could not update item details', error)
        }).finally(() => {
            if (state.controller === controller) state.controller = undefined
        })
    }

    async function fetchData(url, options) {
        const response = await fetch(url, { ...options, cache: 'no-store' })
        if (response.ok) return response
        const header = response.headers?.get('Retry-After')
        const retryAfter = header && (/^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now())
        throw Object.assign(new Error('Steam item request failed (' + response.status + ')'), {
            status: response.status,
            retryAfter: Math.min(2147483647, Math.max(retryAfter || 0, response.status === 429 ? 30000 : 0))
        })
    }

    async function queryItem(path, action, key, signal) {
        const url = new URL(path, location.origin)
        url.searchParams.set('q', action)
        url.searchParams.set('qp', key)
        const response = await fetchData(url, { headers: { 'x-valve-request-type': 'queryAction' }, signal })
        return (await response.json()).data
    }

    function loadBook(selection, signature) {
        // A successful response may lead Steam's visible table by one refresh.
        if (bookRead.completed === signature && !bookRead.timer) {
            bookRead.timer = setTimeout(() => {
                bookRead.completed = bookRead.timer = undefined
                schedule()
            }, 60000)
            return
        }
        const key = bookKey(selection.appId, selection.itemName)
        read(bookRead, signature, async (signal) => {
            const result = await queryItem('/market/orderbook', 'Load', key, signal)
            signal.throwIfAborted()
            if (!result?.success || !Number.isInteger(result.data?.eCurrency)) throw new Error('Steam order book unavailable')
            metadata.books.set(selection.itemName, result.data)
        })
    }

    function loadMetadata(path, search) {
        read(metadataRead, search, async (signal) => {
            const response = await fetchData(location.href, { signal })
            const html = await response.text()
            signal.throwIfAborted()
            const match = html.match(/<script\b[^>]*\sid\s*=\s*(["'])valve-ssr-data\1[^>]*>([\s\S]*?)<\/script\s*>/i)
            if (path !== pathName() || search !== searchKey()) return
            if (!match || !loadBootstrap(JSON.parse(match[2]), path, search)) throw new Error('Steam listing data unavailable')
        })
    }

    function updateDetails(selection, sameSearch) {
        SORSListingDetails.renderNetPrices(metadata.lots, sameSearch)
        const chart = selection && SORSListingDetails.priceChart()
        const name = selection?.itemName
        const entry = metadata.histories.get(name)
        SORSListingDetails.renderVolume(chart, entry?.prices, name)
        if (chart && !document.hidden && (!entry || Date.now() - entry.loadedAt >= 3600000)) {
            const key = bookKey(selection.appId, name)
            read(historyRead, key + (entry?.loadedAt ?? ''), async (signal) => {
                const history = await queryItem('/market/actions', 'QueryPriceHistory', key, signal)
                signal.throwIfAborted()
                if (!Array.isArray(history?.prices)) throw new Error('Steam price history unavailable')
                metadata.histories.set(name, { prices: history.prices, loadedAt: Date.now() })
            })
        }
        if (chart && entry && !document.hidden && !volumeTimer) {
            // Age the displayed window when the user keeps the item page open.
            volumeTimer = setTimeout(() => { volumeTimer = undefined; schedule() }, 60000)
        }
    }

    function update() {
        scheduled = false
        if (document.readyState === 'loading') return
        const path = pathName()
        if (currentPath !== path) {
            currentPath = path
            cancelRead(metadataRead)
            cancelRead(historyRead)
            cancelRead(bookRead)
            clearTimeout(volumeTimer)
            volumeTimer = undefined
            selectionKey = undefined
            restoreTables()
            SORSListingDetails.clear()
            if (metadata?.path !== path) metadata = undefined
        }
        if (!isListing(path)) return
        const search = searchKey()
        if (currentSearch !== search) {
            currentSearch = search
            cancelRead(metadataRead)
        }
        const tables = [...document.querySelectorAll(nativeTableSelector)].filter((table) => !table.hasAttribute(replacementAttribute))
        for (const [table, { element }] of replacements) {
            if (!table.isConnected || !element.isConnected) removeReplacement(table)
        }
        if (metadata?.search !== search && (tables.length || SORSListingDetails.priceChart() ||
            document.querySelector(SORSListingDetails.cardSelector))) loadMetadata(path, search)
        if (!metadata) return

        const selection = selectedItem()
        const key = selection && bookKey(selection.appId, selection.itemName)
        if (key !== selectionKey) {
            restoreTables()
            cancelRead(bookRead)
            cancelRead(historyRead)
            selectionKey = key
        }
        updateDetails(selection, metadata.search === search)
        if (!enabled || !selection) {
            restoreTables()
            cancelRead(bookRead)
            return
        }

        const visible = tables.filter((table) => (replacements.get(table)?.element ?? table).getClientRects().length)
        if (!visible.length) return
        const book = metadata.books.get(selection.itemName)
        const currency = book?.eCurrency
        const sides = selection.commodity ? ['sell', 'buy'] : ['buy']
        const levels = new Map(sides.map((side) => [side, orderLevels(book?.[side === 'buy' ? 'rgCompactBuyOrders' : 'rgCompactSellOrders'], side)]))
        let unmatched = false
        for (const table of visible) {
            const matches = Number.isInteger(currency) ? sides.filter((side) => matchesNative(
                table, levels.get(side), currency, side === 'buy' ? book.cBuyOrders : book.cSellOrders
            )) : []
            if (matches.length === 1) showLevels(table, matches[0], levels.get(matches[0]), book)
            else {
                removeReplacement(table)
                unmatched = true
            }
        }
        if (unmatched) loadBook(selection, JSON.stringify(visible.map((table) => normalizedText(table.textContent))))
    }

    function schedule() {
        if (!scheduled) {
            scheduled = true
            requestAnimationFrame(update)
        }
    }

    const watched = [nativeTableSelector, '.j5hLl0uc0ew-', '.Gfv8gLv9Z74-', 'h2', '.recharts-wrapper', SORSListingDetails.cardSelector].join(',')
    const observer = new MutationObserver((records) => {
        if (!isListing(pathName())) return
        let changed = false
        for (const record of records) {
            const target = record.target.nodeType === 1 ? record.target : record.target.parentElement
            if (target?.closest('[' + replacementAttribute + '], .recharts-wrapper, [data-sors-sales-volume]')) continue
            if (target?.id === 'valve-ssr-data' && captureBootstrap(target)) changed = true
            for (const node of [...record.addedNodes, ...record.removedNodes]) {
                if (record.addedNodes.length && captureBootstrap(node)) changed = true
                if (node.nodeType === 1 && !node.hasAttribute(replacementAttribute) &&
                    (node.matches(watched) || node.querySelector(watched))) changed = true
            }
            if (record.type === 'attributes' || target?.closest(watched)) changed = true
        }
        if (changed) schedule()
    })
    observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-selected'] })
    if (isListing(pathName())) captureBootstrap(document.documentElement ?? document)

    function setSettings(settings) {
        enabled = settings.showMoreOrdersSORS === true
        rowLimit = Math.max(1, Math.min(9999, Math.trunc(Number(settings.showMoreOrdersQtySORS)) || 20))
        schedule()
    }
    const settings = { showMoreOrdersSORS: false, showMoreOrdersQtySORS: 20 }
    chrome.storage.local.get(Object.keys(settings), (values) => setSettings(Object.assign(settings, values)))
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return
        if (!Object.keys(settings).some((key) => key in changes)) return
        for (const key of Object.keys(settings)) if (key in changes) settings[key] = changes[key].newValue
        setSettings(settings)
    })
    window.navigation?.addEventListener('navigatesuccess', schedule)
    window.navigation?.addEventListener('currententrychange', schedule)
    window.addEventListener('popstate', schedule)
    document.addEventListener('visibilitychange', schedule)
    document.addEventListener('DOMContentLoaded', () => {
        if (isListing(pathName())) captureBootstrap(document.documentElement)
        schedule()
    }, { once: true })
})()
