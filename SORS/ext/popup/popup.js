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
        scanButton.innerText = result.scanButtonSORS
        cancelHighOrders.checked = result.cancelHighOrdersSORS
        cancelHighPercent.value = result.cancelHighPercentSORS
        cancelFirstOrders.checked = result.cancelFirstOrdersSORS
        pauseOnErrors.value = result.pauseOnErrorsSORS
        delayPerOrder.value = result.delayPerOrderSORS
        delayRandom.value = result.delayRandomSORS
        showMoreOrders.checked = result.showMoreOrdersSORS
        showMoreOrdersQty.value = result.showMoreOrdersQtySORS

        scanButton.dataset.active = result.scanButtonSORS == 'stop'

        // turn off button everywhere except steam market page
        chrome.tabs.query(
            {
                active: true,
                lastFocusedWindow: true
            },
            function (tabs) {
                if (
                    tabs[0].url == 'https://steamcommunity.com/market/' ||
                    tabs[0].url == 'https://steamcommunity.com/market'
                ) {
                    scanButton.disabled = false
                }
            }
        )
    }
)

// update button text if ext window open while scan ends
chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace == 'local' && 'scanButtonSORS' in changes) {
        if (changes.scanButtonSORS.newValue == 'start') {
            scanButton.innerText = 'start'
            scanButton.dataset.active = false
        } else {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                const currTab = tabs[0]
                if (currTab) {
                    chrome.scripting.executeScript({
                        target: { tabId: currTab.id, allFrames: true },
                        files: ['site/scanner.js']
                    })
                }
            })

            scanButton.innerText = 'stop'
            scanButton.dataset.active = true
        }
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

scanButton.addEventListener('click', () => {
    chrome.storage.local.get('scanButtonSORS', function (result) {
        chrome.storage.local.set({
            scanButtonSORS: result.scanButtonSORS == 'start' ? 'stop' : 'start'
        })
    })
    scanButton.disabled = true
    setTimeout(() => {
        scanButton.disabled = false
    }, 500)
})
