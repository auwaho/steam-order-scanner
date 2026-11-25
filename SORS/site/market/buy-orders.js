/* Buy-order rows and enhancements for Steam's account market page. */

var SORSBuyOrders = (() => {
    'use strict'

    const gridColumn = '--grid-column'
    const enhancement = 'data-sors-buy-enhancement'
    const breakEvenSelector = `[${enhancement}="breakeven"]`
    const priceTarget = 'data-sors-buy-price'
    const panelId = 'sors-scan-panel'
    let tooltipId = 0

    function getColumn(element) {
        return element.style.getPropertyValue(gridColumn).trim()
    }

    function getRowTarget(nameCell) {
        const link = nameCell.querySelector('a[href*="/market/listings/"]')
        if (!link) return null

        try {
            const url = new URL(link.href)
            const match = url.pathname.match(/^\/market\/listings\/(\d+)\/([^/]+)\/?$/)
            if (url.origin !== location.origin || !match) return null
            return JSON.stringify([Number(match[1]), decodeURIComponent(match[2])])
        } catch {
            return null
        }
    }

    function getOrderTarget(order) {
        // Steam links buy rows to the group when one exists.
        const item = order.description?.market_bucket_group_id || order.description?.market_hash_name || order.hash_name
        return JSON.stringify([Number(order.appid), item])
    }

    function getCellValue(cell) {
        // At narrow widths Steam adds a label before the value.
        return [...cell.children].findLast((element) => element.tagName === 'SPAN' && !element.hasAttribute(enhancement))
    }

    function getCellText(cell) {
        return getCellValue(cell)?.textContent.trim() ?? ''
    }

    function readBidInCents(bid) {
        const match = getCellText(bid).match(/\d(?:[\d.,\s'’]*\d)?/)
        if (!match) return NaN

        const digits = match[0].replace(/[\s'’]/g, '')
        const decimal = digits.match(/[.,](\d{1,2})$/)
        const whole = decimal ? digits.slice(0, decimal.index) : digits
        return Number(whole.replace(/\D/g, '')) * 100 + Number((decimal?.[1] ?? '').padEnd(2, '0'))
    }

    function matchesQuantity(quantity, order) {
        const text = getCellText(quantity).match(/^([\d.,\s]+)\s*\/\s*([\d.,\s]+)$/)
        if (!text) return false

        const purchased = Number(text[1].replace(/\D/g, ''))
        const original = Number(text[2].replace(/\D/g, ''))
        return original === Number(order.quantity) && purchased === original - Number(order.quantity_remaining)
    }

    function getOrderRowCells(row) {
        const cells = new Map([...row.children].map((cell) => [getColumn(cell), cell]))
        const name = cells.get('nameblock')
        const bid = cells.get('bid')
        const quantity = cells.get('quantity')
        if (name && bid && quantity) return { name, bid, quantity }
    }

    function getOrderRows(orders) {
        const byItem = new Map()
        for (const order of orders) {
            const key = getOrderTarget(order)
            if (!byItem.has(key)) byItem.set(key, [])
            byItem.get(key).push(order)
        }

        const rows = new Map()
        for (const name of document.querySelectorAll('[style*="--grid-column"][style*="nameblock"]')) {
            if (getColumn(name) !== 'nameblock') continue
            const row = name.parentElement
            if (!row?.getClientRects().length) continue
            const cells = getOrderRowCells(row)
            if (!cells) continue
            const { bid, quantity } = cells

            const itemOrders = byItem.get(getRowTarget(name)) ?? []
            const price = readBidInCents(bid)
            const matching = itemOrders.filter((order) => {
                return Number(order.price) === price && matchesQuantity(quantity, order)
            })
            const [order] = matching
            if (!order || matching.some((candidate) =>
                candidate.appid !== order.appid || candidate.wallet_currency !== order.wallet_currency ||
                candidate.price !== order.price)) continue
            // Price annotations are shared when every candidate has the same fee and currency inputs.
            rows.set(row, order)
        }
        return rows
    }

    function setBreakEvenPrice(nativePrice, text) {
        let annotation = nativePrice.parentElement.querySelector(`:scope > span${breakEvenSelector}`)
        if (!annotation) {
            annotation = document.createElement('span')
            annotation.className = nativePrice.className
            annotation.setAttribute(enhancement, 'breakeven')
            const amount = document.createElement('span')
            annotation.append('(', amount, ')')
            nativePrice.after(annotation)
        }
        const amount = annotation.firstElementChild
        if (amount.textContent !== text) amount.textContent = text
        return annotation
    }

    function addPriceTooltip(amount, explanation) {
        amount.setAttribute(priceTarget, '')
        const tooltip = document.createElement('span')
        if (!tooltip.showPopover) {
            const originalTitle = amount.getAttribute('title')
            amount.title = explanation
            return () => {
                amount.removeAttribute(priceTarget)
                if (originalTitle === null) amount.removeAttribute('title')
                else amount.title = originalTitle
            }
        }

        tooltip.id = `sors-price-tooltip-${++tooltipId}`
        tooltip.className = 'sors-price-tooltip'
        tooltip.setAttribute(enhancement, 'tooltip')
        tooltip.setAttribute('popover', 'manual')
        tooltip.setAttribute('role', 'tooltip')
        tooltip.textContent = explanation
        const originalDescription = amount.getAttribute('aria-describedby')
        const description = [originalDescription, tooltip.id].filter(Boolean).join(' ')
        const addedTabStop = !amount.hasAttribute('tabindex')
        if (addedTabStop) amount.tabIndex = 0
        amount.setAttribute('aria-describedby', description)
        amount.parentElement.appendChild(tooltip)

        let timer

        function show() {
            if (timer !== undefined || tooltip.matches(':popover-open')) return
            timer = setTimeout(() => {
                timer = undefined
                if (!amount.isConnected) return
                tooltip.showPopover()

                const gap = 8
                const target = amount.getBoundingClientRect()
                const box = tooltip.getBoundingClientRect()
                const maxX = Math.max(gap, window.innerWidth - box.width - gap)
                const maxY = Math.max(gap, window.innerHeight - box.height - gap)
                const right = target.right + gap
                const left = right <= maxX ? right : target.left - gap - box.width
                const top = target.top + (target.height - box.height) / 2
                tooltip.style.left = `${Math.min(maxX, Math.max(gap, left))}px`
                tooltip.style.top = `${Math.min(maxY, Math.max(gap, top))}px`
            }, 300)
        }

        function hide() {
            clearTimeout(timer)
            timer = undefined
            if (tooltip.matches(':popover-open')) tooltip.hidePopover()
        }

        const controller = new AbortController()
        const options = { signal: controller.signal }
        amount.addEventListener('mouseenter', show, options)
        amount.addEventListener('mouseleave', hide, options)
        amount.addEventListener('focus', show, options)
        amount.addEventListener('blur', hide, options)
        amount.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') hide()
        }, options)

        return () => {
            controller.abort()
            hide()
            tooltip.remove()
            amount.removeAttribute(priceTarget)
            if (addedTabStop && amount.tabIndex === 0) amount.removeAttribute('tabindex')
            if (amount.getAttribute('aria-describedby') === description) {
                if (originalDescription === null) amount.removeAttribute('aria-describedby')
                else amount.setAttribute('aria-describedby', originalDescription)
            }
        }
    }

    function render({ orders, wallet }, getFees, syncPriceTooltips) {
        const retained = new Set()
        const priceTargets = new Map()
        for (const [row, order] of getOrderRows(orders)) {
            const currency = Number(order.wallet_currency)
            const price = Number(order.price)
            const bid = [...row.children].find((cell) => getColumn(cell) === 'bid')
            const nativePrice = bid && getCellValue(bid)
            if (!nativePrice) continue
            priceTargets.set(nativePrice, 'This is the price you will pay.')
            if (Number(wallet?.wallet_currency) !== currency) continue
            const breakeven = getFees(order.appid, wallet)?.buyPriceFor(price)
            if (Number.isSafeInteger(breakeven)) {
                const annotation = setBreakEvenPrice(nativePrice, formatSteamMoney(breakeven, currency))
                retained.add(annotation)
                priceTargets.set(annotation.firstElementChild, 'Sell at this price to break even after fees.')
            }
        }

        document.querySelectorAll(breakEvenSelector).forEach((element) => {
            if (!retained.has(element)) element.remove()
        })
        syncPriceTooltips(priceTargets)
    }

    function refresh() {
        const controller = new AbortController()
        let active = true
        let data
        let pending = false
        let refetch = false
        let frame
        const fees = new Map()
        const failedFees = new Set()
        const priceTooltips = new Map()

        function syncPriceTooltips(targets) {
            for (const [amount, remove] of priceTooltips) {
                if (!targets.has(amount)) {
                    remove()
                    priceTooltips.delete(amount)
                }
            }
            for (const [amount, explanation] of targets) {
                if (!priceTooltips.has(amount)) priceTooltips.set(amount, addPriceTooltip(amount, explanation))
            }
        }

        function clearRowAnnotations() {
            syncPriceTooltips(new Map())
            document.querySelectorAll(breakEvenSelector).forEach((element) => element.remove())
        }

        function scheduleRender() {
            if (!active || !data || frame !== undefined) return
            frame = requestAnimationFrame(() => {
                frame = undefined
                if (active && data) render(data, getFees, syncPriceTooltips)
            })
        }

        function getFees(appId, wallet) {
            const key = `${appId}/${wallet.wallet_currency}/${wallet.floor}/${wallet.increment}`
            if (!fees.has(key)) {
                fees.set(key, null)
                SORSAccountMarketData.getFeeCalculator(appId, wallet).then((calculator) => {
                    failedFees.delete(key)
                    fees.set(key, calculator)
                    scheduleRender()
                }).catch(() => {
                    failedFees.add(key)
                })
            }
            return fees.get(key)
        }

        async function loadOrders() {
            if (!active) return
            if (pending) {
                refetch = true
                return
            }
            pending = true
            for (const key of failedFees) fees.delete(key)
            failedFees.clear()
            panel.setSummary(undefined)
            try {
                data = await SORSAccountMarketData.getBuyOrders(controller.signal)
                if (active) {
                    panel.setSummary(data)
                    scheduleRender()
                }
            } catch (error) {
                if (active) {
                    data = undefined
                    clearRowAnnotations()
                    panel.setSummary(null)
                    console.warn('SORS could not load the buy-order summary', error)
                }
            } finally {
                pending = false
                if (refetch) {
                    refetch = false
                    loadOrders()
                }
            }
        }

        const panel = SORSScanPanel.mount({ onRefresh: loadOrders })
        const observer = new MutationObserver((records) => {
            if (records.some(({ type, target }) => type === 'attributes' && target.matches('button:disabled') &&
                target.parentElement && getColumn(target.parentElement) === 'modify')) {
                loadOrders()
            }
            if (records.some(({ type, target, addedNodes, removedNodes }) => {
                if (type !== 'childList') return false
                if (target.closest?.(`[${enhancement}], #${panelId}`)) return false
                return [...addedNodes, ...removedNodes].some((node) =>
                    node.nodeType === 1 && !node.hasAttribute(enhancement) && node.id !== panelId)
            })) scheduleRender()
        })
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] })
        loadOrders()

        return () => {
            active = false
            controller.abort()
            observer.disconnect()
            if (frame !== undefined) cancelAnimationFrame(frame)
            panel.dispose()
            clearRowAnnotations()
        }
    }

    return { refresh }
})()
