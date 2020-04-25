<p align="center">
  <img width="128" height="128" src="https://github.com/auwaho/steam-order-scanner/blob/master/logo.png">
</p>
<h1 align="center">Steam Order Scanner</h1>

<h3 align="center">
  <a href="https://github.com/auwaho/steam-order-scanner/releases/download/1.3.4/SORS.zip">Direct dowload link</a>
</h3>

**Note: I highly recommend starting the first scan without any cancel order marks, just to make sure the extension works correctly in your case. It was also noted that any extensions that modify the content on the market page may lead to incorrect extension work. Just make sure the market page is fully loaded before scanning.**

## Supporting the Project

<p>Here you can support the project, motivate the author to devote more time to the introduction of new functions and the more frequent release of updates, or simply satisfy the needs of an avid coffee lover.</p>
<a href="https://www.buymeacoff.ee/auwaho"><img width="200" src="https://i.imgur.com/C0cuR5r.png"></a>


## Description

Steam Order Scanner (SORS) is a Google Chrome browser extension which main function is to scan your Steam Community Market orders for their relevance, as well as their cancellation if necessary. The extension also adds some useful functionality to the Market pages. More interesting features coming soon, wait for updates!

![alt text](https://github.com/auwaho/steam-order-scanner/blob/master/screenshot.png "Steam Listings Scanner")

#### Extension functions for now: 
- **scanning for relevance** your buy order list (individual listings/commodity type items). Marks each order with color (**green = ok**, **yellow = too low** (as set in popup window), **red = overpriced**)
- **cancelling** overpriced or too low orders
- displaying **"market_listing_price_without_fee"** under the price of each lot on the item page
- ability to show **more buy orders and sales** (for commodity type items) on the item page. Quantity sets up in the popup window
- ability to show the **number of lots purchased** out of set number in each order (click on the number of orders in brackets right after "My buy orders")
- **autoscan (experimental)**. Scans your order list with set interval. **Always cancels** overpriced orders. Doesn't cancel too low orders.

The extension changes the color of the text “My Buy Orders” to gold when scanning starts and back to white when scanning is completed.

## License

Copyright (c) 2020 Artem Hryhorov

This software is released under the terms of the GNU General Public License v3.0.
See the [LICENSE](LICENSE) file for further information.
