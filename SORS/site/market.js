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

var orderList = document.getElementsByClassName("market_listing_right_cell market_listing_my_price market_listing_buyorder_qty");
if (orderList.length > 1) {

    addQnt();
    addBreakEven();

    var observer = new MutationObserver(function () {
        orderList = document.getElementsByClassName("market_listing_right_cell market_listing_my_price market_listing_buyorder_qty");
        if (!orderList[1].innerText.includes("/")) {
            addQnt();

            document.querySelector('#breakEven').remove();
            addBreakEven();
        }
    });

    observer.observe(orderList[0], {
        attributes: true,
        childList: true,
        characterData: true
    });

    async function addQnt() {

        try {
            var myList = await (await fetch("//steamcommunity.com/market/mylistings/?norender=1")).json();

            var ordersSum = 0;
            var listingsSum = 0;
            var listingsFee = 0;
            var listingsQty = myList.total_count;

            for (let i = 1; i < orderList.length; i++) {
                ordersSum += myList.buy_orders[i - 1].price / 100 * myList.buy_orders[i - 1].quantity_remaining;
                var newQnt = `${myList.buy_orders[i - 1].quantity_remaining} / ${myList.buy_orders[i - 1].quantity}`;
                orderList[i].innerHTML = `<span class="market_table_value"><span class="market_listing_price">${newQnt}</span></span>`;
            }
            for (let x = 0; x < listingsQty; x += 10) {
                if (x == 0) {
                    for (let i = 0; i < myList.listings.length; i++) {
                        listingsSum += myList.listings[i].converted_price;
                        listingsFee += myList.listings[i].converted_fee;
                    }
                } else {
                    var nextPage = await (await fetch(`//steamcommunity.com/market/mylistings/?norender=1&start=${x}`)).json();
                    for (let i = 0; i < nextPage.listings.length; i++) {
                        listingsSum += nextPage.listings[i].converted_price;
                        listingsFee += nextPage.listings[i].converted_fee;
                    }
                }
            }
            my_market_buylistings_number.innerHTML = `QTY: <b>${myList.buy_orders.length}</b> / SUM: <b>${parseFloat(ordersSum).toFixed(2)}</b>`;
            my_market_selllistings_number.innerHTML = `QTY: <b>${listingsQty}</b> / SUM: <b>${parseFloat((listingsSum + listingsFee) / 100).toFixed(2)}</b> / SWF: <b>${parseFloat(listingsSum / 100).toFixed(2)}</b>`;
        } catch (e) {
            //console.log(e);
        }
    }

    function addBreakEven() {
        var script = document.createElement("script");
        script.id = "breakEven";
        script.src = chrome.runtime.getURL("site/market.page.js");
        document.body.appendChild(script);
    }
}


