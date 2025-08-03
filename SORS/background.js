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

const params = {
    backgroundScanDelay: 30,
    cancelHighOrders: false,
    cancelHighPercent: 0,
    cancelFirstOrders: false,
    pauseOnErrors: 2,
    delayPerOrder: 200,
    delayRandom: 50
}

const scan = {
    g_rgWalletInfo: {},
    buyOrders: {},
    sessionId: '',
    prefix: '',
    suffix: '',
    table: [],
    stop: false
}

chrome.runtime.onInstalled.addListener(() => {
    const sett = {
        scanButtonSORS: 'start',
        scanErrorSORS: false,
        scanProgressSORS: 0,
        backgroundScanSORS: false,
        backgroundScanDelaySORS: 30,
        cancelHighOrdersSORS: false,
        cancelHighPercentSORS: 0,
        cancelFirstOrdersSORS: false,
        pauseOnErrorsSORS: 2,
        delayPerOrderSORS: 200,
        delayRandomSORS: 50,
        showMoreOrdersSORS: true,
        showMoreOrdersQtySORS: 20,

        scanEndTimeSORS: 'NOT YET COMPLETED',
        scanPrefSuffSORS: ['', ''],
        scanTableBadSORS: []
    }

    chrome.storage.local.get(Object.keys(sett), function (result) {
        for (const s in sett) {
            if (typeof result[s] == 'undefined') {
                chrome.storage.local.set({
                    [s]: sett[s]
                })
            }
        }
    })
    chrome.tabs.query({}, function (tabs) {
        for (const t of tabs) {
            if (t.url.includes('https://steamcommunity.com/')) {
                chrome.tabs.reload(t.id)
            }
        }
    })
})

chrome.storage.onChanged.addListener(function (changes, namespace) {
    // waiting for scanStart to be enabled
    if (namespace == 'local' && 'runAutoScanSORS' in changes) {
        if (changes.runAutoScanSORS.newValue == true) {
            getParamsAndStart()
        } else {
            chrome.storage.local.set({ scanProgressSORS: 0 })
            chrome.action.setIcon({ path: 'ico/16.png' })
            chrome.alarms.clearAll()
            scan.stop = true
        }
    }

    // send error
    if (namespace == 'local' && 'scanErrorSORS' in changes) {
        if (changes.scanErrorSORS.newValue == true) {
            chrome.action.setIcon({ path: 'ico/error.png' })
        } else {
            chrome.action.setIcon({ path: 'ico/16.png' })
        }
    }

    // real-time remapping of variables after changed settings
    if (namespace == 'local' && 'backgroundScanDelaySORS' in changes) {
        params.backgroundScanDelay = parseInt(changes.backgroundScanDelaySORS.newValue)
    }
    if (namespace == 'local' && 'cancelHighOrdersSORS' in changes) {
        params.cancelHighOrders = changes.cancelHighOrdersSORS.newValue
    }
    if (namespace == 'local' && 'cancelHighPercentSORS' in changes) {
        params.cancelHighPercent = parseInt(changes.cancelHighPercentSORS.newValue)
    }
    if (namespace == 'local' && 'cancelFirstOrdersSORS' in changes) {
        params.cancelFirstOrders = changes.cancelFirstOrdersSORS.newValue
    }
    if (namespace == 'local' && 'pauseOnErrorsSORS' in changes) {
        params.pauseOnErrors = parseInt(changes.pauseOnErrorsSORS.newValue)
    }
    if (namespace == 'local' && 'delayPerOrderSORS' in changes) {
        params.delayPerOrder = parseInt(changes.delayPerOrderSORS.newValue)
    }
    if (namespace == 'local' && 'delayRandomSORS' in changes) {
        params.delayRandom = parseInt(changes.delayRandomSORS.newValue)
    }
})

chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name == 'scanStart') {
        getParamsAndStart()
    }
    if (alarm.name.includes('scanOrder')) {
        let index = parseInt(alarm.name.split('_')[1])
        scanOrder(scan.buyOrders, index)
    }
})

