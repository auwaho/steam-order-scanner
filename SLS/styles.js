//добавляем цены с учетом комиссии на странницах лотов
const style = document.createElement("style");
style.innerHTML = `
  .market_listing_price_without_fee {
    display: block;
    color: gray;
    }
`;
document.head.appendChild(style);

//дабавляем в таблицу ордеры
chrome.storage.sync.get(["showMoreOrdersSLS"], function (result) {
  if (result.showMoreOrdersSLS == true) {
    //ф-я нахождения строки
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

    var showQnt;
    chrome.storage.sync.get(["showMoreOrdersQntSLS"], function (result) {
      showQnt = result.showMoreOrdersQntSLS;
    });

    $("#market_buyorder_info_show_details").hide();
    $("#market_buyorder_info_details").show();

    const source = document.documentElement.outerHTML;
    const item_nameid = source.extract("Market_LoadOrderSpread( ", " );");
    const url = window.location.protocol + `//steamcommunity.com/market/itemordershistogram?country=USA&language=english&currency=1&two_factor=0&item_nameid=${item_nameid}`;
    //const cunrrencies = JSON.parse('{"1": "$","2": "\u00a3","3": "\u20ac","4": "CHF","5": "p\u0443\u0431","6": "z\u0142","7": "R$","8": "\u00a5","9": "kr","10": "Rp","11": "RM","12": "P","13": "S$","14": "\u0e3f","15": "\u20ab","16": "\u20a9","17": "TL","18": "\u20b4","19": "Mex$","20": "CDN$","21": "A$","22": "NZ$","23": "\u00a5","24": "\u20b9","25": "CLP$","26": "S","27": "COL$","28": "R","29": "HK$","30": "NT$","31": "SR","32": "AED","34": "ARS$","35": "\u20aa","37": "\u20b8","38": "KD","39": "QR","40": "\u20a1","41": "$U"}');

    var qntSumm = 0;
    var tableRows = `
      <tr>
        <th align="right">Price</th>
        <th align="right">Quantity</th>
      </tr>
    `;

    async function table() {
      const histogram = await httpGet(url);
      const parsed = JSON.parse(histogram);
      const buyQnt = parsed.buy_order_graph.length;

      for (let i = 0; i < showQnt; i++) {
        if (i >= buyQnt) {
          break;
        }
        var prc = (parsed.buy_order_graph[i] + "").extract("", ",");
        var qnt = (parsed.buy_order_graph[i] + "").extract(",", ",");
        var row = `
          <tr>
            <td align="right" class="">$${parseFloat(prc).toFixed(2)}</td>
            <td align="right">${qnt - qntSumm}</td>
          </tr>
        `;
        qntSumm = qnt;
        tableRows += row;
      }

      document.getElementById("market_commodity_buyreqeusts_table").outerHTML = `
        <table class="market_commodity_orders_table">
          <tbody>
            ${tableRows}
          </tbody>
        </table> 
      `;
    }

    table();
  }
});