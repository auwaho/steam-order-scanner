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

// The legacy page exposes its currency parser and wallet configuration in the main world.
;(() => {
    const wallet = window.g_rgWalletInfo
    if (!wallet || typeof GetPriceValueAsInt !== 'function') return
    for (const quantity of document.querySelectorAll('#tabContentsMyListings .market_listing_inline_buyorder_qty')) {
        const price = quantity.parentElement
        if (!price || price.querySelector('[data-sors-break-even]')) continue
        const native = price.cloneNode(true)
        native.querySelector('.market_listing_inline_buyorder_qty').remove()
        const text = native.textContent.trim()
        const bid = GetPriceValueAsInt(text)
        if (!Number.isSafeInteger(bid) || bid < 1) continue
        const publisher = Number(wallet.wallet_publisher_fee_percent_default ?? 0.1)
        const steam = Number(wallet.wallet_fee_percent ?? 0.05)
        const gross = GetTotalWithFees(bid, publisher, steam, wallet)
        const formatted = typeof v_currencyformat === 'function' && typeof GetCurrencyCode === 'function'
            ? v_currencyformat(gross, GetCurrencyCode(wallet.wallet_currency))
            : text.replace(/\d[\d.,\s]*\d|\d/, (gross / 100).toFixed(2))
        const label = document.createElement('small')
        label.dataset.sorsBreakEven = ''
        label.title = 'Break-even selling price.'
        label.textContent = '(' + formatted + ')'
        price.appendChild(label)
    }
})()
