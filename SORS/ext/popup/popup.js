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
const changedBeforeLoad = new Set()
const settingStatus = document.getElementById('settingsStatus')
const quantity = document.getElementById('showMoreOrdersQty')
const showMore = document.getElementById('showMoreOrders')
let initialReadComplete = false

function showStorageError(message) {
    settingStatus.textContent = message
    settingStatus.hidden = !message
}

function showSetting(input, value) {
    if (input.type === 'checkbox') input.checked = value ?? input.defaultChecked
    else input.value = value ?? input.defaultValue
    quantity.disabled = !showMore.checked
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return
    for (const input of inputs) {
        const key = `${input.id}SORS`
        const change = changes[key]
        if (!initialReadComplete && change) changedBeforeLoad.add(key)
        if (change) showSetting(input, change.newValue)
    }
})

void chrome.storage.local.get(inputs.map(({ id }) => `${id}SORS`)).then((stored) => {
    for (const input of inputs) {
        const key = `${input.id}SORS`
        if (!changedBeforeLoad.has(key)) showSetting(input, stored[key])
    }
}).catch(() => {
    showStorageError('Settings could not be loaded. Reopen the popup to try again.')
}).finally(() => {
    initialReadComplete = true
    changedBeforeLoad.clear()
})

for (const input of inputs) {
    input.addEventListener('change', () => {
        const key = `${input.id}SORS`
        if (!initialReadComplete) changedBeforeLoad.add(key)
        let value = input.checked
        if (input.type !== 'checkbox') {
            const parsed = Number.parseFloat(input.value)
            value = Math.min(Number(input.max), Math.max(Number(input.min),
                Number.isFinite(parsed) ? parsed : Number(input.defaultValue)))
            input.value = value
        }
        quantity.disabled = !showMore.checked
        void chrome.storage.local.set({ [key]: value }).then(() => {
            showStorageError('')
        }).catch(() => {
            showStorageError('Settings could not be saved. Reopen the popup to try again.')
        })
    })
}

const tooltip = document.getElementById('settingHelp')
let activeHelp
let pinnedHelp = false

function hideHelp() {
    activeHelp?.removeAttribute('aria-describedby')
    activeHelp?.setAttribute('aria-expanded', 'false')
    activeHelp = undefined
    pinnedHelp = false
    tooltip.hidden = true
}

function showHelp(button) {
    hideHelp()
    activeHelp = button
    button.setAttribute('aria-describedby', tooltip.id)
    button.setAttribute('aria-expanded', 'true')
    tooltip.textContent = button.dataset.help
    tooltip.hidden = false

    const anchor = button.getBoundingClientRect()
    const bounds = tooltip.getBoundingClientRect()
    const top = anchor.bottom + 6
    tooltip.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`
    tooltip.style.top = `${top + bounds.height <= innerHeight - 8 ? top : Math.max(8, anchor.top - bounds.height - 6)}px`
}

for (const button of document.querySelectorAll('.help')) {
    button.setAttribute('aria-expanded', 'false')
    button.addEventListener('mouseenter', () => {
        if (!pinnedHelp) showHelp(button)
    })
    button.addEventListener('mouseleave', () => {
        if (!pinnedHelp && document.activeElement !== button) hideHelp()
    })
    button.addEventListener('focus', () => showHelp(button))
    button.addEventListener('blur', hideHelp)
    button.addEventListener('click', () => {
        if (pinnedHelp && activeHelp === button) hideHelp()
        else {
            showHelp(button)
            pinnedHelp = true
        }
    })
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideHelp()
})
document.addEventListener('click', (event) => {
    if (!event.target.closest('.help')) hideHelp()
})
