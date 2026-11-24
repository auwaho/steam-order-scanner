const SORSActiveListings = (() => {
    const summaryId = 'sors-active-listing-totals'
    const options = { bGetAllData: true, category: 'active' }
    let refreshId = 0

    async function refresh() {
        const id = ++refreshId
        const isCurrent = () => id === refreshId && /^\/market\/activelistings\/?$/.test(location.pathname)
        if (!isCurrent()) return

        SORSAccountMarket.mountSummary(summaryId, 'Loading listing totals…')
        try {
            const listings = new Set()
            let proceeds = 0
            let fees = 0
            let currency
            let total

            // Steam loads 50 listings initially and then loads another 25 at a time.
            for (let start = 0, count = 50; ; start += count, count = 25) {
                const page = await SORSAccountMarket.queryAction('/market/actions', 'QueryMyListings', [start, count, options])
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

            // Market listing currency IDs include a 2000 offset from the wallet currency code.
            const [prefix, suffix] = getCurrencyPrefixSuffix(currency >= 2000 ? currency - 2000 : currency)
            const format = (amount) => `${prefix}${(amount / 100).toFixed(2)}${suffix}`
            SORSAccountMarket.mountSummary(
                summaryId,
                `Active listings: ${total} · Buyers pay: ${format(proceeds + fees)} · You receive: ${format(proceeds)}`
            )
        } catch {
            if (isCurrent()) SORSAccountMarket.mountSummary(summaryId, 'Listing totals unavailable')
        }
    }

    return { refresh }
})()
