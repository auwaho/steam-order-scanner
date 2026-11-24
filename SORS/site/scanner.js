/*
  Steam Order Scanner - a browser extension for Steam Community Market
  that helps keep your orders profitable.
  Copyright (C) 2020 Artem Hryhorov

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see {http://www.gnu.org/licenses/}.

  Home: https://github.com/auwaho/steam-order-scanner
*/

;(function () {
    'use strict'

    const buyOrdersPage = /^\/market\/buyorders\/?$/
    const controller = new AbortController()
    const { signal } = controller
    const settingNames = [
        'scanButtonSORS',
        'cancelHighOrdersSORS',
        'cancelHighPercentSORS',
        'cancelFirstOrdersSORS',
        'pauseOnErrorsSORS',
        'delayPerOrderSORS',
        'delayRandomSORS'
    ]
    let settings

    chrome.storage.local.get(settingNames, (result) => {
        settings = result
        if (settings.scanButtonSORS === 'stop') startScan()
    })

    async function startScan() {
        chrome.storage.onChanged.addListener(onSettingsChanged)
        window.addEventListener('pagehide', stopForNavigation)
        window.navigation.addEventListener('navigatesuccess', onNavigation)

        try {
            if (!buyOrdersPage.test(location.pathname)) throw new Error('Open the Buy Orders page and try again.')
            await scanOrders()
        } catch (error) {
            if (!signal.aborted) {
                chrome.storage.local.set({ scanErrorSORS: true })
                console.error('Steam Order Scanner: scan failed', error)
                alert(`Scan stopped: ${error.message}`)
            }
        } finally {
            chrome.storage.onChanged.removeListener(onSettingsChanged)
            window.removeEventListener('pagehide', stopForNavigation)
            window.navigation.removeEventListener('navigatesuccess', onNavigation)
            if (!signal.aborted) chrome.storage.local.set({ scanButtonSORS: 'start' })
        }
    }

    function onSettingsChanged(changes, namespace) {
        if (namespace !== 'local') return
        if (changes.scanButtonSORS?.newValue === 'start') controller.abort()
        for (const name of settingNames) {
            if (name in changes) settings[name] = changes[name].newValue
        }
    }

    function stopForNavigation() {
        if (signal.aborted) return
        controller.abort()
        chrome.storage.local.set({ scanButtonSORS: 'start' })
    }

    function onNavigation() {
        if (!buyOrdersPage.test(location.pathname)) stopForNavigation()
    }

    async function scanOrders() {
        chrome.storage.local.set({ scanProgressSORS: 0, scanErrorSORS: false })

        const { orders, wallet } = await SORSAccountMarket.getBuyOrders(signal)
        signal.throwIfAborted()
        if (!orders.length) throw new Error('You have no active buy orders.')
        if (!wallet) throw new Error('Steam wallet settings could not be loaded.')

        const rows = SORSBuyOrders.getVisibleOrderRows(orders)
        const visibleOrders = orders.filter((order) => rows.has(order.buy_orderid))
        if (!visibleOrders.length) throw new Error('No buy orders could be matched to the rows currently shown.')

        const [prefix, suffix] = getCurrencyPrefixSuffix(wallet.wallet_currency)
        const table = []
        console.log('%c ▼ single scan start ▼ ', 'background: #000000; color: #FFD700')
        for (const row of rows.values()) {
            row.removeAttribute('data-sors-scan-result')
            row.removeAttribute('data-sors-first-in-queue')
        }
        rows.values().next().value.scrollIntoView({ block: 'center', behavior: 'smooth' })

        for (const [i, order] of visibleOrders.entries()) {
            signal.throwIfAborted()
            const row = rows.get(order.buy_orderid)
            const result = await inspectOrder(order, wallet)
            signal.throwIfAborted()
            if (result) {
                const { first, unprofitable, reportRow } = result
                if (reportRow) table.push(reportRow)

                if ((first && settings.cancelFirstOrdersSORS) || (unprofitable && settings.cancelHighOrdersSORS)) {
                    // A row can disappear while its prices are loading.
                    if (row.isConnected) {
                        await SORSAccountMarket.cancelBuyOrder(order.buy_orderid)
                        SORSBuyOrders.markCanceled(order.buy_orderid, row)
                        signal.throwIfAborted()
                    }
                }

                row.toggleAttribute('data-sors-first-in-queue', first)
                row.setAttribute('data-sors-scan-result', unprofitable ? 'unprofitable' : 'profitable')
            }

            chrome.storage.local.set({
                scanProgressSORS: ((i + 1) / visibleOrders.length) * 100,
                scanTableBadSORS: table
            })
            const delay = Number(settings.delayPerOrderSORS)
            const randomExtra = delay * Number(settings.delayRandomSORS) / 100
            await wait(delay + Math.floor(Math.random() * (randomExtra + 1)))
        }

        signal.throwIfAborted()
        chrome.storage.local.set({
            scanEndTimeSORS: new Date().toLocaleString(),
            scanPrefSuffSORS: [prefix, suffix],
            scanTableBadSORS: table
        })
        console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700')
    }

    async function inspectOrder(order, wallet) {
        const { appid: appId, hash_name: itemName, price: bid, wallet_currency: currency } = order
        if (currency !== wallet.wallet_currency) throw new Error(`Steam order currency does not match your wallet for ${itemName}`)

        const itemHref = `https://steamcommunity.com/market/listings/${appId}/${fixedEncodeURIComponent(itemName)}`
        const queryData = extractSteamQueryData(await fetchWithRetry(itemHref))
        const description = findItemQuery(queryData, 'description', appId, itemName)
        const book = await extractMarketOrderBook(queryData, appId, itemName)
        if (book.eCurrency !== currency) throw new Error(`Steam order book currency does not match your wallet for ${itemName}`)

        const firstBid = book.rgCompactBuyOrders?.[0]
        const sales = book.rgCompactSellOrders
        if (!Number.isSafeInteger(firstBid) || firstBid <= 0 || !sales?.length) return null
        const fees = await SORSAccountMarket.getFeeCalculator(appId, wallet)

        const isCommodity = (description?.commodity ?? order.description?.commodity) === true
        const marketGross = estimateBuyerPrice(sales, isCommodity)
        const net = fees.sellProceedsFrom(marketGross)
        if (!Number.isFinite(net) || net <= 0) return null

        const first = bid === firstBid
        const unprofitable = net * (100 - Number(settings.cancelHighPercentSORS)) / 100 < bid
        let reportRow
        if (first || unprofitable) {
            const amount = (value) => (value / 100).toFixed(2)
            reportRow = [appId, itemName, amount(bid), amount(fees.buyPriceFor(bid)), amount(net), amount(fees.buyPriceFor(net)), first]
        }
        if (unprofitable) console.log(`%c ${itemName} (${bid / 100}/${net / 100}): ${itemHref}`, 'color: red')
        return { first, unprofitable, reportRow }
    }

    function estimateBuyerPrice(sales, isCommodity) {
        const sample = []
        for (let i = 0; i + 1 < sales.length; i += 2) {
            const [price, quantity] = [sales[i], sales[i + 1]]
            if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) return 0

            if (isCommodity) {
                sample.push(price)
                if (sample.length === 4) break
            } else {
                for (let n = 0; n < quantity && sample.length < 10; n++) sample.push(price)
                if (sample.length === 10) break
            }
        }
        const prices = isCommodity || sample.length < 2 ? sample : sample.slice(Math.max(sample.length - 5, 1))
        return prices.length ? Math.floor(prices.reduce((sum, price) => sum + price, 0) / prices.length) - 1 : 0
    }

    function extractSteamQueryData(pageSource) {
        const match = pageSource.match(
            /<script\b[^>]*\sid\s*=\s*(["'])valve-ssr-data\1[^>]*>([\s\S]*?)<\/script\s*>/i
        )
        if (!match) throw new Error('Steam SSR data not found (valve-ssr-data)')

        const renderContext = JSON.parse(match[2]).renderContext
        if (renderContext?.queryData == null) throw new Error('Steam SSR queryData not found')

        const queryData = JSON.parse(renderContext.queryData)
        if (!Array.isArray(queryData?.queries)) throw new Error('Steam SSR queryData.queries is not an array')
        return queryData
    }

    function findItemQuery(queryData, kind, appId, itemName) {
        return queryData.queries.find(({ queryKey: key }) =>
            Array.isArray(key) && key[0] === 'market' && key[1] === kind && key[2] === appId && key[3] === itemName
        )?.state?.data
    }

    async function extractMarketOrderBook(queryData, appId, itemName) {
        const cached = findItemQuery(queryData, 'orderbook', appId, itemName)
        if (cached) return cached

        // A grouped page may only contain the book for a different variant.
        const url = new URL('https://steamcommunity.com/market/orderbook')
        url.searchParams.set('q', 'Load')
        url.searchParams.set('qp', JSON.stringify([appId, itemName]))
        const response = JSON.parse(await fetchWithRetry(url, { 'x-valve-request-type': 'queryAction' }))
        if (!response?.data?.success || !response.data.data) {
            throw new Error(`Steam order book could not be loaded for ${itemName}`)
        }
        return response.data.data
    }

    function wait(ms) {
        signal.throwIfAborted()
        return new Promise((resolve) => {
            const timer = setTimeout(finish, ms)
            signal.addEventListener('abort', finish, { once: true })

            function finish() {
                clearTimeout(timer)
                signal.removeEventListener('abort', finish)
                resolve()
            }
        })
    }

    async function fetchWithRetry(url, headers) {
        for (let failures = 0; ; failures++) {
            signal.throwIfAborted()
            try {
                const response = await fetch(url, { headers, signal })
                if (!response.ok) throw new Error(response.statusText)
                const text = await response.text()
                chrome.storage.local.set({ scanErrorSORS: false })
                return text
            } catch {
                signal.throwIfAborted()
                chrome.storage.local.set({ scanErrorSORS: true })
                if (failures === 5) {
                    await wait(Number(settings.pauseOnErrorsSORS) * 60000)
                    failures = -1
                } else {
                    await wait(failures === 0 ? 5000 : 10000)
                }
            }
        }
    }

    function fixedEncodeURIComponent(value) {
        return encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16))
    }
})()
