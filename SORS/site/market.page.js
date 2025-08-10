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

// Works on the main market page: https://steamcommunity.com/market/
// Adds break-even selling price calculation to each visible buy order on the page.
// Shows the minimal listing price to recoup the buy order amount after Steam fees.

const buyQtyList = document.querySelectorAll('.market_listing_inline_buyorder_qty')

buyQtyList.forEach((element) => {
    const buyPriceElement = element.parentElement

    if (buyPriceElement) {
        const priceStr = buyPriceElement.innerText.replace(/[^\d.-|,-]/g, '')
        const orderPrice = GetPriceValueAsInt(buyPriceElement.innerText)

        const breakevenPoint =
            CalculateAmountToSendForDesiredReceivedAmount(
                orderPrice,
                g_rgWalletInfo.wallet_publisher_fee_percent_default
            ).amount / 100

        buyPriceElement.innerHTML +=
            '<br><span title="Break-even selling price." style="color: #AFAFAF">(' +
            buyPriceElement.innerText.replace(priceStr, breakevenPoint.toFixed(2)) +
            ')</span>'
    }
})
