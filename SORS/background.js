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

// Initialize default values for all chrome.storage.local keys used in the project
const DEFAULTS = {
    // popup + scanner options
    scanButtonSORS: 'start',
    cancelHighOrdersSORS: false,
    cancelHighPercentSORS: 0,
    cancelFirstOrdersSORS: false,
    pauseOnErrorsSORS: 2,
    delayPerOrderSORS: 200,
    delayRandomSORS: 50,
    showMoreOrdersSORS: true,
    showMoreOrdersQtySORS: 20,

    // scanner/runtime state
    scanProgressSORS: 0,
    scanTableBadSORS: [],
    scanTableFstSORS: [],
    scanEndTimeSORS: 'N/A',
    scanPrefSuffSORS: ['', ''],
    scanErrorSORS: false
}

function ensureDefaultsInitialized() {
    const keys = Object.keys(DEFAULTS)
    chrome.storage.local.get(keys, (current) => {
        const toInit = {}
        for (const key of keys) {
            if (current[key] === undefined) {
                toInit[key] = DEFAULTS[key]
            }
        }
        if (Object.keys(toInit).length) {
            chrome.storage.local.set(toInit)
        }
    })
}

chrome.runtime.onInstalled.addListener(() => {
    ensureDefaultsInitialized()
})

chrome.runtime.onStartup.addListener(() => {
    ensureDefaultsInitialized()
})
