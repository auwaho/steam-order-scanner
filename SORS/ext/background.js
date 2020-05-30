chrome.runtime.onInstalled.addListener(function () {

	const sett = {
		cancelHighOrdersSLS: false,
		cancelLowOrdersSLS: false,
		showMoreOrdersSLS: true,
		showMoreOrdersQntSLS: 20,
		autoScanOrdersSLS: false,
		autoScanOrdersDelaySLS: 30,
		highOrdersPctSLS: 0,
		lowOrdersPctSLS: 30,
		timeoutPerOrderSLS: 500,
		pauseWhenErrorsSLS: 5,
		scanButtonSLS: "start scan",
		scanEndTimeSLS: "NOT YET COMPLETED",
		scanTableSLS: ""
	}

	chrome.storage.local.get(Object.keys(sett),
		function (result) {
			for (const s in sett) {
				if (typeof result[s] == "undefined") {
					chrome.storage.local.set({
						[s]: sett[s]
					});
				}
			}
		}
	);
	chrome.tabs.query({}, function (tabs) {
		for (let t of tabs) {
			if (t.url.includes("https://steamcommunity.com/")) {
				chrome.tabs.reload(t.id);
			}
		}
	});

});

var scanFreqTimer;
var banTimer;
var timer;

chrome.storage.local.get('runAutoScanSLS', function (result) {
	if (result.runAutoScanSLS == true) {
		autoscan();
	}
});

chrome.storage.onChanged.addListener(function (changes, namespace) {

	/* waiting for autoscan to be enabled */
	if (namespace == 'local' && 'runAutoScanSLS' in changes) {
		if (changes.runAutoScanSLS.newValue == true) {

			autoscan();

		} else {
			if (scanFreqTimer != undefined) {
				clearTimeout(scanFreqTimer);
			}
			if (banTimer != undefined) {
				clearTimeout(banTimer);
			}
			if (timer != undefined) {
				clearTimeout(timer);
			}
		}
	}
});

