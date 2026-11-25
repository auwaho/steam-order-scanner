var SORSAccountMarketData = (() => {
    const actionPath = '/market/actions'
    const fees = new Map()
    let walletRequest

    async function queryAction(path, action, args, signal) {
        const url = new URL(path, location.origin)
        url.searchParams.set('q', action)
        url.searchParams.set('qp', JSON.stringify(args))
        const response = await fetch(url, {
            headers: { 'x-valve-request-type': 'queryAction' },
            redirect: 'error',
            cache: 'no-store',
            signal
        })
        if (!response.ok) {
            throw Object.assign(new Error(`Steam request failed (${response.status}): ${action}`), { status: response.status })
        }
        return (await response.json()).data
    }

    async function getBuyOrders(signal) {
        const response = await fetch('/market/mylistings/?norender=1', {
            redirect: 'error',
            cache: 'no-store',
            signal
        })
        if (!response.ok) {
            throw Object.assign(new Error(`Steam request failed (${response.status}): buy orders`), { status: response.status })
        }
        const data = await response.json()
        if ((data?.success !== true && data?.success !== 1) || !Array.isArray(data.buy_orders)) {
            throw new Error('Steam did not return your buy orders. Make sure you are signed in.')
        }

        const orders = new Map()
        for (const source of data.buy_orders) {
            const order = {
                ...source,
                appid: Number(source?.appid),
                price: Number(source?.price),
                wallet_currency: Number(source?.wallet_currency),
                quantity: Number(source?.quantity),
                quantity_remaining: Number(source?.quantity_remaining)
            }
            if (
                typeof order.buy_orderid !== 'string' || !/^\d+$/.test(order.buy_orderid) ||
                orders.has(order.buy_orderid) || !Number.isSafeInteger(order.appid) || order.appid <= 0 ||
                typeof order.hash_name !== 'string' || !order.hash_name ||
                !Number.isSafeInteger(order.price) || order.price <= 0 ||
                !Number.isSafeInteger(order.wallet_currency) || order.wallet_currency <= 0 ||
                !Number.isSafeInteger(order.quantity) || !Number.isSafeInteger(order.quantity_remaining) ||
                order.quantity_remaining < 1 || order.quantity_remaining > order.quantity
            ) {
                throw new Error('Steam returned incomplete or duplicate buy orders.')
            }
            if (source.description && typeof source.description === 'object' && !Array.isArray(source.description)) {
                order.description = { ...source.description }
                const commodity = source.description.commodity
                if (commodity === true || commodity === 1 || commodity === '1') order.description.commodity = true
                else if (commodity === false || commodity === 0 || commodity === '0') order.description.commodity = false
                else delete order.description.commodity
            } else {
                delete order.description
            }
            orders.set(order.buy_orderid, order)
        }

        const result = [...orders.values()]
        signal?.throwIfAborted()
        const wallet = result.length ? await waitForRead(getMarketWallet(), signal) : null
        signal?.throwIfAborted()
        return { orders: result, total: result.length, wallet }
    }

    function getMarketWallet() {
        // Steam uses this endpoint for price rounding. Keep only the fields needed for calculations.
        return walletRequest ??= fetch('/market/userbillinginfo', { cache: 'no-store', redirect: 'error' })
            .then(async (response) => {
                const wallet = response.ok ? (await response.json()).wallet_info : null
                const currency = Number(wallet?.wallet_currency)
                const floor = Number(wallet?.wallet_market_minimum) || 1
                const increment = Number(wallet?.wallet_currency_increment) || 1
                if (![currency, floor, increment].every((value) => Number.isSafeInteger(value) && value > 0)) {
                    throw new Error('Steam wallet settings unavailable')
                }
                return { wallet_currency: currency, floor, increment }
            })
            .catch(() => null)
            .finally(() => {
                // Coalesce concurrent readers, then refresh the account context on the next read.
                walletRequest = undefined
            })
    }

    function waitForRead(request, signal) {
        if (!signal) return request
        return new Promise((resolve, reject) => {
            function abort() {
                reject(signal.reason)
            }
            if (signal.aborted) abort()
            else signal.addEventListener('abort', abort, { once: true })
            request.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
        })
    }

    function getFeeCalculator(appId, wallet, signal) {
        signal?.throwIfAborted()
        const { wallet_currency: currency, floor, increment } = wallet
        const key = `${appId}:${currency}:${floor}:${increment}`
        if (!fees.has(key)) {
            const request = queryAction(actionPath, 'QueryFeeStructure', [appId, currency])
                .then((structure) => {
                    const feeTypes = [structure?.steam_fee, structure?.publisher_fee].map((fee) => {
                        const rate = fee?.fee_rate
                        const cap = Number(fee?.fee_cap ?? 0)
                        if (fee?.ecurrency !== currency || !Number.isFinite(rate) || rate < 0 ||
                            !Number.isSafeInteger(cap) || cap < 0) {
                            throw new Error('Steam returned invalid market fees.')
                        }
                        return { rate, cap }
                    })

                    function normalize(amount, round) {
                        return amount <= floor ? floor : Math.max(increment, round(amount / increment) * increment)
                    }

                    function buyPriceFor(net) {
                        if (net <= 0) return 0
                        const base = normalize(net, Math.ceil)
                        return feeTypes.reduce((total, { rate, cap }) => {
                            if (rate <= 0.00001) return total
                            const fee = normalize(Math.trunc(base * rate), Math.round)
                            return total + (cap ? Math.min(cap, fee) : fee)
                        }, base)
                    }

                    function sellProceedsFrom(gross) {
                        // Find the highest valid seller price that still fits the buyer's price.
                        if (buyPriceFor(floor) > gross) return 0
                        let result = floor
                        let low = Math.floor(floor / increment) + 1
                        let high = Math.floor(gross / increment)
                        while (low <= high) {
                            const mid = Math.floor((low + high) / 2)
                            const price = mid * increment
                            if (buyPriceFor(price) <= gross) {
                                result = price
                                low = mid + 1
                            } else {
                                high = mid - 1
                            }
                        }
                        return result
                    }

                    return { buyPriceFor, sellProceedsFrom }
                })
                .catch((error) => {
                    fees.delete(key)
                    throw error
                })
            fees.set(key, request)
        }
        return waitForRead(fees.get(key), signal)
    }

    async function cancelBuyOrder(id, signal) {
        signal?.throwIfAborted()
        const response = await fetch(actionPath, {
            method: 'POST',
            redirect: 'error',
            signal,
            headers: {
                'x-valve-request-type': 'mutationAction',
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({ m: 'CancelBuyOrder', mp: [id] })
        })
        if (!response.ok) throw new Error(`Steam could not cancel the buy order (HTTP ${response.status}).`)
        const { data } = await response.json()
        if (data !== 1 && data !== '1') {
            const code = Number.isInteger(data) ? ` (result ${data})` : ''
            throw new Error(`Steam could not cancel the buy order${code}.`)
        }
    }

    return { queryAction, getBuyOrders, getFeeCalculator, cancelBuyOrder }
})()
