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
    'cancelHighOrdersSLS',
    'cancelLowOrdersSLS',
    'showMoreOrdersSLS',
    'showMoreOrdersQntSLS',
    'autoScanOrdersSLS',
    'autoScanOrdersDelaySLS',
    'highOrdersPctSLS',
    'lowOrdersPctSLS',
    'timeoutPerOrderSLS',
    'pauseWhenErrorsSLS',
    'scanButtonSLS'
  ],
  function (result) {
    cancelHighOrders.checked = result.cancelHighOrdersSLS;
    cancelLowOrders.checked = result.cancelLowOrdersSLS;
    showMoreOrders.checked = result.showMoreOrdersSLS;
    showMoreOrdersQnt.value = result.showMoreOrdersQntSLS;
    autoScanOrders.checked = result.autoScanOrdersSLS;
    autoScanOrdersDelay.value = result.autoScanOrdersDelaySLS;
    highOrdersPct.value = result.highOrdersPctSLS;
    lowOrdersPct.value = result.lowOrdersPctSLS;
    timeoutPerOrder.value = result.timeoutPerOrderSLS;
    pauseWhenErrors.value = result.pauseWhenErrorsSLS;
    scanButton.innerText = result.scanButtonSLS;

    if (result.scanButtonSLS == 'stop scan') {
      autoScanOrders.disabled = true;
    }

    // turn off button everywhere except steam market page
    chrome.tabs.query({
      'active': true,
      'lastFocusedWindow': true
    }, function (tabs) {
      if (tabs[0].url == 'https://steamcommunity.com/market/' || tabs[0].url == 'https://steamcommunity.com/market' || result.autoScanOrdersSLS == true) {
        scanButton.disabled = false;
      }
    });
  }
);

// update button text if ext window open while scan ends
chrome.storage.onChanged.addListener(function (changes, namespace) {
  if (namespace == 'local' && 'scanButtonSLS' in changes) {
    if (changes.scanButtonSLS.newValue == 'start scan') {

      scanButton.innerText = 'start scan';
      autoScanOrders.disabled = false;

      if (autoScanOrders.checked == true) {
        chrome.storage.local.set({
          runAutoScanSLS: false
        });
      }

    } else {

      if (autoScanOrders.checked == false) {
        chrome.tabs.executeScript({
          file: 'site/scanner.js'
        });
      } else {
        chrome.storage.local.set({
          runAutoScanSLS: true
        });
      }

      scanButton.innerText = 'stop scan';
      autoScanOrders.disabled = true;

    }
  }
});

// update settings onchange
cancelHighOrders.addEventListener('change', e => {
  if (e.target.checked) {
    chrome.storage.local.set({
      cancelHighOrdersSLS: true
    });
  } else {
    chrome.storage.local.set({
      cancelHighOrdersSLS: false
    });
  }
});
cancelLowOrders.addEventListener('change', e => {
  if (e.target.checked) {
    chrome.storage.local.set({
      cancelLowOrdersSLS: true
    });
  } else {
    chrome.storage.local.set({
      cancelLowOrdersSLS: false
    });
  }
});
showMoreOrders.addEventListener('change', e => {
  if (e.target.checked) {
    chrome.storage.local.set({
      showMoreOrdersSLS: true
    });
  } else {
    chrome.storage.local.set({
      showMoreOrdersSLS: false
    });
  }
});
showMoreOrdersQnt.addEventListener('change', () => {
  chrome.storage.local.set({
    showMoreOrdersQntSLS: showMoreOrdersQnt.value
  });
});
autoScanOrders.addEventListener('change', e => {
  if (e.target.checked) {
    chrome.storage.local.set({
      autoScanOrdersSLS: true
    });
    scanButton.disabled = false;
  } else {
    chrome.storage.local.set({
      autoScanOrdersSLS: false
    });
    chrome.tabs.query({
      'active': true,
      'lastFocusedWindow': true
    }, function (tabs) {
      if (tabs[0].url == 'https://steamcommunity.com/market/' || tabs[0].url == 'https://steamcommunity.com/market') {
        scanButton.disabled = false;
      } else {
        scanButton.disabled = true;
      }
    });
  }
});
autoScanOrdersDelay.addEventListener('change', () => {
  chrome.storage.local.set({
    autoScanOrdersDelaySLS: autoScanOrdersDelay.value
  });
});
highOrdersPct.addEventListener('change', () => {
  chrome.storage.local.set({
    highOrdersPctSLS: highOrdersPct.value
  });
});
lowOrdersPct.addEventListener('change', () => {
  chrome.storage.local.set({
    lowOrdersPctSLS: lowOrdersPct.value
  });
});
timeoutPerOrder.addEventListener('change', () => {
  chrome.storage.local.set({
    timeoutPerOrderSLS: timeoutPerOrder.value
  });
});
pauseWhenErrors.addEventListener('change', () => {
  chrome.storage.local.set({
    pauseWhenErrorsSLS: pauseWhenErrors.value
  });
});
scanButton.addEventListener('click', () => {
  chrome.storage.local.get('scanButtonSLS', function (result) {
    chrome.storage.local.set({
      scanButtonSLS: result.scanButtonSLS == 'start scan' ? 'stop scan' : 'start scan'
    });
  });
  scanButton.disabled = true;
  setTimeout(() => {
    scanButton.disabled = false;
  }, 500);
});