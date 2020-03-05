# Steam Listings Scanner
Google Chrome extension for Steam Community Market's work simplifying and semi-automating.

**The extension scans only individual listings. Commodity type items are skipped. I will release an update when I have time.**

![alt text](https://github.com/auwaho/SteamListingsScanner/blob/master/screenshot.png "Steam Listings Scanner")

#### Extension functions for now: 
- scanning for relevance your buy order list. Marks each order with color (green = good, yellow = too low (as set in popup window), red = overpriced)
- cancelling overpriced or too low orders
- displaying "market_listing_price_without_fee" under the price of each lot on the item page
- ability to show more buy orders on the item page. Quantity sets up in the popup window
- ability to show the number of lots purchased out of set number in each order (click on the number of orders in brackets right after "My buy orders")
- autoscan (experimental & shitty). Scans your order list with set interval. ALWAYS cancels overpriced orders. Doesn't cancel too low orders.

### [Download link](https://github.com/auwaho/SteamListingsScanner/releases/download/v1.0/SLS.zip)

**Note: I highly recommend starting the first scan without any cancel order marks, just to make sure the extension works correctly in your case. It was also noted that any extensions that modify the content on the market page may lead to incorrect scan results. Just make sure the market page is fully loaded before scanning.**

