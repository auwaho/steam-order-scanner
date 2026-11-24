const SORSAccountMarket = (() => {
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
        if (!response.ok) throw new Error(`Steam request failed (${response.status})`)
        return (await response.json()).data
    }

    async function getBuyOrders(signal) {
        const orders = new Map()
        let total

        // Match the offsets used by Steam's infinite list.
        for (let start = 0, count = 50; ; start += count, count = 25) {
            const page = await queryAction(actionPath, 'QueryMyBuyOrders', [start, count, true], signal)
            if (page?.eResult !== 1 || !Array.isArray(page.rgBuyOrders)) {
                throw new Error('Steam did not return your buy orders. Make sure you are signed in.')
            }

            total ??= page.cTotalBuyOrders
            if (!Number.isSafeInteger(total) || total < 0 || total !== page.cTotalBuyOrders) {
                throw new Error('Steam buy order count changed while loading.')
            }

            for (const { order, description } of page.rgBuyOrders) {
                const quantity = Number(order?.quantity)
                const remaining = Number(order?.quantity_remaining)
                if (
                    typeof order?.buy_orderid !== 'string' || !/^\d+$/.test(order.buy_orderid) ||
                    orders.has(order.buy_orderid) || !Number.isSafeInteger(order.appid) || order.appid <= 0 ||
                    typeof order.hash_name !== 'string' || !order.hash_name ||
                    !Number.isSafeInteger(order.price) || order.price <= 0 ||
                    !Number.isSafeInteger(order.wallet_currency) || order.wallet_currency <= 0 ||
                    !Number.isSafeInteger(quantity) || !Number.isSafeInteger(remaining) || remaining < 1 || remaining > quantity
                ) {
                    throw new Error('Steam returned incomplete or duplicate buy orders.')
                }
                orders.set(order.buy_orderid, { ...order, description })
            }

            if (orders.size === total || !page.bMore || !page.rgBuyOrders.length || orders.size > total) break
        }

        if (orders.size !== total) throw new Error('Steam returned only part of your buy orders.')
        const result = [...orders.values()]
        const wallet = result.length ? await getMarketWallet() : null
        return { orders: result, total, wallet }
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
            .catch(() => {
                walletRequest = undefined
                return null
            })
    }

    function getFeeCalculator(appId, wallet) {
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
        return fees.get(key)
    }

    async function cancelBuyOrder(id) {
        const response = await fetch(actionPath, {
            method: 'POST',
            redirect: 'error',
            headers: {
                'x-valve-request-type': 'mutationAction',
                'Content-Type': 'application/json; charset=utf-8'
            },
            body: JSON.stringify({ m: 'CancelBuyOrder', mp: [id] })
        })
        if (!response.ok || (await response.json()).data !== 1) {
            throw new Error('Steam could not cancel the buy order.')
        }
    }

    function mountSummary(id, text) {
        const nav = document.querySelector('#CommunityTemplate a[href="buyorders"]')?.parentElement
        if (!nav?.querySelector('a[href="activelistings"]')) return

        let summary = document.getElementById(id)
        if (!summary) {
            summary = document.createElement('div')
            summary.id = id
            summary.setAttribute('role', 'status')
            summary.style.cssText = 'margin: 8px 0 12px; font-size: 14px;'
            nav.after(summary)
        }
        if (summary.textContent !== text) summary.textContent = text
    }

    return { queryAction, getBuyOrders, getFeeCalculator, cancelBuyOrder, mountSummary }
})()
