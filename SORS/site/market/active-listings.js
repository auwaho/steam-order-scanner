const SORSActiveListings = (() => {
    const summaryId = 'sors-active-listing-totals'
    const options = { bGetAllData: true, category: 'active' }

    function refresh() {
        const controller = new AbortController()
        const { signal } = controller
        let active = true
        let pending = false
        let refetch = false
        let timer
        let frame
        let previousRows = new Map()
        let message = 'Loading listing totals…'

        const summary = document.createElement('div')
        summary.id = summaryId
        summary.className = 'sors-listing-summary'
        const text = document.createElement('span')
        text.setAttribute('role', 'status')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'sors-listing-refresh'
        button.textContent = 'Refresh'
        button.setAttribute('aria-label', 'Refresh active listing totals')
        summary.append(text, button)
        button.addEventListener('click', loadTotals, { signal })

        function isCurrent() {
            return active && /^\/market\/activelistings\/?$/.test(location.pathname)
        }

        function render() {
            if (!isCurrent()) return
            const nav = document.querySelector('#CommunityTemplate a[href="buyorders"]')?.parentElement
            if (nav?.querySelector('a[href="activelistings"]') && summary.previousElementSibling !== nav) nav.after(summary)
            text.textContent = message
            button.disabled = pending
            button.textContent = pending ? 'Refreshing…' : 'Refresh'
            summary.setAttribute('aria-busy', String(pending))
        }

        async function loadTotals() {
            if (!isCurrent()) return
            if (pending) {
                refetch = true
                return
            }
            pending = true
            render()
            try {
                const listings = new Set()
                let proceeds = 0
                let fees = 0
                let currency
                let total

                // Steam loads 50 listings initially and then loads another 25 at a time.
                for (let start = 0, count = 50; ; start += count, count = 25) {
                    const page = await SORSAccountMarketData.queryAction('/market/actions', 'QueryMyListings',
                        [start, count, options], signal)
                    if (!isCurrent()) return
                    if (Number(page?.eResult) !== 1 || !Array.isArray(page.rgListings)) {
                        throw new Error('Steam did not return active listings')
                    }

                    total ??= Number(page.cTotalListings)
                    if (!Number.isSafeInteger(total) || total < 0 || total !== Number(page.cTotalListings)) {
                        throw new Error('Steam listing count changed while loading')
                    }

                    for (const { listing } of page.rgListings) {
                        const price = Number(listing?.converted_price)
                        const fee = Number(listing?.converted_fee)
                        const listingCurrency = Number(listing?.converted_currencyid)
                        const listingId = listing?.listingid
                        currency ??= listingCurrency
                        if (
                            !listingId || listings.has(listingId) ||
                            listing.converted_price == null || listing.converted_fee == null ||
                            !Number.isSafeInteger(price) || price < 0 ||
                            !Number.isSafeInteger(fee) || fee < 0 ||
                            !Number.isSafeInteger(currency) || currency <= 0 || currency !== listingCurrency
                        ) {
                            throw new Error('Steam returned incomplete or inconsistent listing prices')
                        }

                        listings.add(listingId)
                        proceeds += price
                        fees += fee
                    }

                    if (listings.size === total || !page.bMore) break
                    if (!page.rgListings.length || listings.size > total) {
                        throw new Error('Steam returned inconsistent listing pagination')
                    }
                }

                if (listings.size !== total) throw new Error('Steam returned only part of the active listings')
                // Listing currency IDs include a 2000 offset from the wallet currency code.
                const walletCurrency = currency >= 2000 ? currency - 2000 : currency
                message = total
                    ? `Active listings: ${total} · Buyers pay: ${formatSteamMoney(proceeds + fees, walletCurrency)} · You receive: ${formatSteamMoney(proceeds, walletCurrency)}`
                    : 'Active listings: 0'
            } catch (error) {
                if (!isCurrent() || signal.aborted) return
                message = 'Listing totals unavailable'
                console.warn('SORS could not load active listing totals', error)
            } finally {
                pending = false
                render()
                if (refetch) {
                    refetch = false
                    void loadTotals()
                }
            }
        }

        function nativeRows() {
            const rows = new Map()
            for (const name of document.querySelectorAll('#CommunityTemplate [style*="--grid-column"][style*="nameblock"]')) {
                const row = name.parentElement
                if (!row || !row.getClientRects().length) continue
                const cells = [...row.children].filter((cell) =>
                    /^(price|quantity|modify)$/.test(cell.style.getPropertyValue('--grid-column').trim()))
                rows.set(row, JSON.stringify([
                    cells.map((cell) => cell.textContent),
                    [...row.querySelectorAll('button')].map((control) => control.disabled),
                    row.className, row.style.filter, row.style.opacity
                ]))
            }
            return rows
        }

        function checkNativeChanges() {
            frame = undefined
            if (!isCurrent()) return
            render()
            const rows = nativeRows()
            const changed = [...previousRows].some(([row, state]) => rows.get(row) !== state)
            previousRows = rows
            if (!changed) return
            clearTimeout(timer)
            timer = setTimeout(loadTotals, 350)
        }

        const observer = new MutationObserver((records) => {
            if (frame !== undefined || records.every(({ target }) => summary.contains(target))) return
            frame = requestAnimationFrame(checkNativeChanges)
        })
        observer.observe(document.body, {
            childList: true, characterData: true, subtree: true, attributes: true,
            attributeFilter: ['disabled', 'class', 'style']
        })
        previousRows = nativeRows()
        render()
        void loadTotals()

        return () => {
            active = false
            controller.abort()
            observer.disconnect()
            clearTimeout(timer)
            if (frame !== undefined) cancelAnimationFrame(frame)
            summary.remove()
        }
    }

    return { refresh }
})()