chrome.storage.local.get('runAutoScanSORS', function (result) {
    if (result.runAutoScanSORS == true) {
        getParamsAndStart()
    }
})

function getParamsAndStart() {
    chrome.storage.local.get(
        [
            'backgroundScanDelaySORS',
            'cancelHighOrdersSORS',
            'cancelHighPercentSORS',
            'cancelFirstOrdersSORS',
            'pauseOnErrorsSORS',
            'delayPerOrderSORS',
            'delayRandomSORS'
        ],
        function (result) {
            params.backgroundScanDelay = parseInt(result.backgroundScanDelaySORS)
            params.cancelHighOrders = result.cancelHighOrdersSORS
            params.cancelHighPercent = parseInt(result.cancelHighPercentSORS)
            params.cancelFirstOrders = result.cancelFirstOrdersSORS
            params.pauseOnErrors = parseInt(result.pauseOnErrorsSORS)
            params.delayPerOrder = parseInt(result.delayPerOrderSORS)
            params.delayRandom = parseInt(result.delayRandomSORS)

            scanStart()
        }
    )
}

async function scanStart() {
    chrome.storage.local.set({ scanProgressSORS: 0 })
    chrome.action.setIcon({ path: 'ico/16.png' })

    scan.g_rgWalletInfo = {}
    scan.buyOrders = {}
    scan.sessionId = ''
    scan.prefix = ''
    scan.suffix = ''
    scan.table = []
    scan.stop = false

    let myListings = await httpGetRetry('https://steamcommunity.com/market/mylistings/?norender=1', 'json')
    if (myListings == undefined || myListings.success != true) {
        chrome.alarms.create('scanStart', { delayInMinutes: parseInt(params.pauseOnErrors) })
        return
    }

    scan.buyOrders = myListings.buy_orders
    if (scan.buyOrders.length > 0) scanOrder(scan.buyOrders, 0)
}

