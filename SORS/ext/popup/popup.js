/*
  Steam Order Scanner - a browser extension for Steam Community Market 
  that helps keep your orders profitable.
  Copyright (C) 2020 Artem Hryhorov
  
  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see {http://www.gnu.org/licenses/}.

  Home: https://github.com/auwaho/steam-order-scanner
*/

// load extension settings
chrome.storage.local.get(
    [
        'scanButtonSORS',
        'cancelHighOrdersSORS',
        'cancelHighPercentSORS',
        'cancelFirstOrdersSORS',
        'pauseOnErrorsSORS',
        'delayPerOrderSORS',
        'delayRandomSORS',
        'showMoreOrdersSORS',
        'showMoreOrdersQtySORS'
    ],
    function (result) {
        showScanState(result.scanButtonSORS)
        cancelHighOrders.checked = result.cancelHighOrdersSORS
        cancelHighPercent.value = result.cancelHighPercentSORS
        cancelFirstOrders.checked = result.cancelFirstOrdersSORS
        pauseOnErrors.value = result.pauseOnErrorsSORS
        delayPerOrder.value = result.delayPerOrderSORS
        delayRandom.value = result.delayRandomSORS
        showMoreOrders.checked = result.showMoreOrdersSORS
        showMoreOrdersQty.value = result.showMoreOrdersQtySORS

    }
)

function isBuyOrdersPage(url) {
    return /^https:\/\/steamcommunity\.com\/market\/buyorders\/?(?:[?#]|$)/.test(url)
}

async function showScanState(state) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    scanButton.innerText = state
    scanButton.dataset.active = state === 'stop'
    scanButton.disabled = state !== 'stop' && !isBuyOrdersPage(tab?.url)
}

// update button text if ext window open while scan ends
chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace == 'local' && 'scanButtonSORS' in changes) {
        showScanState(changes.scanButtonSORS.newValue)
    }
})

// update settings onchange
document.querySelectorAll('input').forEach((el) => {
    el.addEventListener('change', () => {
        if (el.type == 'number') {
            let value = parseFloat(el.value) || parseFloat(el.placeholder)
            if (value > parseFloat(el.max)) value = parseFloat(el.max)
            if (value < parseFloat(el.min)) value = parseFloat(el.min)

            el.value = value
            chrome.storage.local.set({ [`${el.id}SORS`]: value })
        }

        if (el.type == 'checkbox') {
            chrome.storage.local.set({ [`${el.id}SORS`]: el.checked })
        }
    })
})

scanButton.addEventListener('click', async () => {
    scanButton.disabled = true
    const { scanButtonSORS } = await chrome.storage.local.get('scanButtonSORS')
    if (scanButtonSORS === 'stop') {
        await chrome.storage.local.set({ scanButtonSORS: 'start' })
        return
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!isBuyOrdersPage(tab?.url)) return

    try {
        await chrome.storage.local.set({ scanButtonSORS: 'stop' })
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['site/scanner.js'] })
    } catch (error) {
        console.error('Steam Order Scanner: could not start scan', error)
        await chrome.storage.local.set({ scanButtonSORS: 'start', scanErrorSORS: true })
    }
})
