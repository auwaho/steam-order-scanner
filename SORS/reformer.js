// string finding function
String.prototype.extract = function (prefix, suffix) {
  s = this;
  var i = s.indexOf(prefix);
  if (i >= 0) {
    s = s.substring(i + prefix.length);
  } else {
    return "";
  }
  if (suffix) {
    i = s.indexOf(suffix);
    if (i >= 0) {
      s = s.substring(0, i);
    } else {
      return "";
    }
  }
  return s;
};

// source code getting function
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

// for main market page (show remain orders)
if (window.location.href == window.location.protocol + "//steamcommunity.com/market/" || window.location.href == window.location.protocol + "//steamcommunity.com/market") {

  window.onload = function () {
    setTimeout(function () {
      if (document.body.contains(document.getElementById('my_market_buylistings_number')) == true) {
        var qntDiv = document.getElementById('my_market_buylistings_number');
        qntDiv.style.cursor = "pointer";
        qntDiv.title = "Check remaining orders";
        qntDiv.addEventListener("click", addQnt);
      }
    }, 5000);
  };

  async function addQnt() {
    try {
      var orderList = [];
      var marketItems = document.getElementsByClassName("market_listing_row market_recent_listing_row");
      for (marketItem of marketItems) {
        if (marketItem.id.includes("mybuyorder_") && window.getComputedStyle(marketItem).display === "block") {
          orderList.push(marketItem);
        }
      }
      if (orderList.length == 0) {
        throw 'stop';
      }
      var myListingsJson = await httpGet(window.location.protocol + "//steamcommunity.com/market/mylistings/?norender=1");
      var myListings = JSON.parse(myListingsJson);
      for (let i = 0; i < orderList.length; i++) {
        var currentQnt = orderList[i].getElementsByClassName("market_listing_right_cell market_listing_my_price market_listing_buyorder_qty")[0].childNodes[1];
        var newQnt = myListings.buy_orders[i].quantity_remaining + " / " + myListings.buy_orders[i].quantity;
        var newHtml = `<span class="market_listing_price">${newQnt}</span>`;
        currentQnt.innerHTML = newHtml;
      }
    } catch {}
  }
}


// for market items pages
if (window.location.href.indexOf(window.location.protocol + "//steamcommunity.com/market/listings/") != -1) {

  const source = document.documentElement.outerHTML;

  var salesPerDay = 0;
  const salesGraph = JSON.parse(source.extract('var line1=', ';'));
  const dayBefore = Date.parse(salesGraph[salesGraph.length - 1][0]) - 86400000;
  for (let sale = salesGraph.length - 1; sale >= salesGraph.length - 24; sale--) {
    if (Date.parse(salesGraph[sale][0]) > dayBefore) {
      salesPerDay += parseInt(salesGraph[sale][2]);
    } else {
      break;
    }
  }
  const zoomCtrls = document.getElementsByClassName("zoom_controls pricehistory_zoom_controls")[0];
  var salesLabel = document.createElement("label");
  salesLabel.innerHTML = `${salesPerDay} sold in the last 24 hours`.fontcolor('white');
  zoomCtrls.parentNode.insertBefore(salesLabel, zoomCtrls);

  // add prices without fee
  if (document.getElementById("market_commodity_order_spread") == null) {
    const feeStyle = document.createElement("style");
    feeStyle.innerHTML = `
    .market_listing_price_without_fee {
    display: block;
    color: gray;
    }`;
    document.head.appendChild(feeStyle);
  }

  // show more orders and sales if enabled
  chrome.storage.sync.get(["showMoreOrdersSLS"], function (result) {
    if (result.showMoreOrdersSLS == true) {

      var showQnt;
      chrome.storage.sync.get(["showMoreOrdersQntSLS"], function (result) {
        showQnt = result.showMoreOrdersQntSLS;
      });

      if (document.getElementById("market_commodity_order_spread") == null) {
        document.getElementById("market_buyorder_info_show_details").style.display = 'none';
        document.getElementById("market_buyorder_info_details").style.display = 'block';
      }

      const item_nameid = source.extract("Market_LoadOrderSpread( ", " );");
      const currency = source.extract('"wallet_currency":', ',') == '' ? 1 : source.extract('"wallet_currency":', ',');
      const country = source.extract('var g_strCountryCode = "', '"');
      const language = source.extract('var g_strLanguage = "', '"');
      const url = `//steamcommunity.com/market/itemordershistogram?country=${country}&language=${language}&currency=${currency}&item_nameid=${item_nameid}`;

      var qntSumm = 0;
      var tableRows = `
        <tr>
          <th align="right">Price</th>
          <th align="right">Quantity</th>
        </tr>`;

      async function table() {

        const histogram = await httpGet(url);
        const parsed = JSON.parse(histogram);
        const buyQnt = parsed.buy_order_graph.length;
        const sellQnt = parsed.sell_order_graph.length;

        for (let i = 0; i < showQnt; i++) {
          if (i >= buyQnt) {
            break;
          }
          var prc = parsed.buy_order_graph[i][0];
          var qnt = parsed.buy_order_graph[i][1];
          var row = `
          <tr>
            <td align="right" class="">${parsed.price_prefix}${parseFloat(prc).toFixed(2)}${parsed.price_suffix}</td>
            <td align="right">${qnt - qntSumm}</td>
          </tr>`;
          qntSumm = qnt;
          tableRows += row;
        }

        document.getElementById("market_commodity_buyreqeusts_table").outerHTML = `
        <table class="market_commodity_orders_table">
          <tbody>
            ${tableRows}
          </tbody>
        </table>`;

        if (document.getElementById("market_commodity_order_spread") != null) {

          tableRows = `
          <tr>
          <th align="right">Price</th>
          <th align="right">Quantity</th>
          </tr>`;

          qntSumm = 0;

          for (let i = 0; i < showQnt; i++) {
            if (i >= sellQnt) {
              break;
            }
            var prc = parsed.sell_order_graph[i][0];
            var qnt = parsed.sell_order_graph[i][1];
            var row = `
            <tr>
              <td align="right" class="">${parsed.price_prefix}${parseFloat(prc).toFixed(2)}${parsed.price_suffix}</td>
              <td align="right">${qnt - qntSumm}</td>
            </tr>`;
            qntSumm = qnt;
            tableRows += row;
          }

          document.getElementById("market_commodity_forsale_table").outerHTML = `
          <table class="market_commodity_orders_table">
            <tbody>
              ${tableRows}
            </tbody>
          </table>`;
        }

      }

      table();
    }
  });
}