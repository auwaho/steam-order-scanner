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

window.onbeforeunload = function () {
	return false;
}
onunload = function () {
	chrome.storage.local.set({
		scanButtonSLS: "start scan"
	});
};

var orderList = [];
var stopScan = false;

var cancelHighOrders;
var cancelLowOrders;
var highOrdersPct;
var lowOrdersPct;
var scanDelay;
var pauseWhenErrors;
var timeoutPerOrder;

var banTimer;
var timer;

chrome.storage.local.get(
	[
		"pauseWhenErrorsSLS",
		"timeoutPerOrderSLS",
		"cancelHighOrdersSLS",
		"cancelLowOrdersSLS",
		"highOrdersPctSLS",
		"lowOrdersPctSLS",
		"scanButtonSLS"
	],
	function (result) {
		pauseWhenErrors = result.pauseWhenErrorsSLS;
		timeoutPerOrder = result.timeoutPerOrderSLS;
		cancelHighOrders = result.cancelHighOrdersSLS;
		cancelLowOrders = result.cancelLowOrdersSLS;
		highOrdersPct = result.highOrdersPctSLS;
		lowOrdersPct = result.lowOrdersPctSLS;

		if (result.scanButtonSLS == "stop scan") {

			tabMyListings.click(); /* make My Active Listings tab active */

			var marketItems = document.getElementsByClassName("market_listing_row market_recent_listing_row");
			for (marketItem of marketItems) {
				if (marketItem.id.includes("mybuyorder_") && window.getComputedStyle(marketItem).display === "block") {
					orderList.push(marketItem);
				}
			}
			if (orderList.length > 0) {

				chrome.storage.onChanged.addListener(listenForStop);

				function listenForStop(changes, namespace) {

					/* listen for stop */
					if (namespace == 'local' && 'scanButtonSLS' in changes) {
						if (changes.scanButtonSLS.newValue == 'start scan') {

							stopScan = true;

							if (banTimer != undefined) {
								clearTimeout(banTimer);
							}
							if (timer != undefined) {
								clearTimeout(timer);
							}

							chrome.storage.onChanged.removeListener(listenForStop);
						}
					}
					/* track scan options changes */
					if (namespace == 'local' && 'cancelHighOrdersSLS' in changes) {
						cancelHighOrders = changes.cancelHighOrdersSLS.newValue;
					}
					if (namespace == 'local' && 'cancelLowOrdersSLS' in changes) {
						cancelLowOrders = changes.cancelLowOrdersSLS.newValue;
					}
					if (namespace == 'local' && 'pauseWhenErrorsSLS' in changes) {
						pauseWhenErrors = changes.pauseWhenErrorsSLS.newValue;
					}
					if (namespace == 'local' && 'timeoutPerOrderSLS' in changes) {
						timeoutPerOrder = changes.timeoutPerOrderSLS.newValue;
					}
					if (namespace == 'local' && 'highOrdersPctSLS' in changes) {
						highOrdersPct = changes.highOrdersPctSLS.newValue;
					}
					if (namespace == 'local' && 'lowOrdersPctSLS' in changes) {
						lowOrdersPct = changes.lowOrdersPctSLS.newValue;
					}
				}

				window.onload = window.stop();
				setTimeout(checkOrders, 100); // run main function

			} else {
				chrome.storage.local.set({
					scanButtonSLS: "start scan"
				});
				alert("Seems you haven't buy orders or not logined!");
			}

		}
	}
);

