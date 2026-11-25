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
    const accountMarket = SORSAccountMarketData
    const priceRetryDelays = [5000, 10000, 10000, 10000, 10000]
    const maxQuoteAge = 15000
    const cancelTimeout = 30000
    const reportBatchSize = 25
    const settingNames = [
        'cancelHighOrdersSORS',
        'cancelHighPercentSORS',
        'cancelFirstOrdersSORS',
        'pauseOnErrorsSORS',
        'delayPerOrderSORS',
        'delayRandomSORS'
    ]
    let activeRun
    let settings
    let signal
    let status

    chrome.runtime.onMessage.addListener(({ type, runId }, _sender, reply) => {
        if (type === 'sors-run-status') {
            reply({ active: activeRun?.runId === runId })
        } else if (type === 'sors-run-stop') {
            if (activeRun?.runId !== runId) {
                reply({ ok: false })
                return
            }
            stopScan()
            reply({ ok: true })
        } else if (type === 'sors-run-start') {
            if (activeRun || !buyOrdersPage.test(location.pathname)) {
                reply({ ok: false, error: 'The scan needs an idle Steam Buy Orders page.' })
                return
            }
            const controller = new AbortController()
            activeRun = { runId, controller }
            signal = controller.signal
            reply({ ok: true })
            void startScan(runId)
        }
    })

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local' || !settings) return
        for (const name of settingNames) {
            if (name in changes) settings[name] = changes[name].newValue
        }
    })

    window.addEventListener('pagehide', stopScan)
    window.navigation?.addEventListener('navigatesuccess', () => {
        if (!buyOrdersPage.test(location.pathname)) stopScan()
    })

    function stopScan() {
        if (!activeRun || signal.aborted || ['completed', 'stopped', 'error'].includes(status?.phase)) return
        activeRun.controller.abort()
        if (status) {
            void publish({ phase: 'stopping', retryAt: null, error: null }).catch(console.error)
        }
    }

    async function publish(change, report = {}) {
        status = { ...status, ...change }
        const reply = await chrome.runtime.sendMessage({
            type: 'sors-run-update', updates: { scanStatusSORS: status, ...report }
        })
        if (!reply?.ok) throw new Error(reply?.error ?? 'The scan update could not be saved.')
    }

    async function startScan(runId) {
        let phase = 'completed'
        let message = null
        let completedReport

        try {
            settings = await chrome.storage.local.get([...settingNames, 'scanStatusSORS'])
            if (settings.scanStatusSORS?.runId !== runId) throw new Error('Scan state is unavailable.')
            status = settings.scanStatusSORS
            signal.throwIfAborted()
            completedReport = await scanOrders()
            signal.throwIfAborted()
        } catch (error) {
            phase = signal.aborted ? 'stopped' : 'error'
            if (phase === 'error') {
                message = error?.message ?? String(error)
                console.error('Steam Order Scanner: scan failed', error)
            }
        } finally {
            try {
                if (status) {
                    const finishedAt = Date.now()
                    await publish({ phase, error: message, retryAt: null, finishedAt,
                        ...(phase === 'completed' ? { itemName: null } : {}) }, {
                        scanErrorSORS: phase === 'error' || hasIssues(),
                        ...(phase === 'completed' ? {
                            scanProgressSORS: 100,
                            scanEndTimeSORS: new Date(finishedAt).toLocaleString(),
                            scanLastCompletedSORS: { ...completedReport, runId, finishedAt },
                            ...(completedReport.rows.length % reportBatchSize ? {
                                scanTableBadSORS: completedReport.rows, scanTableTailSORS: []
                            } : {})
                        } : {})
                    })
                }
            } catch (error) {
                console.error('Steam Order Scanner: could not save the scan', error)
            } finally {
                activeRun = settings = signal = status = undefined
                void chrome.runtime.sendMessage({ type: 'sors-run-finished', runId, error: message }).catch(() => {})
            }
        }
    }

    function hasIssues() {
        return !!(status.skipped || status.withoutSalePrice || status.failedCancellations)
    }

    function recordIssue(category, itemName, error) {
        const description = error?.message ?? String(error)
        const issue = `${itemName}: ${description}`
        status = {
            ...status,
            [category]: status[category] + 1,
            recentIssues: [...status.recentIssues.slice(-4), issue]
        }
        console.warn(`Steam Order Scanner: ${category}: ${issue}`)
    }

    async function scanOrders() {
        const { orders, wallet } = await accountMarket.getBuyOrders(signal)
        signal.throwIfAborted()
        if (orders.length && !wallet) throw new Error('Steam wallet settings could not be loaded.')

        const table = []
        const format = wallet ? getCurrencyPrefixSuffix(wallet.wallet_currency) : ['', '']
        await publish({ phase: 'scanning', total: orders.length }, { scanPrefSuffSORS: format })
        console.log(`Steam Order Scanner: scanning ${orders.length} buy orders.`)

        for (const [i, order] of orders.entries()) {
            signal.throwIfAborted()
            await publish({ phase: 'scanning', itemName: order.hash_name, retryAt: null, error: null })
            let result
            try {
                result = await inspectOrder(order, wallet)
            } catch (error) {
                signal.throwIfAborted()
                recordIssue('skipped', order.hash_name, error)
            }

            signal.throwIfAborted()
            const report = {}
            if (result?.saleError) recordIssue('withoutSalePrice', order.hash_name, result.saleError)
            if (result?.reportRow) {
                table.push(result.reportRow)
                const tailSize = table.length % reportBatchSize
                report.scanTableTailSORS = tailSize ? table.slice(-tailSize) : []
                if (!tailSize) report.scanTableBadSORS = table
            }

            await publish({ checked: i + 1, phase: 'scanning', retryAt: null, error: null }, {
                ...report,
                scanErrorSORS: hasIssues(),
                scanProgressSORS: ((i + 1) / orders.length) * 100
            })

            if (i + 1 < orders.length) {
                const delay = Number(settings.delayPerOrderSORS)
                const randomExtra = delay * Number(settings.delayRandomSORS) / 100
                await wait(delay + Math.floor(Math.random() * (randomExtra + 1)))
            }
        }

        return { rows: table, currencyAffixes: format }
    }

    async function retryPriceRead(load, { repeat = false } = {}) {
        for (let attempt = 0; ; attempt++) {
            signal.throwIfAborted()
            let value
            try {
                value = await load()
            } catch (error) {
                signal.throwIfAborted()
                const status = error?.status
                if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
                    throw error
                }
                if (!repeat && attempt > priceRetryDelays.length) throw error

                const pause = Math.max(0, Number(settings.pauseOnErrorsSORS) || 0) * 60000
                const delay = priceRetryDelays[attempt % (priceRetryDelays.length + 1)] ?? pause
                await publish({ phase: 'retrying', retryAt: Date.now() + delay, error: error?.message ?? String(error) }, {
                    scanErrorSORS: true
                })
                await wait(delay)
                continue
            }
            signal.throwIfAborted()
            if (status.phase === 'retrying') await publish({ phase: 'scanning', retryAt: null, error: null })
            return value
        }
    }

    async function inspectOrder(order, wallet) {
        const { appid: appId, hash_name: itemName, wallet_currency: currency } = order
        if (currency !== wallet.wallet_currency) {
            throw new Error(`Order currency is ${currency}; wallet currency is ${wallet.wallet_currency}.`)
        }

        const itemHref = SORSItemPrices.getListingUrl(order)
        let quote = await retryPriceRead(() => fetchItemPage(itemHref, signal), { repeat: true })
        let prices, fees, feeError

        async function readQuote(getFees) {
            prices = SORSItemPrices.readItemPage(quote.source, order)
            if (!prices.saleError && !fees && !feeError) {
                try {
                    fees = await getFees()
                } catch (error) {
                    signal.throwIfAborted()
                    feeError = error
                }
            }
            return evaluateOrder(order, prices, fees, feeError)
        }

        let result = await readQuote(() => retryPriceRead(() => accountMarket.getFeeCalculator(appId, wallet, signal)))
        // Prices can expire during a fee lookup or while saving the cancellation intent.
        for (let pass = 0; pass < 2; pass++) {
            if (pass) {
                try {
                    result = await withDeadline(maxQuoteAge, 'The fresh item page timed out.', async (requestSignal) => {
                        quote = await fetchItemPage(itemHref, requestSignal)
                        requestSignal.throwIfAborted()
                        return readQuote(() => accountMarket.getFeeCalculator(appId, wallet, requestSignal))
                    })
                } catch (error) {
                    signal.throwIfAborted()
                    throw new Error(`Could not verify prices before cancellation: ${error.message ?? error}`)
                }
            }
            if (!shouldCancel(result)) return result
            if (Date.now() - quote.startedAt >= maxQuoteAge) continue
            try {
                await publish({ pendingCancellation: { orderId: order.buy_orderid, itemName } })
                signal.throwIfAborted()
                // Settings can change while the intent is being saved.
                result = evaluateOrder(order, prices, fees, feeError)
                if (!shouldCancel(result)) return result
                if (Date.now() - quote.startedAt >= maxQuoteAge) continue
                await cancelOnce(order)
                return result
            } finally {
                await publish({ pendingCancellation: null })
            }
        }
        throw new Error('The verified prices expired before cancellation could be sent.')
    }

    function shouldCancel({ first, firstConfirmed, unprofitable }) {
        return (first && firstConfirmed && settings.cancelFirstOrdersSORS) ||
            (unprofitable && settings.cancelHighOrdersSORS)
    }

    async function cancelOnce(order) {
        try {
            await withDeadline(cancelTimeout, 'Steam did not confirm the cancellation within 30 seconds.',
                (requestSignal) => accountMarket.cancelBuyOrder(order.buy_orderid, requestSignal))
            status = { ...status, canceled: status.canceled + 1 }
        } catch (error) {
            recordIssue('failedCancellations', order.hash_name, signal.aborted
                ? 'Steam did not confirm the cancellation before scanning stopped.'
                : error)
        }
    }

    function evaluateOrder(order, prices, fees, feeError) {
        const { appid: appId, hash_name: itemName, price: bid } = order
        const first = bid === prices.firstBid
        let saleError = prices.saleError ?? feeError
        let net
        if (!saleError) {
            try {
                const { marketGross } = prices
                // At Steam's minimum, use the estimate itself rather than an invalid undercut.
                net = fees.sellProceedsFrom(marketGross - 1) || fees.sellProceedsFrom(marketGross)
                if (!Number.isFinite(net) || net <= 0) saleError = new Error('Estimated sale price gives no proceeds after fees.')
            } catch (error) {
                saleError = error
            }
        }
        const unprofitable = saleError ? null : net * (100 - Number(settings.cancelHighPercentSORS)) / 100 < bid
        let reportRow
        if (first || unprofitable) {
            const amount = (value) => (value / 100).toFixed(2)
            reportRow = [appId, itemName, amount(bid), fees ? amount(fees.buyPriceFor(bid)) : null,
                saleError ? null : amount(net), saleError ? null : amount(fees.buyPriceFor(net)), first]
            const variant = prices.getReportVariant()
            if (variant) reportRow.push(variant)
        }
        return { first, firstConfirmed: prices.firstConfirmed, unprofitable, reportRow, saleError }
    }

    async function withDeadline(ms, message, request) {
        signal.throwIfAborted()
        const controller = new AbortController()
        const abort = () => controller.abort(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        const timer = setTimeout(() => controller.abort(new Error(message)), ms)
        try {
            return await new Promise((resolve, reject) => {
                controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
                Promise.resolve(request(controller.signal)).then(resolve, reject)
            })
        } finally {
            clearTimeout(timer)
            signal.removeEventListener('abort', abort)
        }
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

    async function fetchItemPage(url, requestSignal) {
        const startedAt = Date.now()
        const response = await fetch(url, { signal: requestSignal, cache: 'no-store' })
        if (!response.ok) {
            throw Object.assign(new Error(`Steam request failed (${response.status}): ${url.pathname}`), { status: response.status })
        }
        return { source: await response.text(), startedAt }
    }
})()
