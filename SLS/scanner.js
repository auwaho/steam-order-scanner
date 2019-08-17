var cancelHigh;
var cancelLow;
var orderList = [];
var scanDelay;

var marketItems = document.getElementsByClassName("market_listing_row market_recent_listing_row");
for (marketItem of marketItems) {
	if (marketItem.id.includes("mybuyorder_") && window.getComputedStyle(marketItem).display === "block") {
		orderList.push(marketItem);
	}
}

if (orderList.length == 0) {
	alert("Looks like you have not buy orders or not logined!");
	throw 'error: no orders or not logined.';
}

var myBuyOrders = document.getElementsByClassName("my_market_header_active")[1];

chrome.storage.sync.get(['cancelHighOrdersSLS'], function (result) {
	cancelHigh = result.cancelHighOrdersSLS;
	chrome.storage.sync.get(['cancelLowOrdersSLS'], function (result) {
		cancelLow = result.cancelLowOrdersSLS;
		chrome.storage.sync.get(["autoScanOrdersSLS"], function (result) {
			var autoScan = result.autoScanOrdersSLS;
			chrome.storage.sync.get(["scanButtonSLS"], function (result) {
				if (result.scanButtonSLS == "stop scan") {
					if (autoScan == false) {
						myBuyOrders.innerText = "My buy orders (scanning)";
						orderList[0].scrollIntoView({
							block: 'center',
							behavior: 'smooth'
						});
						checkOrders();
						onbeforeunload = function () {
							return "";
						};
					} else {
						chrome.storage.sync.get(["autoScanOrdersDelaySLS"], function (result) {
							scanDelay = result.autoScanOrdersDelaySLS;
							myBuyOrders.innerText = "My buy orders (scanning)";
							autoCheckOrders();
							onbeforeunload = function () {
								return "";
							};
						})
					}
				} else {
					myBuyOrders.innerText = "My buy orders (scan stopped)";
				}
			})
		});
	});
});

//-------> ф-я скана <-------//
async function checkOrders() {

	console.log('%c ▼ single scan start ▼ ', 'background: #000000; color: #FFD700');

	for (order of orderList) {
		order.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
	}
	for (order of orderList) {

		if (myBuyOrders.innerText == "My buy orders (scan stopped)") {
			break;
		}

		var buy_orderid = order.id.substring(11);
		var orderHref = order.getElementsByClassName('market_listing_item_name_link')[0].href;
		var orderHash = order.getElementsByClassName('market_listing_item_name_link')[0].innerText;
		var orderPrice = order.getElementsByClassName('market_listing_price')[0].innerText.replace(/\D+/g, '');
		var sourceCode;
		async function getSource() {
			sourceCode = await httpGet(orderHref);
		}
		await retryOnFail(8, 15000, getSource);

		var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', '</span>').map(s => s.replace(/\D+/g, '') * 1).filter(Number);
		var steamPrice = tenPrices.reduce((a, b) => a + b, 0) / tenPrices.length;

		if (orderPrice > steamPrice) {

			// удаляем ордер если завышен
			if (cancelHigh == true) {

				$.post('//steamcommunity.com/market/cancelbuyorder/', {
					sessionid: getSessionId,
					buy_orderid
				});

				await new Promise(done => setTimeout(() => done(), 1000));
			}

			order.style.backgroundColor = "#4C1C1C"; //меняем цвет ордера на красный
			console.log(`${orderHref} | price: ${orderPrice / 100}`);

		} else if (orderPrice < steamPrice * 0.75) {

			// удаляем ордер если занижен
			if (cancelLow == true) {

				$.post('//steamcommunity.com/market/cancelbuyorder/', {
					sessionid: getSessionId,
					buy_orderid
				});
				await new Promise(done => setTimeout(() => done(), 1000));
			}

			order.style.backgroundColor = "#4C471C";

		} else {
			order.style.backgroundColor = "#1C4C1C";
		}
		await new Promise(done => setTimeout(() => done(), 100));
	}

	console.log('%c ■  single scan end  ■ ', 'background: #000000; color: #FFD700');
	chrome.storage.sync.set({
		scanButtonSLS: "start scan"
	});
}

//-------> ф-я автоскана <-------//
async function autoCheckOrders() {

	console.log('%c ▼ auto scan start ▼ ', 'background: #000000; color: #FFD700');
	var myListings = JSON.parse(await httpGet("https://steamcommunity.com/market/mylistings/?norender=1"));
	var orderList = myListings.buy_orders;

	if (orderList.length > 0) {
		for (order of orderList) {

			if (myBuyOrders.innerText == "My buy orders (scan stopped)") {
				console.log('%c ■  auto scan end  ■ ', 'background: #000000; color: #FFD700');
				return;
			}

			var appid = order.appid;
			var buy_orderid = order.buy_orderid;
			var hash_name = order.hash_name;
			var orderHref = `https://steamcommunity.com/market/listings/${appid}/${hash_name}`;
			var orderPrice = order.price;
			var sourceCode;
			//alert(orderHref);
			async function getSource() {
				sourceCode = await httpGet(orderHref);
			}
			await retryOnFail(6, 30000, getSource);

			var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', "</span>").map(s => s.replace(/\D+/g, "") * 1).filter(Number);
			var steamPrice = tenPrices.reduce((a, b) => a + b, 0) / tenPrices.length;

			if (orderPrice > steamPrice) {
				// удаляем ордер если завышен
				$.post("//steamcommunity.com/market/cancelbuyorder/", {
					sessionid: getSessionId,
					buy_orderid
				});

				console.log(`${orderHref} | price: ${orderPrice / 100}`);
				await new Promise(done => setTimeout(() => done(), 1000));
			}
			await new Promise(done => setTimeout(() => done(), Math.floor(Math.random() * (+2000 - +1000)) + +1000));
		}
	}

	setTimeout(autoCheckOrders, scanDelay * 60000);
}


//ф-я получения айди сессии
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

//ф-я получения кода странницы
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


//ф-я нахождения строк между строк
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

//ф-я повторений
async function retryOnFail(attempts, delay, fn) {
	return await fn().catch(async function (err) {
		if (attempts <= 0) {
			alert("Error! Scan stopped.");
			chrome.storage.sync.set({
				scanButtonSLS: "start scan"
			});
			throw err;
		}
		await new Promise(done => setTimeout(() => done(), delay));
		return retryOnFail(attempts - 1, delay, fn);
	});
}