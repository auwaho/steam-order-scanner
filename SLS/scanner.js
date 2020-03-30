window.stop();
onbeforeunload = function () {
	return "";
};
onunload = function () {
	chrome.storage.sync.set({
		scanButtonSLS: "start scan"
	});
};

var pause;
var cancelHigh;
var cancelLow;
var lowPct;
var scanDelay;
var stopScan = false;
var orderList = [];
var myBuyOrdersEl = document.getElementsByClassName("my_market_header_active")[document.getElementsByClassName("my_market_header_active").length - 1];

chrome.storage.sync.get(["timeoutPerOrderSLS"], function (result) {
	pause = result.timeoutPerOrderSLS;
	chrome.storage.sync.get(["lowOrdersPctSLS"], function (result) {
		lowPct = result.lowOrdersPctSLS;
		chrome.storage.sync.get(['cancelHighOrdersSLS'], function (result) {
			cancelHigh = result.cancelHighOrdersSLS;
			chrome.storage.sync.get(['cancelLowOrdersSLS'], function (result) {
				cancelLow = result.cancelLowOrdersSLS;
				chrome.storage.sync.get(["autoScanOrdersSLS"], function (result) {
					var autoScan = result.autoScanOrdersSLS;
					chrome.storage.sync.get(["scanButtonSLS"], function (result) {
						if (result.scanButtonSLS == "stop scan") {
							if (autoScan == false) {
								var marketItems = document.getElementsByClassName("market_listing_row market_recent_listing_row");
								for (marketItem of marketItems) {
									if (marketItem.id.includes("mybuyorder_") && window.getComputedStyle(marketItem).display === "block") {
										orderList.push(marketItem);
									}
								}
								if (orderList.length > 0) {
									myBuyOrdersEl.style.color = "gold";
									window.onload = checkOrders();
									(async function listenForStop() {
										if (myBuyOrdersEl.style.color == "white") {
											stopScan = true;
											return false;
										}
										setTimeout(listenForStop, 500);
									})();
								} else {
									chrome.storage.sync.set({
										scanButtonSLS: "start scan"
									});
									alert("Looks like you have not buy orders or not logined!");
								}
							} else {
								chrome.storage.sync.get(["autoScanOrdersDelaySLS"], function (result) {
									scanDelay = result.autoScanOrdersDelaySLS;
									myBuyOrdersEl.style.color = "gold";
									window.onload = autoCheckOrders();
									(async function listenForStop() {
										if (myBuyOrdersEl.style.color == "white") {
											stopScan = true;
											return false;
										}
										setTimeout(listenForStop, 500);
									})();
								});
							}
						} else {
							myBuyOrdersEl.style.color = "white";
						}
					})
				});
			});
		});
	});
});

//ZZZZZZZZZZZZZZ> SCAN FN <ZZZZZZZZZZZZZZ//
async function checkOrders() {

	console.log('%c ▼ single scan start ▼ ', 'background: #000000; color: #FFD700');

	for (var oldOrder of orderList) {
		oldOrder.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
	}
	orderList[0].scrollIntoView({
		block: 'center',
		behavior: 'smooth'
	});

	for (var order of orderList) {

		var buy_orderid = order.id.substring(11);
		var orderHref = order.getElementsByClassName('market_listing_item_name_link')[0].href;
		var orderName = order.getElementsByClassName('market_listing_item_name_link')[0].innerText;
		//var orderPrice = order.getElementsByClassName('market_listing_price')[0].innerText.replace(/\D+/g, '');
		var orderPrice = 0;
		for (var element of order.getElementsByClassName("market_listing_right_cell market_listing_my_price")) {
			if (element.className == "market_listing_right_cell market_listing_my_price") {
				orderPrice = element.getElementsByClassName('market_listing_price')[0].innerText.replace(/\D+/g, '');
			}
		}

		var sourceCode;
		async function getSource() {
			sourceCode = await httpGet(orderHref);
		}
		await retryOnFailForSingle(4, 30000, getSource);

		if (stopScan == true) {
			break;
		}

		var steamPrice;

		if (sourceCode.includes('<div id="market_commodity_order_spread">')) {

			var currencyId = getFromBetween.get(sourceCode, '{"wallet_currency":', ',')[0];
			var itemNameId = getFromBetween.get(sourceCode, 'Market_LoadOrderSpread( ', ' )')[0];
			var orderHrefJson = `https://steamcommunity.com/market/itemordershistogram?language=english&currency=${currencyId}&item_nameid=${itemNameId}`;
			async function getSource() {
				sourceCode = await httpGet(orderHrefJson);
			}
			await retryOnFailForSingle(4, 30000, getSource);
			var avarageOfTwo = JSON.parse(sourceCode).sell_order_graph.map(a => a[0]).slice(0, 4).reduce((a, b) => a + b) / 4 - 0.01;
			steamPrice = avarageOfTwo < 0.16 ? (avarageOfTwo - 0.02) * 100 : Math.ceil(avarageOfTwo / 1.15 * 100);

		} else {
			var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', '</span>').map(s => s.replace(/\D+/g, '') * 1).filter(Number);
			var fivePrices = tenPrices.slice(Math.max(tenPrices.length - 5, 1));
			steamPrice = fivePrices.reduce((a, b) => a + b, 0) / fivePrices.length;
		}

		//preventing false cancels (just in case)
		if (isNaN(steamPrice) == true || steamPrice == 0) {
			continue;
		}

		if (orderPrice > steamPrice) {

			if (cancelHigh == true) {
				async function sendPost() {
					await httpPost('//steamcommunity.com/market/cancelbuyorder/', getSessionId(), buy_orderid);
				}
				await retryOnFailForSingle(4, 30000, sendPost);
			}

			order.style.backgroundColor = "#4C1C1C"; //change order color to red
			console.log(`%c ${orderName} (${orderPrice / 100}): ${orderHref}`, 'color: red');

		} else if (orderPrice < steamPrice * (100 - lowPct) / 100) {

			if (cancelLow == true) {
				async function sendPost() {
					await httpPost('//steamcommunity.com/market/cancelbuyorder/', getSessionId(), buy_orderid);
				}
				await retryOnFailForSingle(4, 30000, sendPost);
			}

			order.style.backgroundColor = "#4C471C"; //change order color to orange

		} else {
			order.style.backgroundColor = "#1C4C1C"; //change order color to green
		}
		console.log('Check');
		await new Promise(done => setTimeout(() => done(), pause));
	}

	console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700');
	myBuyOrdersEl.style.color = "white";
	chrome.storage.sync.set({
		scanButtonSLS: "start scan"
	});
}

