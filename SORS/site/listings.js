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

// Works on item listing pages like https://steamcommunity.com/market/listings/<appid>/<hashname>
// Enhancements on item listing pages:
// - Shows number of sales in the last 24 hours (adds a label above the price history)
// - Displays the break-even listing price for your buy order on this item
// - Reveals listing prices without Steam fees (enables the price-without-fee element)
// - Optionally expands buy/sell order tables to show more rows (configurable in extension settings)

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

const source = document.documentElement.outerHTML

// get last 24 hours sales and append to median graph
;(function dailySales() {
    let salesPerDay = 0
    const salesGraph = JSON.parse(source.extract('var line1=', ';'))
    const dayBefore = Date.parse(salesGraph[salesGraph.length - 1][0]) - 86400000
    for (let sale = salesGraph.length - 1; sale >= salesGraph.length - 24; sale--) {
        if (Date.parse(salesGraph[sale][0]) > dayBefore) {
            salesPerDay += parseInt(salesGraph[sale][2])
        } else {
            break
        }
    }

    const zoomCtrls = document.getElementsByClassName('zoom_controls pricehistory_zoom_controls')[0]
    const salesLabel = document.createElement('label')
    salesLabel.innerHTML = `${salesPerDay} sold in the last 24 hours`.fontcolor('white')
    zoomCtrls.parentNode.insertBefore(salesLabel, zoomCtrls)
})()

// add market listing price without fee
;(function addMarketListingPriceWithoutFee() {
    const feeStyle = document.createElement('style')
    feeStyle.innerHTML = '.market_listing_price_without_fee { display:block; color:gray; }'
    document.head.appendChild(feeStyle)

    // add price with fee for buy order
    if (document.querySelector('#tabContentsMyListings')) {
        var script = document.createElement('script')
        script.src = chrome.runtime.getURL('site/listings.page.js')
        document.body.appendChild(script)
    }
})()

// show more orders and sales if enabled
chrome.storage.local.get(['showMoreOrdersSORS', 'showMoreOrdersQtySORS'], function (result) {
    if (result.showMoreOrdersSORS != true) {
        return
    }

    var showQnt = result.showMoreOrdersQtySORS

    if (document.getElementById('market_commodity_order_spread') == null) {
        document.getElementById('market_buyorder_info_show_details').style.display = 'none'
        document.getElementById('market_buyorder_info_details').style.display = 'block'
    }

    const item_nameid = source.extract('Market_LoadOrderSpread( ', ' );')
    const currency = source.extract('"wallet_currency":', ',') == '' ? 1 : source.extract('"wallet_currency":', ',')
    const country = source.extract('var g_strCountryCode = "', '"')
    const language = source.extract('var g_strLanguage = "', '"')
    const url = `//steamcommunity.com/market/itemordershistogram?country=${country}&language=${language}&currency=${currency}&item_nameid=${item_nameid}`

    var qntSumm = 0
    var tableRows = `
      <tr>
        <th align="right">Price</th>
        <th align="right">Quantity</th>
      </tr>
    `

    async function table() {
        const histogram = await (await fetch(url)).json()
        const buyQnt = histogram.buy_order_graph.length
        const sellQnt = histogram.sell_order_graph.length

        for (let i = 0; i < showQnt; i++) {
            if (i >= buyQnt) {
                break
            }
            var prc = histogram.buy_order_graph[i][0]
            var qnt = histogram.buy_order_graph[i][1]
            var row = `
          <tr>
            <td align="right" class="">${histogram.price_prefix}${parseFloat(prc).toFixed(2)}${
                histogram.price_suffix
            }</td>
            <td align="right">${qnt - qntSumm}</td>
          </tr>
        `
            qntSumm = qnt
            tableRows += row
        }

        document.getElementById('market_commodity_buyreqeusts_table').outerHTML = `
        <table class="market_commodity_orders_table">
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      `

        if (document.getElementById('market_commodity_order_spread') != null) {
            tableRows = `
          <tr>
            <th align="right">Price</th>
            <th align="right">Quantity</th>
          </tr>
        `

            qntSumm = 0

            for (let i = 0; i < showQnt; i++) {
                if (i >= sellQnt) {
                    break
                }
                var prc = histogram.sell_order_graph[i][0]
                var qnt = histogram.sell_order_graph[i][1]
                var row = `
            <tr>
              <td align="right" class="">${histogram.price_prefix}${parseFloat(prc).toFixed(2)}${
                    histogram.price_suffix
                }</td>
              <td align="right">${qnt - qntSumm}</td>
            </tr>
          `
                qntSumm = qnt
                tableRows += row
            }

            document.getElementById('market_commodity_forsale_table').outerHTML = `
          <table class="market_commodity_orders_table">
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        `
        }
    } // table()
    table()
})
