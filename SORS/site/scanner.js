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

    window.addEventListener('beforeunload', (event) => {
        event.preventDefault()
    })

    window.addEventListener('pagehide', (event) => {
        if (!event.persisted) {
            chrome.storage.local.set({ scanButtonSORS: 'start' })
        }
    })

    const ordersArray = []
    let isScanStopped = false
    let g_rgWalletInfo = {}

    let cancelHighOrders
    let cancelHighPercent
    let cancelFirstOrders
    let pauseOnErrors
    let delayPerOrder
    let delayRandom

    let timer

    chrome.storage.local.get(
        [
            'scanButtonSORS',
            'cancelHighOrdersSORS',
            'cancelHighPercentSORS',
            'cancelFirstOrdersSORS',
            'pauseOnErrorsSORS',
            'delayPerOrderSORS',
            'delayRandomSORS'
        ],
        function (result) {
            cancelHighOrders = result.cancelHighOrdersSORS
            cancelHighPercent = parseInt(result.cancelHighPercentSORS)
            cancelFirstOrders = result.cancelFirstOrdersSORS
            pauseOnErrors = parseInt(result.pauseOnErrorsSORS)
            delayPerOrder = parseInt(result.delayPerOrderSORS)
            delayRandom = parseInt(result.delayRandomSORS)

            if (result.scanButtonSORS == 'stop') {
                tabMyListings.click() /* make My Active Listings tab active */

                // push visible orders to array
                const marketItems = document.getElementsByClassName('market_listing_row market_recent_listing_row')
                for (const marketItem of marketItems) {
                    if (
                        marketItem.id.includes('mybuyorder_') &&
                        window.getComputedStyle(marketItem).display === 'block'
                    ) {
                        ordersArray.push(marketItem)
                    }
                }

                if (ordersArray.length > 0) {
                    chrome.storage.onChanged.addListener(listenForStop)

                    function listenForStop(changes, namespace) {
                        /* listen for stop */
                        if (namespace == 'local' && 'scanButtonSORS' in changes) {
                            if (changes.scanButtonSORS.newValue == 'start') {
                                isScanStopped = true

                                if (timer != undefined) {
                                    clearTimeout(timer)
                                }

                                chrome.storage.onChanged.removeListener(listenForStop)
                            }
                        }
                        /* track scan options changes */
                        if (namespace == 'local' && 'cancelHighOrdersSORS' in changes) {
                            cancelHighOrders = changes.cancelHighOrdersSORS.newValue
                        }
                        if (namespace == 'local' && 'cancelHighPercentSORS' in changes) {
                            cancelHighPercent = parseInt(changes.cancelHighPercentSORS.newValue)
                        }
                        if (namespace == 'local' && 'cancelFirstOrdersSORS' in changes) {
                            cancelFirstOrders = changes.cancelFirstOrdersSORS.newValue
                        }
                        if (namespace == 'local' && 'pauseOnErrorsSORS' in changes) {
                            pauseOnErrors = parseInt(changes.pauseOnErrorsSORS.newValue)
                        }
                        if (namespace == 'local' && 'delayPerOrderSORS' in changes) {
                            delayPerOrder = parseInt(changes.delayPerOrderSORS.newValue)
                        }
                        if (namespace == 'local' && 'delayRandomSORS' in changes) {
                            delayRandom = parseInt(changes.delayRandomSORS.newValue)
                        }
                    }

                    window.stop()
                    setTimeout(startScan, 100) // run main function
                } else {
                    chrome.storage.local.set({
                        scanButtonSORS: 'start'
                    })
                    alert("Seems you haven't buy orders or not logined!")
                }
            }
        }
    )

    /* MAIN SCAN FUNCTION */
    async function startScan() {
        try {
            await scanOrders()
        } catch (error) {
            chrome.storage.local.set({ scanErrorSORS: true })
            console.error('Steam Order Scanner: scan failed', error)
            alert(`Scan stopped: ${error.message}\nReload the market page and try again.`)
        } finally {
            chrome.storage.local.set({ scanButtonSORS: 'start' })
            const marketTabs = document.getElementsByClassName('market_tab_well_tabs')[0]
            if (marketTabs) marketTabs.style.pointerEvents = ''
        }
    }

    async function scanOrders() {
        chrome.storage.local.set({ scanProgressSORS: 0 })

        console.log('%c ▼ single scan start ▼ ', 'background: #000000; color: #FFD700')
        document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = 'none'

        for (const oldOrder of ordersArray) {
            oldOrder.style.backgroundColor = 'rgba(0, 0, 0, 0.2)'
            oldOrder.style.border = '1px solid rgba(0, 0, 0, 0)'
        }
        ordersArray[0].scrollIntoView({
            block: 'center',
            behavior: 'smooth'
        })

        let sessionId = ''
        let prefix = ''
        let suffix = ''
        const table = []

        const myListingsJson = await fetchWithRetry('https://steamcommunity.com/market/mylistings/?norender=1')

        if (isScanStopped) return

        const myListings = JSON.parse(myListingsJson)
        const myBuyOrders = myListings.buy_orders

        const marketHtml = await fetchWithRetry('https://steamcommunity.com/market/')
        g_rgWalletInfo = parseWalletInfoFromHtml(marketHtml)
        if (Object.keys(g_rgWalletInfo).length === 0) {
            chrome.storage.local.set({ scanButtonSORS: 'start' })
            document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = ''
            alert('Cannot load wallet info. Make sure you are logged in to Steam.')
            return
        }
        sessionId = parseSessionIdFromHtml(marketHtml)

        try {
            const marketQueryData = extractSteamQueryData(marketHtml)
            ;[prefix, suffix] = resolveCurrencyPrefixSuffix(marketQueryData, g_rgWalletInfo)
        } catch {
            ;[prefix, suffix] = resolveCurrencyPrefixSuffix(null, g_rgWalletInfo)
        }

        for (const [i, order] of ordersArray.entries()) {
            const orderId = order.id.substring(11)
            const orderObj = myBuyOrders.find((o) => o.buy_orderid === orderId)
            if (orderObj === undefined) continue

            const appId = parseInt(orderObj.appid)
            const hashName = orderObj.hash_name
            const itemHref = `https://steamcommunity.com/market/listings/${appId}/${fixedEncodeURIComponent(hashName)}`
            const orderPrice = parseInt(orderObj.price)
            // var qty = parseInt(orderObj.quantity);
            // var qtyRemaining = parseInt(orderObj.quantity_remaining);
            const sourceCode = await fetchWithRetry(itemHref)

            if (isScanStopped) {
                console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700')
                document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = ''
                return
            }

            const queryData = extractSteamQueryData(sourceCode)

            const marketDescription = extractMarketDescription(queryData, appId, hashName)
            const isCommodityItem = marketDescription?.commodity === true

            // // Extract an array containing details for each item variant (exterior/category)
            // const marketPriceHistoryList = extractMarketPriceHistoryList(queryData)
            // // Extract prices for the exact item; each element includes: [ price_median, purchases, time ]
            // const marketPriceHistory = marketPriceHistoryList.find((item) => item.itemName === hashName).prices

            // Extract buy and sell orders from the order book
            const marketOrderBook = await extractMarketOrderBook(queryData, appId, hashName)
            if (isScanStopped) return
            if (Number(marketOrderBook.currency) !== Number(g_rgWalletInfo.wallet_currency)) {
                throw new Error(`Steam order book currency does not match your wallet for ${hashName}`)
            }

            // Extract buy and sell orders from the order book; each element includes: [ priceRaw, price, quantity ]
            const marketBuyOrders = parseCompactOrders(marketOrderBook.buyOrders)
            const marketSellOrders = parseCompactOrders(marketOrderBook.sellOrders)

            if (!marketBuyOrders.length) {
                continue
            }

            // for trFst
            const firstOrderPrice = marketBuyOrders[0].priceRaw
            let marketPrice = 0

            // for table
            if (isCommodityItem) {
                const avarageOfTwo =
                    marketSellOrders
                        .map((a) => a.price)
                        .slice(0, 4)
                        .reduce((a, b) => a + b) /
                        4 -
                    0.01
                marketPrice = avarageOfTwo < 0.16 ? (avarageOfTwo - 0.02) * 100 : Math.ceil((avarageOfTwo / 1.15) * 100)
            } else {
                const tenPrices = marketSellOrders
                    .flatMap((a) => Array(parseInt(a.quantity)).fill(a.priceRaw))
                    .slice(0, 10)
                const fivePrices = tenPrices.slice(Math.max(tenPrices.length - 5, 1))
                marketPrice = fivePrices.reduce((a, b) => a + b, 0) / fivePrices.length - 1
                marketPrice = GetItemPriceFromTotal(marketPrice, g_rgWalletInfo)
            }

            /* preventing false cancels (just in case) */
            if (isNaN(marketPrice) == true || marketPrice == 0) {
                continue
            }

            const isFirstInQueue = orderPrice == firstOrderPrice
            const isUnprofitable = (marketPrice * (100 - cancelHighPercent)) / 100 < orderPrice

            // add to bad orders array
            if (isFirstInQueue || isUnprofitable) {
                const ppct = parseFloat(g_rgWalletInfo.wallet_publisher_fee_percent_default ?? 0.1)
                const spct = parseFloat(g_rgWalletInfo.wallet_fee_percent ?? 0.05)
                const breakEvenPoint = GetTotalWithFees(orderPrice, ppct, spct, g_rgWalletInfo)
                const marketPriceWithFee = GetTotalWithFees(marketPrice, ppct, spct, g_rgWalletInfo)
                const tdOrder = (orderPrice / 100).toFixed(2)
                const tdOrderBEP = (breakEvenPoint / 100).toFixed(2)
                const tdMarket = (marketPrice / 100).toFixed(2)
                const tdMarketWithFee = (marketPriceWithFee / 100).toFixed(2)
                const td1st = orderPrice == firstOrderPrice

                table.push([appId, hashName, tdOrder, tdOrderBEP, tdMarket, tdMarketWithFee, td1st])
            }

            if (isFirstInQueue) {
                if (cancelFirstOrders) {
                    cancelBuyOrder('//steamcommunity.com/market/cancelbuyorder/', sessionId, orderId)
                }

                // order is first in queue, change order border to yellow
                order.style.border = '1px solid #FFD700'
            }

            if (isUnprofitable) {
                if (cancelHighOrders) {
                    cancelBuyOrder('//steamcommunity.com/market/cancelbuyorder/', sessionId, orderId)
                }

                // order is unprofitable, change order bg color to red
                order.style.backgroundColor = '#4C1C1C'

                // log unprofitable order
                console.log(`%c ${hashName} (${orderPrice / 100}/${marketPrice / 100}): ${itemHref}`, 'color: red')
            } else {
                // order is profitable, change order bg color to green
                order.style.backgroundColor = '#1C4C1C'
            }

            console.log('Check')
            chrome.storage.local.set({
                scanProgressSORS: ((i + 1) / ordersArray.length) * 100
            })
            chrome.storage.local.set({ scanTableBadSORS: table })

            await wait(random(delayPerOrder, (delayRandom / 100) * delayPerOrder + delayPerOrder))
        }

        chrome.storage.local.set({
            scanButtonSORS: 'start',
            scanEndTimeSORS: new Date().toLocaleString(),
            scanPrefSuffSORS: [prefix, suffix],
            scanTableBadSORS: table
        })

        console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700')
        document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = ''
    }

    /* OTHER FUNCTIONS */
    function parseWalletInfoFromHtml(html) {
        const match = html.match(/g_rgWalletInfo\s*=\s*(\{[\s\S]*?\})\s*;/)
        if (!match) return {}
        try {
            return JSON.parse(match[1])
        } catch (e) {
            return {}
        }
    }

    function parseSessionIdFromHtml(html) {
        const match = html.match(/g_sessionID\s*=\s*"([^"]+)"/)
        return match ? match[1] : ''
    }

    function extractSteamQueryData(pageSource) {
        const match = pageSource.match(
            /<script\b[^>]*\sid\s*=\s*(["'])valve-ssr-data\1[^>]*>([\s\S]*?)<\/script\s*>/i
        )
        if (!match) {
            throw new Error('Steam SSR data not found (valve-ssr-data)')
        }

        const renderContext = JSON.parse(match[2]).renderContext
        if (renderContext?.queryData == null) {
            throw new Error('Steam SSR queryData not found')
        }

        const queryData = JSON.parse(renderContext.queryData)
        if (!Array.isArray(queryData?.queries)) {
            throw new Error('Steam SSR queryData.queries is not an array')
        }

        return queryData
    }

    function extractMarketPriceHistoryList(queryData) {
        const result = []

        for (const query of queryData.queries ?? []) {
            const key = query.queryKey

            const isPriceHistory = Array.isArray(key) && key[0] === 'market' && key[1] === 'pricehistory'

            if (!isPriceHistory) continue

            result.push({
                appId: key[2],
                itemName: key[3],
                prices: query.state?.data?.prices ?? []
            })
        }

        return result
    }

    function extractMarketDescription(queryData, appId, itemName) {
        for (const query of queryData.queries ?? []) {
            const key = query.queryKey

            const isDescription =
                Array.isArray(key) &&
                key[0] === 'market' &&
                key[1] === 'description' &&
                key[2] === appId &&
                key[3] === itemName

            if (isDescription) {
                return query.state?.data ?? null
            }
        }

        return null
    }

    async function extractMarketOrderBook(queryData, appId, itemName) {
        let data
        for (const query of queryData.queries ?? []) {
            const key = query.queryKey

            const isOrderBook =
                Array.isArray(key) &&
                key[0] === 'market' &&
                key[1] === 'orderbook' &&
                key[2] === appId &&
                key[3] === itemName

            if (isOrderBook) {
                data = query.state?.data
                break
            }
        }

        // Grouped pages may contain only another variant's book.
        if (!data) {
            const url = new URL('https://steamcommunity.com/market/orderbook')
            url.searchParams.set('q', 'Load')
            url.searchParams.set('qp', JSON.stringify([appId, itemName]))
            const response = JSON.parse(
                await fetchWithRetry(url.href, 5, { headers: { 'x-valve-request-type': 'queryAction' } })
            )
            if (!response?.data?.success || !response.data.data) {
                throw new Error(`Steam order book could not be loaded for ${itemName}`)
            }
            data = response.data.data
        }

        return {
            appId,
            itemName,
            currency: data?.eCurrency,
            totalBuyOrders: data?.cBuyOrders,
            totalSellOrders: data?.cSellOrders,
            maxBuyOrder: data?.amtMaxBuyOrder,
            minSellOrder: data?.amtMinSellOrder,
            buyOrders: data?.rgCompactBuyOrders ?? [],
            sellOrders: data?.rgCompactSellOrders ?? []
        }
    }

    function parseCompactOrders(compactOrders) {
        const result = []

        for (let i = 0; i < compactOrders.length; i += 2) {
            result.push({
                priceRaw: compactOrders[i],
                price: compactOrders[i] / 100,
                quantity: compactOrders[i + 1]
            })
        }

        return result
    }

    String.prototype.extract = function (t, r) {
        let s = String(this)
        let e = s.indexOf(t)
        if (!(e >= 0)) return ''
        s = s.substring(e + t.length)
        if (r) {
            e = s.indexOf(r)
            if (!(e >= 0)) return ''
            s = s.substring(0, e)
        }
        return s
    }

    async function wait(ms) {
        return new Promise((resolve) => {
            timer = setTimeout(resolve, ms)
        })
    }

    function random(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min)
    }

    function fetchUrl(url, options) {
        return new Promise(function (resolve, reject) {
            fetch(url, options)
                .then((response) => {
                    if (response.ok) {
                        chrome.storage.local.set({ scanErrorSORS: false })
                        resolve(response.text())
                    } else {
                        const error = new Error(response.statusText)
                        reject(error)
                    }
                })
                .catch((error) => {
                    reject(error)
                })
        })
    }

    async function fetchWithRetry(url, attempts = 5, options) {
        return await fetchUrl(url, options).catch(async function () {
            chrome.storage.local.set({ scanErrorSORS: true })

            if (attempts == 5) {
                await wait(5000)
                return fetchWithRetry(url, attempts - 1, options)
            } else if (attempts <= 0) {
                await wait(pauseOnErrors * 60000)
                return fetchWithRetry(url, 5, options)
            }
            await wait(10000)
            return fetchWithRetry(url, attempts - 1, options)
        })
    }

    async function cancelBuyOrder(url, sessionid, buy_orderid) {
        const params = `sessionid=${sessionid}&buy_orderid=${buy_orderid}`

        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params
        }).then((response) => {
            if (!response.ok) {
                throw new Error(response.statusText)
            }
            return response.text()
        })
    }

    function fixedEncodeURIComponent(str) {
        return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
            return '%' + c.charCodeAt(0).toString(16)
        })
    }
})()
