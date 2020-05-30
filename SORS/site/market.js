var orderList = document.getElementsByClassName("market_listing_right_cell market_listing_my_price market_listing_buyorder_qty");
if (orderList.length > 1) {

    addQnt();

    var observer = new MutationObserver(function () {
        orderList = document.getElementsByClassName("market_listing_right_cell market_listing_my_price market_listing_buyorder_qty");
        if (!orderList[1].innerText.includes("/")) {
            addQnt();
        }
    });

    observer.observe(orderList[0], {
        attributes: true,
        childList: true,
        characterData: true
    });

    async function addQnt() {

        try {
            var myList = JSON.parse(await httpGet("//steamcommunity.com/market/mylistings/?norender=1"));

            var ordersSum = 0;
            var listingsSum = 0;
            var listingsFee = 0;
            var listingsQty = myList.total_count;

            for (let i = 1; i < orderList.length; i++) {
                ordersSum += myList.buy_orders[i - 1].price / 100 * myList.buy_orders[i - 1].quantity_remaining;
                var newQnt = `${myList.buy_orders[i-1].quantity_remaining} / ${myList.buy_orders[i-1].quantity}`;
                orderList[i].innerHTML = `<span class="market_table_value"><span class="market_listing_price">${newQnt}</span></span>`;
            }
            for (let x = 0; x < listingsQty; x+=10) {
                if (x==0){
                    for (let i = 0; i < myList.listings.length; i++){
                        listingsSum += myList.listings[i].converted_price;
                        listingsFee += myList.listings[i].converted_fee;
                    }
                } else {
                    var nextPage = JSON.parse(await httpGet(`//steamcommunity.com/market/mylistings/?norender=1&start=${x}`));
                    for (let i = 0; i < nextPage.listings.length; i++){
                        listingsSum += nextPage.listings[i].converted_price;
                        listingsFee += nextPage.listings[i].converted_fee;
                    }
                }
            }
            my_market_buylistings_number.innerHTML = `QTY: <b>${my_market_buylistings_number.innerHTML}</b> / SUM: <b>${parseFloat(ordersSum).toFixed(2)}</b>`;
            my_market_selllistings_number.innerHTML = `QTY: <b>${listingsQty}</b> / SUM: <b>${parseFloat((listingsSum+listingsFee)/100).toFixed(2)}</b> / SWF: <b>${parseFloat(listingsSum/100).toFixed(2)}</b>`;
        } catch (e) {
            //console.log(e);
        }
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

}