//ZZZZZZZZZZZZZZ> AUTO SCAN FN <ZZZZZZZZZZZZZZ//
async function autoCheckOrders() {

	console.log('%c ▼ auto scan start ▼ ', 'background: #000000; color: #FFD700');

	var myListings = JSON.parse(await httpGet("//steamcommunity.com/market/mylistings/?norender=1"));
	var orderListJson = myListings.buy_orders;

	if (orderListJson.length > 0) {
		for (var order of orderListJson) {

			var appid = order.appid;
			var buy_orderid = order.buy_orderid;
			var hash_name = order.hash_name;
			var orderHref = `//steamcommunity.com/market/listings/${appid}/${hash_name}`;
			var orderPrice = order.price;
			var sourceCode;
			async function getSource() {
				sourceCode = await httpGet(orderHref);
			}
			await retryOnFailForAuto(4, 30000, 10, getSource);

			if (stopScan == true) {
				console.log('%c ■  auto scan end  ■ ', 'background: #000000; color: #FFD700');
				return false;
			}

			var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', "</span>").map(s => s.replace(/\D+/g, "") * 1).filter(Number);
			var fivePrices = tenPrices.slice(Math.max(tenPrices.length - 5, 1));
			var steamPrice = fivePrices.reduce((a, b) => a + b, 0) / fivePrices.length;

			if (orderPrice > steamPrice) {

				async function sendPost() {
					await httpPost('//steamcommunity.com/market/cancelbuyorder/', getSessionId(), buy_orderid);
				}
				await retryOnFailForAuto(4, 30000, 10, sendPost);
				console.log(`${orderHref} | order: ${orderPrice / 100}`);

			}
			console.log('Order is ok');
			await new Promise(done => setTimeout(() => done(), Math.floor(Math.random() * (+3000 - +1500)) + +1500));
		}
	}

	console.log('%c ■  auto scan end  ■ ', 'background: #000000; color: #FFD700');
	setTimeout(autoCheckOrders, scanDelay * 60000);
}


//ZZZZZZZZZZZZZZ> OTHER FNS <ZZZZZZZZZZZZZZ//
function getSessionId() {
	var jsId = document.cookie.match(/sessionid=[^;]+/);
	if (jsId != null) {
		if (jsId instanceof Array)
			jsId = jsId[0].substring(10);
		else
			jsId = jsId.substring(10);
	}
	return jsId;
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
			alert("Connection error!");
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
			alert("Connection error!");
		};
		xhr.send(params);
	});
}

var getFromBetween = {
	results: [],
	string: "",
	getFromBetween: function (sub1, sub2) {
		if (this.string.indexOf(sub1) < 0 || this.string.indexOf(sub2) < 0) return false;
		var SP = this.string.indexOf(sub1) + sub1.length;
		var string1 = this.string.substr(0, SP);
		var string2 = this.string.substr(SP);
		var TP = string1.length + string2.indexOf(sub2);
		return this.string.substring(SP, TP);
	},
	removeFromBetween: function (sub1, sub2) {
		if (this.string.indexOf(sub1) < 0 || this.string.indexOf(sub2) < 0) return false;
		var removal = sub1 + this.getFromBetween(sub1, sub2) + sub2;
		this.string = this.string.replace(removal, "");
	},
	getAllResults: function (sub1, sub2) {
		if (this.string.indexOf(sub1) < 0 || this.string.indexOf(sub2) < 0) return;
		var result = this.getFromBetween(sub1, sub2);
		this.results.push(result);
		this.removeFromBetween(sub1, sub2);
		if (this.string.indexOf(sub1) > -1 && this.string.indexOf(sub2) > -1) {
			this.getAllResults(sub1, sub2);
		} else return;
	},
	get: function (string, sub1, sub2) {
		this.results = [];
		this.string = string;
		this.getAllResults(sub1, sub2);
		return this.results;
	}
};

async function retryOnFailForSingle(attempts, delay, fn) {
	if (stopScan == true) {
		return false;
	}
	var tries = attempts;
	return await fn().catch(async function () {
		if (tries <= 0) {
			alert("Can't load item page, check Market for microbans and then press 'OK'");
			await new Promise(done => setTimeout(() => done(), delay));
			return retryOnFailForSingle(attempts, delay, fn);
		}
		await new Promise(done => setTimeout(() => done(), delay));
		return retryOnFailForSingle(tries - 1, delay, fn);
	});
}

async function retryOnFailForAuto(attempts, delay, pause, fn) {
	if (stopScan == true) {
		return false;
	}
	var tries = attempts;
	return await fn().catch(async function () {
		if (tries <= 0) {
			console.log("Error! Can't load item page.");
			await new Promise(done => setTimeout(() => done(), pause * 60000));
			return retryOnFailForAuto(attempts, delay, fn);
		}
		await new Promise(done => setTimeout(() => done(), delay));
		return retryOnFailForAuto(tries - 1, delay, fn);
	});
}