async function scanOrder(orders, index) {
    let stopScan = scan.stop
    if (stopScan) return

    chrome.storage.onChanged.addListener(listenForStop)

    let order = orders[index]
    let appId = order.appid
    let hashName = order.hash_name
    let orderId = order.buy_orderid
    let orderHref = `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(hashName)}`
    let orderPrice = parseInt(order.price)

    let sourceCode = await httpGetRetry(orderHref, 'text')
    if (sourceCode == undefined) {
        chrome.alarms.create(`scanOrder_${index}`, { delayInMinutes: parseInt(params.pauseOnErrors) })
        return
    }

    if (Object.keys(scan.g_rgWalletInfo).length === 0) {
        scan.g_rgWalletInfo = JSON.parse(getFromBetween.get(sourceCode, `g_rgWalletInfo = `, `;`)[0])
    }

    if (scan.prefix + scan.suffix == '') {
        scan.prefix = getFromBetween.get(sourceCode, `strFormatPrefix = "`, `"`)[0]
        scan.suffix = getFromBetween.get(sourceCode, `strFormatSuffix = "`, `"`)[0]
    }

    if (scan.sessionId == '') {
        scan.sessionId = getFromBetween.get(sourceCode, `g_sessionID = "`, `"`)[0]
    }

    let itemNameId = getFromBetween.get(sourceCode, 'Market_LoadOrderSpread( ', ' )')[0]
    let itemGraphLink = `https://steamcommunity.com/market/itemordershistogram?language=english&currency=${scan.g_rgWalletInfo.wallet_currency}&item_nameid=${itemNameId}`
    let itemGraph = await httpGetRetry(itemGraphLink, 'json')
    if (itemGraph == undefined || itemGraph.success != 1) {
        chrome.alarms.create(`scanOrder_${index}`, { delayInMinutes: parseInt(params.pauseOnErrors) })
        return
    }

    // for trFst
    let firstOrderPrice = parseInt(itemGraph.buy_order_graph[0][0] * 100)

    // for table
    if (sourceCode.includes('<div id="market_commodity_order_spread">')) {
        let avarageOfTwo =
            itemGraph.sell_order_graph
                .map((a) => a[0])
                .slice(0, 4)
                .reduce((a, b) => a + b) /
                4 -
            0.01
        marketPrice = avarageOfTwo < 0.16 ? (avarageOfTwo - 0.02) * 100 : Math.ceil((avarageOfTwo / 1.15) * 100)
    } else {
        //let tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', '</span>').map(s => s.replace(/[^\d^.^,]/g, '').replace(',', '.') * 100).filter(Number);
        //let tenPrices = itemGraph.sell_order_graph.map(a => a[0] * 100).slice(0, 10);
        let tenPrices = itemGraph.sell_order_graph.flatMap((a) => Array(parseInt(a[1])).fill(a[0] * 100)).slice(0, 10)
        let fivePrices = tenPrices.slice(Math.max(tenPrices.length - 5, 1))
        marketPrice = fivePrices.reduce((a, b) => a + b, 0) / fivePrices.length - 1
        marketPrice =
            marketPrice - CalculateFeeAmount(marketPrice, scan.g_rgWalletInfo.wallet_publisher_fee_percent_default).fees
    }

    if (orderPrice == firstOrderPrice) {
        if (params.cancelFirstOrders) {
            sendCancel(scan.sessionId, orderId)
        }
    }
    if ((marketPrice * (100 - params.cancelHighPercent)) / 100 < orderPrice) {
        let breakEvenPoint = CalculateAmountToSendForDesiredReceivedAmount(
            orderPrice,
            scan.g_rgWalletInfo.wallet_publisher_fee_percent_default
        ).amount
        let marketPriceWithFee = CalculateAmountToSendForDesiredReceivedAmount(
            marketPrice,
            scan.g_rgWalletInfo.wallet_publisher_fee_percent_default
        ).amount
        let tdOrder = (orderPrice / 100).toFixed(2)
        let tdOrderBEP = (breakEvenPoint / 100).toFixed(2)
        let tdMarket = (marketPrice / 100).toFixed(2)
        let tdMarketWithFee = (marketPriceWithFee / 100).toFixed(2)
        let td1st = orderPrice == firstOrderPrice

        // add to bad orders array
        scan.table.push([appId, hashName, tdOrder, tdOrderBEP, tdMarket, tdMarketWithFee, td1st])

        if (params.cancelHighOrders) {
            sendCancel(scan.sessionId, orderId)
        }
    }

    if (stopScan) return

    // scan next order after delay if not last
    if (index < orders.length - 1) {
        let delay = random(params.delayPerOrder, params.delayPerOrder + params.delayRandom)
        chrome.alarms.create(`scanOrder_${index + 1}`, { when: Date.now() + delay })
    } else {
        chrome.storage.local.set({
            scanEndTimeSORS: new Date().toLocaleString(),
            scanPrefSuffSORS: [scan.prefix, scan.suffix],
            scanTableBadSORS: scan.table
        })
        chrome.alarms.create('scanStart', { delayInMinutes: parseInt(params.backgroundScanDelay) })
    }

    chrome.storage.local.set({ scanProgressSORS: parseInt(((index + 1) / orders.length) * 100) })

    // listen for stop
    chrome.storage.onChanged.removeListener(listenForStop)
    function listenForStop(changes, namespace) {
        if (namespace == 'local' && 'runAutoScanSORS' in changes) {
            if (changes.runAutoScanSORS.newValue == false) {
                stopScan = true
                chrome.storage.onChanged.removeListener(listenForStop)
            }
        }
    }
}

// ------------------------ //
// --- other functions --- //
// ------------------------ //

function random(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min)
}

