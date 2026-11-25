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

var SORSItemPrices = (() => {
    'use strict'

    const cs2Exteriors = ['Factory New', 'Minimal Wear', 'Field-Tested', 'Well-Worn', 'Battle-Scarred']
    const cs2MusicKit = /^(?:StatTrak™ )?Music Kit \| /

    function readItemPage(page, order) {
        const { appid: appId, hash_name: itemName, wallet_currency: currency } = order
        const { queryData, loaderData } = extractSteamQueryData(page)
        const description = findItemQuery(queryData, 'description', appId, itemName)
        const isCommodity = (description?.commodity ?? order.description?.commodity) === true
        const book = findItemQuery(queryData, 'orderbook', appId, itemName)
        if (!book) throw new Error('The item page does not contain an order book for this exact item.')
        const prices = readMarketPrices(book, currency, isCommodity)
        return {
            ...prices,
            getReportVariant: () => getReportVariant(appId, itemName, loaderData, order.description, description)
        }
    }

    function getListingUrl({ appid: appId, hash_name: itemName, description }) {
        const listingPath = `https://steamcommunity.com/market/listings/${appId}/`
        const itemUrl = new URL(listingPath + fixedEncodeURIComponent(itemName))
        if (appId !== 730) return itemUrl

        const wear = cs2Exteriors.findIndex((exterior) => itemName.endsWith(` (${exterior})`))
        const isKnifeOrGlove = itemName.startsWith('★ ')
        if (wear === -1 && !isKnifeOrGlove && !cs2MusicKit.test(itemName)) return itemUrl

        const groupId = description?.market_bucket_group_id
        const url = typeof groupId === 'string' && /^G[0-9A-F]+$/i.test(groupId)
            ? new URL(listingPath + groupId)
            : itemUrl
        const name = itemName.replace(/^★ /, '')
        const quality = name.startsWith('StatTrak™ ') ? 'strange' : name.startsWith('Souvenir ') ? 'tournament' : 'normal'
        url.searchParams.set('category_Quality', quality)
        if (wear !== -1 || isKnifeOrGlove) {
            url.searchParams.set('category_Exterior', wear === -1 ? 'WearCategoryNA' : `WearCategory${wear}`)
        }
        url.searchParams.set('appid', String(appId))
        return url
    }

    function getReportVariant(appId, itemName, loaderData, ...descriptions) {
        if (appId !== 730) return null
        const { filters, group } = findReportBucket(loaderData, appId, itemName) ?? {}
        const tags = descriptions.flatMap((description) => Array.isArray(description?.tags) ? description.tags : [])
        const wearTag = /^WearCategory(?:\d+|NA)$/
        const findFilter = (category, pattern) => Array.isArray(filters) && filters.find((filter) =>
            Array.isArray(filter) && filter[0] === category && typeof filter[1] === 'string' && pattern.test(filter[1])
        )?.[1]
        const findUnambiguousTag = (category, pattern) => {
            const values = new Set(tags.filter((tag) =>
                tag?.category === category && typeof tag.internal_name === 'string' && pattern.test(tag.internal_name)
            ).map((tag) => tag.internal_name))
            if (values.size === 1) return values.values().next().value
        }
        const exterior = findFilter('Exterior', wearTag) || findUnambiguousTag('Exterior', wearTag)
        // A knife can have descriptive tags such as `unusual` that are not its Market filter.
        const quality = findFilter('Quality', /^[A-Za-z0-9_]+$/) || findUnambiguousTag('Quality', /^(normal|strange|tournament)$/)
        if (!quality || (!exterior && !cs2MusicKit.test(itemName))) return null

        const groupId = [...descriptions.map((description) => description?.market_bucket_group_id), group]
            .find((value) => typeof value === 'string' && /^G[0-9A-F]+$/i.test(value))
        return { quality, ...(exterior ? { exterior } : {}), ...(groupId ? { groupId } : {}) }
    }

    function findReportBucket(loaderData, appId, itemName) {
        if (!Array.isArray(loaderData)) return null
        for (let index = loaderData.length - 1; index >= 0; index--) {
            const raw = loaderData[index]
            let listing
            try {
                listing = typeof raw === 'string' ? JSON.parse(raw) : raw
            } catch {
                continue
            }
            if (listing?.appid !== appId || !Array.isArray(listing.buckets)) continue
            const bucket = listing.buckets.find((entry) => entry?.bucket_id === itemName)
            if (bucket) return { filters: bucket.filters, group: listing.listingQuery?.strItemName }
        }
        return null
    }

    function estimateBuyerPrice(sales, isCommodity) {
        const sample = []
        for (let i = 0; i + 1 < sales.length; i += 2) {
            const [price, quantity] = [sales[i], sales[i + 1]]
            if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
                throw new Error('Steam returned invalid sell prices.')
            }

            if (isCommodity) {
                sample.push(price)
                if (sample.length === 4) break
            } else {
                for (let n = 0; n < quantity && sample.length < 10; n++) sample.push(price)
                if (sample.length === 10) break
            }
        }
        const prices = isCommodity || sample.length < 2 ? sample : sample.slice(Math.max(sample.length - 5, 1))
        return prices.length ? Math.floor(prices.reduce((sum, price) => sum + price, 0) / prices.length) : 0
    }

    function extractSteamQueryData(pageSource) {
        const match = pageSource.match(
            /<script\b[^>]*\sid\s*=\s*(["'])valve-ssr-data\1[^>]*>([\s\S]*?)<\/script\s*>/i
        )
        if (!match) throw new Error('Steam SSR data not found (valve-ssr-data)')

        const { renderContext, loaderData } = JSON.parse(match[2])
        if (renderContext?.queryData == null) throw new Error('Steam SSR queryData not found')

        const queryData = JSON.parse(renderContext.queryData)
        if (!Array.isArray(queryData?.queries)) throw new Error('Steam SSR queryData.queries is not an array')
        return { queryData, loaderData }
    }

    function findItemQuery(queryData, kind, appId, itemName) {
        return queryData?.queries.find((query) => {
            const key = query?.queryKey
            return Array.isArray(key) && key[0] === 'market' && key[1] === kind && key[2] === appId && key[3] === itemName
        })?.state?.data
    }

    function readMarketPrices(book, currency, isCommodity) {
        if (!Number.isSafeInteger(book?.eCurrency) || book.eCurrency <= 0) throw new Error('Steam order book currency is missing.')
        if (book.eCurrency !== currency) {
            throw new Error(`Order book currency is ${book.eCurrency}; expected ${currency}.`)
        }

        const firstBid = readHighestBid(book)
        try {
            const sales = book.rgCompactSellOrders ?? []
            if (!Array.isArray(sales) || sales.length % 2) throw new Error('Steam returned invalid sell prices.')
            if (!sales.length && (book.cSellOrders > 0 || book.amtMinSellOrder > 0)) {
                throw new Error('Steam order book reports sell orders but omits sell prices.')
            }
            if (!sales.length) {
                return {
                    firstBid,
                    firstConfirmed: book.cSellOrders === 0,
                    saleError: new Error('Steam order book has no sell listings.')
                }
            }
            return { firstBid, firstConfirmed: true, marketGross: estimateBuyerPrice(sales, isCommodity) }
        } catch (error) {
            return { firstBid, firstConfirmed: false, saleError: error }
        }
    }

    function readHighestBid(book) {
        if (book.cBuyOrders === 0) throw new Error('Steam order book has no buy orders.')
        const highest = book.amtMaxBuyOrder
        if (Number.isSafeInteger(highest) && highest > 0) return highest
        const bids = book.rgCompactBuyOrders ?? []
        if (!Array.isArray(bids) || bids.length % 2) throw new Error('Steam returned invalid buy prices.')
        if (!bids.length) {
            if (book.cBuyOrders > 0) throw new Error('Steam order book reports buy orders but omits buy prices.')
            throw new Error('Steam order book has no buy orders.')
        }
        const [price, quantity] = bids
        if (!Number.isSafeInteger(price) || price <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
            throw new Error('Steam returned an invalid highest bid.')
        }
        return price
    }

    function fixedEncodeURIComponent(value) {
        return encodeURIComponent(value).replace(/[!'()*]/g, (char) => '%' + char.charCodeAt(0).toString(16))
    }

    return { getListingUrl, readItemPage }
})()