async function autoscan() {

	var stopScan = false;

	var timeoutPerOrder;
	var autoScanOrdersDelay;
	var cancelHighOrders;
	var cancelLowOrders;
	var highOrdersPct;
	var lowOrdersPct;

	chrome.storage.local.get(
		[
			"pauseWhenErrorsSLS",
			"timeoutPerOrderSLS",
			"autoScanOrdersDelaySLS",
			"cancelHighOrdersSLS",
			"cancelLowOrdersSLS",
			"highOrdersPctSLS",
			"lowOrdersPctSLS"
		],
		function (result) {
			autoScanOrdersDelay = result.autoScanOrdersDelaySLS;
			pauseWhenErrors = result.pauseWhenErrorsSLS;
			timeoutPerOrder = result.timeoutPerOrderSLS;
			cancelHighOrders = result.cancelHighOrdersSLS;
			cancelLowOrders = result.cancelLowOrdersSLS;
			highOrdersPct = result.highOrdersPctSLS;
			lowOrdersPct = result.lowOrdersPctSLS;

			startScan();
		}
	);

	chrome.storage.onChanged.addListener(listenForStop);

	function listenForStop(changes, namespace) {

		/* listen for stop */
		if (namespace == 'local' && 'runAutoScanSLS' in changes) {
			if (changes.runAutoScanSLS.newValue == false) {

				stopScan = true;

				chrome.storage.onChanged.removeListener(listenForStop);
			}
		}

		/* track scan options changes */
		if (namespace == 'local' && 'autoScanOrdersDelaySLS' in changes) {
			autoScanOrdersDelay = changes.autoScanOrdersDelaySLS.newValue;
		}
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

	/* MAIN SCAN FUNCTION */
	async function startScan() {

		var myListings = JSON.parse(await failRetryHttpGet("https://steamcommunity.com/market/mylistings/?norender=1"));
		var orderListJson = myListings.buy_orders;

		/* report variables */
		var badQty = 0;
		var badOrd = '';
		var prefix = '';
		var suffix = '';

		var sessionId = ''

		if (orderListJson.length > 0) {
			for (var order of orderListJson) {

				var appId = order.appid;
				var buyOrderId = order.buy_orderid;
				var hashName = order.hash_name;
				var orderHref = `https://steamcommunity.com/market/listings/${appId}/${hashName}`;
				var orderPrice = order.price;

				var sourceCode = await failRetryHttpGet(orderHref);

				if (stopScan == true) {
					return false;
				}

				if (prefix + suffix == '') {
					prefix = getFromBetween.get(sourceCode, `strFormatPrefix = "`, `"`)[0];
					suffix = getFromBetween.get(sourceCode, `strFormatSuffix = "`, `"`)[0];
				}
				if (sessionId == '') {
					sessionId = getFromBetween.get(sourceCode, `g_sessionID = "`, `"`)[0];
				}

				var sellPrice;

				if (sourceCode.includes(`<div id="market_commodity_order_spread">`)) {

					var currencyId = getFromBetween.get(sourceCode, `{"wallet_currency":`, ',')[0];
					var itemNameId = getFromBetween.get(sourceCode, 'Market_LoadOrderSpread( ', ' )')[0];
					var orderHrefJson = `https://steamcommunity.com/market/itemordershistogram?language=english&currency=${currencyId}&item_nameid=${itemNameId}`;
					sourceCode = await failRetryHttpGet(orderHrefJson);
					var avarageOfTwo = JSON.parse(sourceCode).sell_order_graph.map(a => a[0]).slice(0, 4).reduce((a, b) => a + b) / 4 - 0.01;
					sellPrice = avarageOfTwo < 0.16 ? (avarageOfTwo - 0.02) * 100 : Math.ceil(avarageOfTwo / 1.15 * 100);

				} else {
					var tenPrices = getFromBetween.get(sourceCode, `<span class="market_listing_price market_listing_price_without_fee">`, '</span>').map(s => s.replace(/[^\d^.^,]/g, '').replace(',', '.') * 100).filter(Number);
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
						sendCancel(sessionId, buyOrderId)
					}

				} else if (sellPrice * (100 - lowOrdersPct) / 100 > orderPrice) {

					if (cancelLowOrders == true) {
						sendCancel(sessionId, buyOrderId)
					}
				}
				await new Promise(done => timer = setTimeout(() => done(), timeoutPerOrder));
			}
		}

		chrome.storage.local.set({
			scanEndTimeSLS: new Date().toLocaleString(),
			scanTableSLS: badOrd
		});

		scanFreqTimer = setTimeout(startScan, autoScanOrdersDelay * 60000);
	}


	/* OTHER FUNCTIONS */

	function sendCancel(sid, oid) {
		chrome.tabs.query({
			url: "*://steamcommunity.com/*"
		}, function (tabs) {
			if (tabs.length > 0) {
				if (tabs[0].status == 'complete') {
					chrome.tabs.sendMessage(tabs[0].id, {
						cancelRequestSORS: `sessionid=${sid}&buy_orderid=${oid}`
					});
				} else {
					chrome.tabs.onUpdated.addListener(listenForCreate);
					chrome.tabs.onRemoved.addListener(function listenForRemove(tabId) {
						if (tabId == tabs[0].id) {
							chrome.tabs.onUpdated.removeListener(listenForCreate);
							chrome.tabs.onRemoved.removeListener(listenForRemove);
						}
					})

					function listenForCreate(tabId, info) {
						if (info.status === 'complete' && tabId === tabs[0].id) {
							chrome.tabs.onUpdated.removeListener(listenForCreate);
							chrome.tabs.sendMessage(tabs[0].id, {
								cancelRequestSORS: `sessionid=${sid}&buy_orderid=${oid}`
							});

						}
					}
				}
			} else {
				chrome.tabs.create({
					url: "https://steamcommunity.com/market/",
					active: false
				}, function (tab) {
					chrome.tabs.onUpdated.addListener(listenForCreate);
					chrome.tabs.onRemoved.addListener(function listenForRemove(tabId) {
						if (tabId == tab.id) {
							chrome.tabs.onUpdated.removeListener(listenForCreate);
							chrome.tabs.onRemoved.removeListener(listenForRemove);
						}
					})

					function listenForCreate(tabId, info) {
						if (info.status === 'complete' && tabId === tab.id) {
							chrome.tabs.onUpdated.removeListener(listenForCreate);
							chrome.tabs.sendMessage(tab.id, {
								cancelRequestSORS: `sessionid=${sid}&buy_orderid=${oid}`
							});

						}
					}
				});
			}

		});
		/*,function(response){console.log(response.cancelResponseSORS);}*/
	}

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


}