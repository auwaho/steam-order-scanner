if (document.URL != "https://steamcommunity.com/market/") {
	alert("Go to the Steam Community Market page!");
	throw 'stop';
}

var cancelHigh;
var cancelLow;
var orderList = [];

var marketItems = document.getElementsByClassName("market_listing_row market_recent_listing_row");
for (marketItem of marketItems) {
	if (marketItem.id.includes("mybuyorder_") && window.getComputedStyle(marketItem).display === "block") {
		orderList.push(marketItem);
	}
}

if (orderList.length == 0) {
	alert("Looks like you have not buy orders or not logined!");
	throw 'stop';
}

chrome.storage.sync.get(['cancelHighOrdersSLS'], function (result) {
	cancelHigh = result.cancelHighOrdersSLS;
	chrome.storage.sync.get(['cancelLowOrdersSLS'], function (result) {
		cancelLow = result.cancelLowOrdersSLS;
		checkOrders();
	});
});


//основная ф-я скана
async function checkOrders() {
	
	var checkedList = "";

	for (order of orderList) {

		var buy_orderid = order.id.substring(11);
		var orderHref = order.getElementsByClassName('market_listing_item_name_link')[0].href;
		var orderHash = order.getElementsByClassName('market_listing_item_name_link')[0].innerText;
		var orderPrice = order.getElementsByClassName('market_listing_price')[0].innerText.replace(/\D+/g, '');
		var sourceCode;
		async function getSource() {
			sourceCode = await httpGet(orderHref);
		}
		await retryOnFail(6, 10000, getSource);

		var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', '</span>').map(s => s.replace(/\D+/g, '') * 1).filter(Number);
		var steamPrice = tenPrices.reduce((a, b) => a + b, 0) / tenPrices.length;

		if (orderPrice > steamPrice) {

			// удаляем ордер если завышен
			if (cancelHigh == true) {

				$.post('//steamcommunity.com/market/cancelbuyorder/', {
					sessionid: getSessionId,
					buy_orderid
				});

				await new Promise(done => setTimeout(() => done(), 1000)); // короткая пауза после удаления ордера
			}

			order.style.backgroundColor = "#4C1C1C"; //меняем цвет ордера на красный

		} else if (orderPrice < steamPrice * 0.75) {

			// удаляем ордер если занижен
			if (cancelLow == true) {

				$.post('//steamcommunity.com/market/cancelbuyorder/', {
					sessionid: getSessionId,
					buy_orderid
				});

				await new Promise(done => setTimeout(() => done(), 1000)); // короткая пауза после удаления ордера
				checkedList += (`<a href="${orderHref}" target="_blank">${orderHash}</a></br>`);
			}

			order.style.backgroundColor = "#4C471C"; //меняем цвет ордера на оранжевый 

		} else {

			order.style.backgroundColor = "#1C4C1C"; //меняем цвет ордера на зеленый
			//order.style.backgroundImage = "linear-gradient(to right, #1C4C1C, #1b2838)"; //меняем цвет ордера на красный
		}
	}
	
	var slsWindow = window.open();
	slsWindow.document.write(checkedList);
	slsWindow.document.title = "Bad orders";
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
			alert("Ошибка подключения");
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
		// first check to see if we do have both substrings
		if (this.string.indexOf(sub1) < 0 || this.string.indexOf(sub2) < 0) return;

		// find one result
		var result = this.getFromBetween(sub1, sub2);
		// push it to the results array
		this.results.push(result);
		// remove the most recently found one from the string
		this.removeFromBetween(sub1, sub2);

		// if there's more substrings
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
			alert("Ошибка!");
			throw err;
		}
		await new Promise(done => setTimeout(() => done(), delay));
		return retryOnFail(attempts - 1, delay, fn);
	});
}