async function httpGetRetry(url, type, attempts = 3) {
    // type is "json" or "text"
    let result
    while (attempts > 0) {
        try {
            let response = await fetch(url)
            if (response.status >= 200 && response.status < 300) {
                if (type == 'text') result = await response.text()
                if (type == 'json') result = await response.json()
                if (type == 'text' && !result.includes('searchResultsRows')) {
                    attempts--
                    result = undefined
                    chrome.action.setIcon({ path: 'ico/error.png' })
                    console.log(`Order scan error: ${url}`)
                    continue
                }
                chrome.action.setIcon({ path: 'ico/16.png' })
                break
            } else {
                attempts--
                result = undefined
                chrome.action.setIcon({ path: 'ico/error.png' })
                console.log(`Order scan error: ${url}`)
            }
        } catch {
            attempts--
            result = undefined
            chrome.action.setIcon({ path: 'ico/error.png' })
            console.log(`Order scan error: ${url}`)
        }
    }
    return result
}

function sendCancel(sid, oid) {
    chrome.tabs.query({ url: '*://steamcommunity.com/*' }, function (tabs) {
        if (tabs.length > 0) {
            if (tabs[0].status == 'complete') {
                sendRemoveMsg(tabs[0].id)
            } else {
                chrome.tabs.onUpdated.addListener(listenForCreate)
                chrome.tabs.onRemoved.addListener(function listenForRemove(tabId) {
                    if (tabId == tabs[0].id) {
                        chrome.tabs.onUpdated.removeListener(listenForCreate)
                        chrome.tabs.onRemoved.removeListener(listenForRemove)
                    }
                })

                function listenForCreate(tabId, info) {
                    if (info.status === 'complete' && tabId === tabs[0].id) {
                        chrome.tabs.onUpdated.removeListener(listenForCreate)
                        sendRemoveMsg(tabs[0].id)
                    }
                }
            }
        } else {
            chrome.tabs.create(
                {
                    url: 'https://steamcommunity.com/market/',
                    active: false
                },
                function (tab) {
                    chrome.tabs.onUpdated.addListener(listenForCreate)
                    chrome.tabs.onRemoved.addListener(function listenForRemove(tabId) {
                        if (tabId == tab.id) {
                            chrome.tabs.onUpdated.removeListener(listenForCreate)
                            chrome.tabs.onRemoved.removeListener(listenForRemove)
                        }
                    })

                    function listenForCreate(tabId, info) {
                        if (info.status === 'complete' && tabId === tab.id) {
                            chrome.tabs.onUpdated.removeListener(listenForCreate)
                            sendRemoveMsg(tab.id)
                        }
                    }
                }
            )
        }
    })

    function sendRemoveMsg(tab_id) {
        chrome.tabs.sendMessage(tab_id, {
            cancelRequestSORS: `sessionid=${sid}&buy_orderid=${oid}`
        })
    }
    /*,function(response){console.log(response.cancelResponseSORS);}*/
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
    if (!scan.g_rgWalletInfo['wallet_fee']) {
        return receivedAmount
    }
    publisherFee = typeof publisherFee == 'undefined' ? 0 : publisherFee
    var nSteamFee = parseInt(
        Math.floor(
            Math.max(
                receivedAmount * parseFloat(scan.g_rgWalletInfo['wallet_fee_percent']),
                scan.g_rgWalletInfo['wallet_fee_minimum']
            ) + parseInt(scan.g_rgWalletInfo['wallet_fee_base'])
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
    if (!scan.g_rgWalletInfo['wallet_fee']) return 0
    publisherFee = typeof publisherFee == 'undefined' ? 0 : publisherFee
    // Since CalculateFeeAmount has a Math.floor, we could be off a cent or two. Let's check:
    var iterations = 0 // shouldn't be needed, but included to be sure nothing unforseen causes us to get stuck
    var nEstimatedAmountOfWalletFundsReceivedByOtherParty = parseInt(
        (amount - parseInt(scan.g_rgWalletInfo['wallet_fee_base'])) /
            (parseFloat(scan.g_rgWalletInfo['wallet_fee_percent']) + parseFloat(publisherFee) + 1)
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
