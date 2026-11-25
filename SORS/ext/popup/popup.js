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

const inputs = [...document.querySelectorAll('.settings input')]

function showSetting(input, value) {
    if (value === undefined) return
    if (input.type === 'checkbox') input.checked = value
    else input.value = value
}

void chrome.storage.local.get(inputs.map(({ id }) => `${id}SORS`)).then((stored) => {
    for (const input of inputs) showSetting(input, stored[`${input.id}SORS`])
})

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return
    for (const input of inputs) {
        const change = changes[`${input.id}SORS`]
        if (change) showSetting(input, change.newValue)
    }
})

for (const input of inputs) {
    input.addEventListener('change', () => {
        const key = `${input.id}SORS`
        if (input.type === 'checkbox') {
            void chrome.storage.local.set({ [key]: input.checked })
            return
        }

        const parsed = Number.parseFloat(input.value)
        const value = Math.min(Number(input.max), Math.max(Number(input.min),
            Number.isFinite(parsed) ? parsed : Number(input.placeholder)))
        input.value = value
        void chrome.storage.local.set({ [key]: value })
    })
}
