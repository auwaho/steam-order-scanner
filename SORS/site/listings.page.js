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
// Adds break-even selling price calculation for the current buy order on this item.
// Shows the minimal listing price to receive your buy order amount after Steam fees.

const buyOrderPriceElement = document.querySelector('.market_listing_inline_buyorder_qty')?.parentElement

if (buyOrderPriceElement) {
    const orderStr = buyOrderPriceElement.innerText.replace(/[^\d.-|,-]/g, '')
    const orderPrice = GetPriceValueAsInt(buyOrderPriceElement.innerText)

    const breakevenPoint =
        CalculateAmountToSendForDesiredReceivedAmount(orderPrice, g_rgWalletInfo.wallet_publisher_fee_percent_default)
            .amount / 100

    buyOrderPriceElement.innerHTML +=
        '<br><span title="Break-even selling price." style="color: #AFAFAF;">(' +
        buyOrderPriceElement.innerText.replace(orderStr, breakevenPoint.toFixed(2)) +
        ')</span>'
}