/* MAIN SCAN FUNCTION */
async function checkOrders() {

	console.log('%c ▼ single scan start ▼ ', 'background: #000000; color: #FFD700');
	document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = "none";

	for (var oldOrder of orderList) {
		oldOrder.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
	}
	orderList[0].scrollIntoView({
		block: 'center',
		behavior: 'smooth'
	});

	/* report variables */
	var badQty = 0;
	var badOrd = '';
	var prefix = '';
	var suffix = '';

	var sessionid = '';
	var sellPrice;

	for (var order of orderList) {

		var buy_orderid = order.id.substring(11);
		var orderHref = order.getElementsByClassName('market_listing_item_name_link')[0].href;
		var appId = getFromBetween.get(orderHref, 'listings/', '/');
		var hashName = order.getElementsByClassName('market_listing_item_name_link')[0].innerText;
		var orderPrice = order.getElementsByClassName('market_listing_inline_buyorder_qty')[0].parentElement.innerText.replace(/[^\d^.^,]/g, '').replace(',', '.') * 100;

		var sourceCode = await failRetryHttpGet(orderHref);

		if (stopScan == true) {
			console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700');
			document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = "";
			return false;
		}

		if (prefix + suffix == '') {
			prefix = getFromBetween.get(sourceCode, `strFormatPrefix = "`, `"`)[0];
			suffix = getFromBetween.get(sourceCode, `strFormatSuffix = "`, `"`)[0];
		}
		if (sessionid == '') {
			sessionid = getFromBetween.get(sourceCode, `g_sessionID = "`, `"`)[0];
		}

		if (sourceCode.includes('<div id="market_commodity_order_spread">')) {

			var currencyId = getFromBetween.get(sourceCode, '{"wallet_currency":', ',')[0];
			var itemNameId = getFromBetween.get(sourceCode, 'Market_LoadOrderSpread( ', ' )')[0];
			var orderHrefJson = `https://steamcommunity.com/market/itemordershistogram?language=english&currency=${currencyId}&item_nameid=${itemNameId}`;

			sourceCode = await failRetryHttpGet(orderHrefJson);

			var avarageOfTwo = JSON.parse(sourceCode).sell_order_graph.map(a => a[0]).slice(0, 4).reduce((a, b) => a + b) / 4 - 0.01;
			sellPrice = avarageOfTwo < 0.16 ? (avarageOfTwo - 0.02) * 100 : Math.ceil(avarageOfTwo / 1.15 * 100);

		} else {
			var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', '</span>').map(s => s.replace(/[^\d^.^,]/g, '').replace(',', '.') * 100).filter(Number);
			var fivePrices = tenPrices.slice(Math.max(tenPrices.length - 5, 1));
			sellPrice = fivePrices.reduce((a, b) => a + b, 0) / fivePrices.length - 1;
		}

		/* preventing false cancels (just in case) */
		if (isNaN(sellPrice) == true || sellPrice == 0) {
			continue;
		}

		if (sellPrice * (100 - highOrdersPct) / 100 < orderPrice) {

			/* add order to report */
			badQty++;
			badOrd += `<tr><td>${badQty}</td><td>${appId}</td><td><a href="${orderHref}" target="_blank">${hashName}</a></td><td>${prefix}${orderPrice/100}${suffix}</td><td>${prefix}${parseFloat((sellPrice/100 - orderPrice/100)+0).toFixed(2)}${suffix}</td></tr>`;

			if (cancelHighOrders == true) {
				httpPost('//steamcommunity.com/market/cancelbuyorder/', sessionid, buy_orderid);
			}

			order.style.backgroundColor = "#4C1C1C"; //change order color to red
			console.log(`%c ${hashName} (${orderPrice / 100}/${sellPrice / 100}): ${orderHref}`, 'color: red');

		} else if (sellPrice * (100 - lowOrdersPct) / 100 > orderPrice) {

			if (cancelLowOrders == true) {
				httpPost('//steamcommunity.com/market/cancelbuyorder/', sessionid, buy_orderid);
			}

			order.style.backgroundColor = "#4C471C"; //change order color to orange

		} else {
			order.style.backgroundColor = "#1C4C1C"; //change order color to green
		}
		console.log('Check');
		await new Promise(done => timer = setTimeout(() => done(), timeoutPerOrder));
	}

	chrome.storage.local.set({
		scanButtonSLS: "start scan",
		scanEndTimeSLS: new Date().toLocaleString(),
		scanTableSLS: badOrd
	});

	console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700');
	document.getElementsByClassName('market_tab_well_tabs')[0].style.pointerEvents = "";
}

/* OTHER FUNCTIONS */

async function failRetryHttpGet(url, attempts = 5) {
	return await httpGet(url).catch(async function () {
		if (attempts == 5) {
			await wait(5000);
			return failRetryHttpGet(url, attempts - 1);
		} else if (attempts <= 0) {
			await wait(pauseWhenErrors * 60000);
			return failRetryHttpGet(url, attempts = 5);
		}
		await wait(10000);
		return failRetryHttpGet(url, attempts - 1);
	});
}

async function wait(ms) {
	return new Promise(resolve => {
		banTimer = setTimeout(resolve, ms);
	});
}

function httpGet(url) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.onload = function () {
			if (this.status == 200) {
				resolve(this.response);
			} else {
				var error = new Error(this.statusText);
				error.code = this.status;
				reject(error);
			}
		};
		xhr.onerror = function () {
			reject(new Error("Network Error"));
		};
		xhr.send();
	});
}

function httpPost(url, sessionid, buy_orderid) {
	return new Promise(function (resolve, reject) {
		var xhr = new XMLHttpRequest();
		var params = `sessionid=${sessionid}&buy_orderid=${buy_orderid}`;
		xhr.open('POST', url, true);
		xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
		xhr.onreadystatechange = function () {
			if (this.status == 200) {
				resolve(this.response);
			} else {
				var error = new Error(this.statusText);
				error.code = this.status;
				reject(error);
			}
		}
		xhr.onerror = function () {
			reject(new Error("Network Error"));
		};
		xhr.send(params);
	});
}

var getFromBetween = {
	results: [],
	string: "",
	getFromBetween: function (t, s) {
		if (this.string.indexOf(t) < 0 || this.string.indexOf(s) < 0) return !1;
		var i = this.string.indexOf(t) + t.length,
			e = this.string.substr(0, i),
			n = this.string.substr(i),
			r = e.length + n.indexOf(s);
		return this.string.substring(i, r)
	},
	removeFromBetween: function (t, s) {
		if (this.string.indexOf(t) < 0 || this.string.indexOf(s) < 0) return !1;
		var i = t + this.getFromBetween(t, s) + s;
		this.string = this.string.replace(i, "")
	},
	getAllResults: function (t, s) {
		if (!(this.string.indexOf(t) < 0 || this.string.indexOf(s) < 0)) {
			var i = this.getFromBetween(t, s);
			this.results.push(i), this.removeFromBetween(t, s), this.string.indexOf(t) > -1 && this.string.indexOf(s) > -1 && this.getAllResults(t, s)
		}
	},
	get: function (t, s, i) {
		return this.results = [], this.string = t, this.getAllResults(s, i), this.results
	}
}