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

window.onbeforeunload = function () {
    if (chrome.runtime?.id) {
        chrome.storage.local.set({
            scanButtonSORS: 'start'
        })
    }
    return false
}

var orderList = []
var stopScan = false
var g_rgWalletInfo = {}

var cancelHighOrders
var cancelHighPercent
var cancelFirstOrders
var pauseOnErrors
var delayPerOrder
var delayRandom

var timer

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
        delayRandom = parseInt(result.delayRandom)

        if (result.scanButtonSORS == 'stop') {
            tabMyListings.click() /* make My Active Listings tab active */

            // push visible orders to array
            var marketItems = document.getElementsByClassName('market_listing_row market_recent_listing_row')
            for (var marketItem of marketItems) {
                if (marketItem.id.includes('mybuyorder_') && window.getComputedStyle(marketItem).display === 'block') {
                    orderList.push(marketItem)
                }
            }

            if (orderList.length > 0) {
                chrome.storage.onChanged.addListener(listenForStop)

                function listenForStop(changes, namespace) {
                    /* listen for stop */
                    if (namespace == 'local' && 'scanButtonSORS' in changes) {
                        if (changes.scanButtonSORS.newValue == 'start') {
                            stopScan = true

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

                window.onload = window.stop()
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
    chrome.storage.local.set({ scanProgressSORS: 0 })

    console.log('%c ▼ single scan start ▼ ', 'background: #000000; color: #FFD700')
    document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = 'none'

    for (var oldOrder of orderList) {
        oldOrder.style.backgroundColor = 'rgba(0, 0, 0, 0.2)'
        oldOrder.style.border = '1px solid rgba(0, 0, 0, 0)'
    }
    orderList[0].scrollIntoView({
        block: 'center',
        behavior: 'smooth'
    })

    var sessionId = ''
    var marketPrice
    var prefix = ''
    var suffix = ''
    var table = []

    var myListingsJson = await fetchWithRetry('https://steamcommunity.com/market/mylistings/?norender=1')

    if (stopScan) return

    var myListings = JSON.parse(myListingsJson)
    var buyOrders = myListings.buy_orders

    for (var [i, order] of orderList.entries()) {
        var orderId = order.id.substring(11)
        var orderObj = buyOrders.find((o) => o.buy_orderid === orderId)
        if (orderObj === undefined) continue

        var appId = parseInt(orderObj.appid)
        var hashName = orderObj.hash_name
        var orderHref = `https://steamcommunity.com/market/listings/${appId}/${fixedEncodeURIComponent(hashName)}`
        var orderPrice = parseInt(orderObj.price)
        // var qty = parseInt(orderObj.quantity);
        // var qtyRemaining = parseInt(orderObj.quantity_remaining);
        var sourceCode = await fetchWithRetry(orderHref)

        if (stopScan) {
            console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700')
            document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = ''
            return
        }

        if (Object.keys(g_rgWalletInfo).length === 0) {
            g_rgWalletInfo = JSON.parse(getFromBetween.get(sourceCode, `g_rgWalletInfo = `, `;`)[0])
        }

        if (prefix + suffix == '') {
            prefix = getFromBetween.get(sourceCode, `strFormatPrefix = "`, `"`)[0]
            suffix = getFromBetween.get(sourceCode, `strFormatSuffix = "`, `"`)[0]
        }
        if (sessionId == '') {
            sessionId = getFromBetween.get(sourceCode, `g_sessionID = "`, `"`)[0]
        }

        var itemNameId = getFromBetween.get(sourceCode, 'Market_LoadOrderSpread( ', ' )')[0]
        var itemGraphLink = `https://steamcommunity.com/market/itemordershistogram?country=${g_rgWalletInfo.wallet_country}&language=english&currency=${g_rgWalletInfo.wallet_currency}&item_nameid=${itemNameId}&two_factor=0`

        var itemGraphJson = await fetchWithRetry(itemGraphLink)

        if (stopScan) return

        var itemGraph = JSON.parse(itemGraphJson)

        // for trFst
        var firstOrderPrice = parseInt(itemGraph.buy_order_graph[0][0] * 100)

        // for table
        if (sourceCode.includes('<div id="market_commodity_order_spread">')) {
            var avarageOfTwo =
                itemGraph.sell_order_graph
                    .map((a) => a[0])
                    .slice(0, 4)
                    .reduce((a, b) => a + b) /
                    4 -
                0.01
            marketPrice = avarageOfTwo < 0.16 ? (avarageOfTwo - 0.02) * 100 : Math.ceil((avarageOfTwo / 1.15) * 100)
        } else {
            //var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', '</span>').map(s => s.replace(/[^\d^.^,]/g, '').replace(',', '.') * 100).filter(Number);
            //var tenPrices = itemGraph.sell_order_graph.map(a => a[0] * 100).slice(0, 10);
            var tenPrices = itemGraph.sell_order_graph
                .flatMap((a) => Array(parseInt(a[1])).fill(a[0] * 100))
                .slice(0, 10)
            var fivePrices = tenPrices.slice(Math.max(tenPrices.length - 5, 1))
            marketPrice = fivePrices.reduce((a, b) => a + b, 0) / fivePrices.length - 1
            marketPrice =
                marketPrice - CalculateFeeAmount(marketPrice, g_rgWalletInfo.wallet_publisher_fee_percent_default).fees
        }

        /* preventing false cancels (just in case) */
        if (isNaN(marketPrice) == true || marketPrice == 0) {
            continue
        }

        const isFirstInQueue = orderPrice == firstOrderPrice
        const isUnprofitable = (marketPrice * (100 - cancelHighPercent)) / 100 < orderPrice

        // add to bad orders array
        if (isFirstInQueue || isUnprofitable) {
            var breakEvenPoint = CalculateAmountToSendForDesiredReceivedAmount(
                orderPrice,
                g_rgWalletInfo.wallet_publisher_fee_percent_default
            ).amount
            var marketPriceWithFee = CalculateAmountToSendForDesiredReceivedAmount(
                marketPrice,
                g_rgWalletInfo.wallet_publisher_fee_percent_default
            ).amount
            var tdOrder = (orderPrice / 100).toFixed(2)
            var tdOrderBEP = (breakEvenPoint / 100).toFixed(2)
            var tdMarket = (marketPrice / 100).toFixed(2)
            var tdMarketWithFee = (marketPriceWithFee / 100).toFixed(2)
            var td1st = orderPrice == firstOrderPrice

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
            console.log(`%c ${hashName} (${orderPrice / 100}/${marketPrice / 100}): ${orderHref}`, 'color: red')
        } else {
            // order is profitable, change order bg color to green
            order.style.backgroundColor = '#1C4C1C'
        }

        console.log('Check')
        chrome.storage.local.set({ scanProgressSORS: parseInt(((i + 1) / buyOrders.length) * 100) })
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

async function wait(ms) {
    return new Promise((resolve) => {
        timer = setTimeout(resolve, ms)
    })
}

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

function fetchUrl(url) {
    return new Promise(function (resolve, reject) {
        fetch(url)
            .then((response) => {
                if (response.ok) {
                    chrome.storage.local.set({ scanErrorSORS: false })
                    resolve(response.text())
                } else {
                    var error = new Error(response.statusText)
                    reject(error)
                }
            })
            .catch((error) => {
                reject(error)
            })
    })
}

async function fetchWithRetry(url, attempts = 5) {
    return await fetchUrl(url).catch(async function () {
        chrome.storage.local.set({ scanErrorSORS: true })

        if (attempts == 5) {
            await wait(5000)
            return fetchWithRetry(url, attempts - 1)
        } else if (attempts <= 0) {
            await wait(pauseOnErrors * 60000)
            return fetchWithRetry(url, 5)
        }
        await wait(10000)
        return fetchWithRetry(url, attempts - 1)
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

var getFromBetween = {
    results: [],
    string: '',
    getFromBetween: function (t, s) {
        if (this.string.indexOf(t) < 0 || this.string.indexOf(s) < 0) return !1
        var i = this.string.indexOf(t) + t.length,
            e = this.string.substr(0, i),
            n = this.string.substr(i),
            r = e.length + n.indexOf(s)
        return this.string.substring(i, r)
    },
    removeFromBetween: function (t, s) {
        if (this.string.indexOf(t) < 0 || this.string.indexOf(s) < 0) return !1
        var i = t + this.getFromBetween(t, s) + s
        this.string = this.string.replace(i, '')
    },
    getAllResults: function (t, s) {
        if (!(this.string.indexOf(t) < 0 || this.string.indexOf(s) < 0)) {
            var i = this.getFromBetween(t, s)
            this.results.push(i),
                this.removeFromBetween(t, s),
                this.string.indexOf(t) > -1 && this.string.indexOf(s) > -1 && this.getAllResults(t, s)
        }
    },
    get: function (t, s, i) {
        return (this.results = []), (this.string = t), this.getAllResults(s, i), this.results
    }
}

function CalculateAmountToSendForDesiredReceivedAmount(receivedAmount, publisherFee) {
    if (!g_rgWalletInfo['wallet_fee']) {
        return receivedAmount
    }
    publisherFee = typeof publisherFee == 'undefined' ? 0 : publisherFee
    var nSteamFee = parseInt(
        Math.floor(
            Math.max(
                receivedAmount * parseFloat(g_rgWalletInfo['wallet_fee_percent']),
                g_rgWalletInfo['wallet_fee_minimum']
            ) + parseInt(g_rgWalletInfo['wallet_fee_base'])
        )
    )
    var nPublisherFee = parseInt(Math.floor(publisherFee > 0 ? Math.max(receivedAmount * publisherFee, 1) : 0))
    var nAmountToSend = receivedAmount + nSteamFee + nPublisherFee
    return {
        steam_fee: nSteamFee,
        publisher_fee: nPublisherFee,
        fees: nSteamFee + nPublisherFee,
        amount: parseInt(nAmountToSend)
    }
}

function CalculateFeeAmount(amount, publisherFee) {
    if (!g_rgWalletInfo['wallet_fee']) return 0
    publisherFee = typeof publisherFee == 'undefined' ? 0 : publisherFee
    // Since CalculateFeeAmount has a Math.floor, we could be off a cent or two. Let's check:
    var iterations = 0 // shouldn't be needed, but included to be sure nothing unforseen causes us to get stuck
    var nEstimatedAmountOfWalletFundsReceivedByOtherParty = parseInt(
        (amount - parseInt(g_rgWalletInfo['wallet_fee_base'])) /
            (parseFloat(g_rgWalletInfo['wallet_fee_percent']) + parseFloat(publisherFee) + 1)
    )
    var bEverUndershot = false
    var fees = CalculateAmountToSendForDesiredReceivedAmount(
        nEstimatedAmountOfWalletFundsReceivedByOtherParty,
        publisherFee
    )
    while (fees.amount != amount && iterations < 10) {
        if (fees.amount > amount) {
            if (bEverUndershot) {
                fees = CalculateAmountToSendForDesiredReceivedAmount(
                    nEstimatedAmountOfWalletFundsReceivedByOtherParty - 1,
                    publisherFee
                )
                fees.steam_fee += amount - fees.amount
                fees.fees += amount - fees.amount
                fees.amount = amount
                break
            } else {
                nEstimatedAmountOfWalletFundsReceivedByOtherParty--
            }
        } else {
            bEverUndershot = true
            nEstimatedAmountOfWalletFundsReceivedByOtherParty++
        }
        fees = CalculateAmountToSendForDesiredReceivedAmount(
            nEstimatedAmountOfWalletFundsReceivedByOtherParty,
            publisherFee
        )
        iterations++
    }
    // fees.amount should equal the passed in amount
    return fees
}
