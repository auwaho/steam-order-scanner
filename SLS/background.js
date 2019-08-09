//дефолтные настройки
chrome.storage.sync.get(["cancelHighOrdersSLS"], function (result) {
  if (typeof result.cancelHighOrdersSLS == "undefined") {
    chrome.storage.sync.set({
      cancelHighOrdersSLS: false
    });
  }
});
chrome.storage.sync.get(["cancelLowOrdersSLS"], function (result) {
  if (typeof result.cancelLowOrdersSLS == "undefined") {
    chrome.storage.sync.set({
      cancelLowOrdersSLS: false
    });
  }
});
chrome.storage.sync.get(["showMoreOrdersSLS"], function (result) {
  if (typeof result.showMoreOrdersSLS == "undefined") {
    chrome.storage.sync.set({
      showMoreOrdersSLS: true
    });
  }
});
chrome.storage.sync.get(["showMoreOrdersQntSLS"], function (result) {
  if (typeof result.showMoreOrdersQntSLS == "undefined") {
    chrome.storage.sync.set({
      showMoreOrdersQntSLS: 20
    });
  }
});
chrome.storage.sync.get(["autoScanOrdersSLS"], function (result) {
  if (typeof result.autoScanOrdersSLS == "undefined") {
    chrome.storage.sync.set({
      autoScanOrdersSLS: false
    });
  }
});
chrome.storage.sync.get(["autoScanOrdersDelaySLS"], function (result) {
  if (typeof result.autoScanOrdersDelaySLS == "undefined") {
    chrome.storage.sync.set({
      autoScanOrdersDelaySLS: 20
    });
  }
});

//автоснятие неактуальных ордеров
chrome.storage.sync.get(["autoScanOrdersSLS"], function (result) {
  if (result.autoScanOrdersSLS == true) {
    chrome.storage.sync.get(["autoScanOrdersDelaySLS"], function (result) {
      var scanDelay = result.autoScanOrdersDelaySLS;
      startScan();
      var slsWindow = window.open();

      async function startScan() {
        var myListings = JSON.parse(await httpGet("https://steamcommunity.com/market/mylistings/?norender=1"));
        var orderList = myListings.buy_orders;

        if (orderList.length > 0) {
          for (order of orderList) {
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
            await retryOnFail(6, 10000, getSource);

            var tenPrices = getFromBetween.get(sourceCode, '<span class="market_listing_price market_listing_price_without_fee">', "</span>").map(s => s.replace(/\D+/g, "") * 1).filter(Number);
            var steamPrice = tenPrices.reduce((a, b) => a + b, 0) / tenPrices.length;

            if (orderPrice > steamPrice) {
              // удаляем ордер если завышен
              /*$.post("https://steamcommunity.com/market/cancelbuyorder/", {
                sessionid: getSessionId,
                buy_orderid
              });*/
              await new Promise(done => setTimeout(() => done(), 1000)); // короткая пауза после удаления ордера
              slsWindow.document.write(`<a href="${orderHref}" target="_blank">${hash_name}</a></br>`);
            }
          }
        }
        slsWindow.document.write("--------------------------------------------</br>");
        setTimeout(startScan, scanDelay * 60000);
      }

      //ф-я получения айди сессии
      function getSessionId() {
        var jsId = document.cookie.match(/sessionid=[^;]+/);
        if (jsId != null) {
          if (jsId instanceof Array) jsId = jsId[0].substring(10);
          else jsId = jsId.substring(10);
        }
        return jsId;
      }

      //ф-я получения кода странницы
      function httpGet(url) {
        return new Promise(function (resolve, reject) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, true);
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
          if (this.string.indexOf(sub1) < 0 || this.string.indexOf(sub2) < 0)
            return false;
          var SP = this.string.indexOf(sub1) + sub1.length;
          var string1 = this.string.substr(0, SP);
          var string2 = this.string.substr(SP);
          var TP = string1.length + string2.indexOf(sub2);
          return this.string.substring(SP, TP);
        },
        removeFromBetween: function (sub1, sub2) {
          if (this.string.indexOf(sub1) < 0 || this.string.indexOf(sub2) < 0)
            return false;
          var removal = sub1 + this.getFromBetween(sub1, sub2) + sub2;
          this.string = this.string.replace(removal, "");
        },
        getAllResults: function (sub1, sub2) {
          // first check to see if we do have both substrings
          if (this.string.indexOf(sub1) < 0 || this.string.indexOf(sub2) < 0)
            return;

          // find one result
          var result = this.getFromBetween(sub1, sub2);
          // push it to the results array
          this.results.push(result);
          // remove the most recently found one from the string
          this.removeFromBetween(sub1, sub2);

          // if there's more substrings
          if (
            this.string.indexOf(sub1) > -1 &&
            this.string.indexOf(sub2) > -1
          ) {
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
    });
  }
});