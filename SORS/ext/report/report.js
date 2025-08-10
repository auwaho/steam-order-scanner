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

chrome.storage.local.get(
    [
        'scanEndTimeSORS',
        'scanPrefSuffSORS',
        'scanTableBadSORS',
        'scanTableFstSORS',
        'scanProgressSORS',
        'scanErrorSORS'
    ],
    function (result) {
        lastScan.innerText = result.scanEndTimeSORS
        progress.style.color = result.scanErrorSORS ? 'red' : '#0075ff'
        progress.style.width = `${result.scanProgressSORS}%`
        // progress.style.transition = 'width 2s';

        const pref = JSON.parse(`"${result.scanPrefSuffSORS[0]}"`)
        const suff = JSON.parse(`"${result.scanPrefSuffSORS[1]}"`)

        result.scanTableBadSORS.forEach((e, i) => {
            // e[appId, hashName, tdOrder, tdOrderBEP, tdMarket, tdMarketWithFee]
            const profit = pref + (e[4] - e[2]).toFixed(2) + suff
            const profitPercent = parseInt(100 - (e[2] / e[4]) * 100)

            document.getElementById('badOrd').innerHTML += `
            <tr>
            <th scope="row">${i + 1}</th>
            <td><a href="https://steamcommunity.com/market/search?appid=${e[0]}" target="_blank">${e[0]}</a></td>
            <td><a href="https://steamcommunity.com/market/listings/${e[0]}/${encodeURIComponent(
                e[1]
            )}" target="_blank">${e[1]}</a></td>
            <td>${e[6] == true ? '+' : '-'}</td>
            <td data-sort="${e[2]}">
                ${pref + e[2] + suff}
                <span title="Break-even point.">(${pref + e[3] + suff})</span>
            </td>
            <td data-sort="${e[5]}">
                ${pref + e[5] + suff}
                <span title="This is how much you will receive.">(${pref + e[4] + suff})</span>
            </td>
            <td data-sort="${profitPercent}">
                ${profitPercent}%
                <span title="Net profit.">(${profit})</span>
            </td>
            </tr>
            `
        })
    }
)

chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace == 'local' && 'scanEndTimeSORS' in changes) {
        lastScan.innerText = changes.scanEndTimeSORS.newValue
    }
    if (namespace == 'local' && 'scanProgressSORS' in changes) {
        progress.style.width = `${changes.scanProgressSORS.newValue}%`
    }
    if (namespace == 'local' && 'scanErrorSORS' in changes) {
        progress.style.color = changes.scanErrorSORS.newValue ? 'red' : '#0075ff'
    }
})
