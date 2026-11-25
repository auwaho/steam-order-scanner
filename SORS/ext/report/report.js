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

const reportKeys = [
    'scanEndTimeSORS', 'scanPrefSuffSORS', 'scanTableBadSORS', 'scanTableTailSORS', 'scanProgressSORS',
    'scanErrorSORS', 'scanStatusSORS', 'scanLastCompletedSORS'
]
const activePhases = new Set(['loading', 'scanning', 'retrying', 'stopping'])
const reportState = {}
const changesBeforeLoad = new Set()
let initialReadComplete = false
let activeRun
let selectedView
let renderedReport
let renderedEntries = 0
let rows = []
let sortColumn
let ascending = false

const table = document.getElementById('reportTable')
const tableBody = document.getElementById('badOrd')
const sortButtons = [...table.querySelectorAll('thead button')]
const empty = document.getElementById('emptyReport')
const viewControls = document.getElementById('reportView')
const viewLabel = document.getElementById('reportViewLabel')
const viewButton = document.getElementById('switchReport')

function getListingUrl(appId, hashName, metadata) {
    const listingPath = `https://steamcommunity.com/market/listings/${encodeURIComponent(appId)}/`
    const itemPath = encodeURIComponent(hashName)
    if (
        String(appId) !== '730' ||
        !metadata ||
        typeof metadata.quality !== 'string' ||
        !/^[A-Za-z0-9_]+$/.test(metadata.quality) ||
        (metadata.exterior != null &&
            (typeof metadata.exterior !== 'string' || !/^WearCategory(?:\d+|NA)$/.test(metadata.exterior)))
    ) {
        return listingPath + itemPath
    }

    const groupPath = typeof metadata.groupId === 'string' && /^G[0-9A-F]+$/i.test(metadata.groupId)
        ? metadata.groupId
        : itemPath
    const filters = new URLSearchParams({ category_Quality: metadata.quality })
    if (metadata.exterior) filters.set('category_Exterior', metadata.exterior)
    filters.set('appid', String(appId))
    return `${listingPath}${groupPath}?${filters}`
}

function appendLinkCell(row, href, text) {
    const link = document.createElement('a')
    link.href = href
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = text
    row.insertCell().appendChild(link)
}

function appendPriceCell(row, amount, detail, title) {
    const cell = row.insertCell()
    cell.textContent = amount
    if (detail != null) {
        const span = document.createElement('span')
        span.title = title
        span.textContent = `(${detail})`
        cell.append(' ', span)
    }
}

function decodeCurrencyAffix(value) {
    if (typeof value !== 'string') return ''
    try {
        return JSON.parse(`"${value}"`)
    } catch {
        return value
    }
}

function numberOrNull(value) {
    if (value == null) return null
    const number = Number(value)
    return Number.isFinite(number) ? number : null
}

function createRow(entry, index, [prefix, suffix]) {
    const [appId, hashName, order, breakEven, marketNet, marketGross, first, metadata] = entry
    const atTop = first === true || first === 1 || first === '1'
    const hasMarketEstimate = marketNet != null && marketGross != null
    const format = amount => prefix + amount + suffix
    const profit = hasMarketEstimate ? format((marketNet - order).toFixed(2)) : null
    const profitPercent = hasMarketEstimate ? (100 - (order / marketNet) * 100).toFixed(2) : null
    const row = document.createElement('tr')
    const numberCell = document.createElement('th')
    numberCell.scope = 'row'
    numberCell.textContent = index + 1
    row.appendChild(numberCell)
    appendLinkCell(row, `https://steamcommunity.com/market/search?appid=${encodeURIComponent(appId)}`, appId)
    appendLinkCell(row, getListingUrl(appId, hashName, metadata), hashName)
    row.insertCell().textContent = atTop ? '+' : '-'
    appendPriceCell(row, format(order), breakEven == null ? null : format(breakEven), 'Break-even point.')
    appendPriceCell(row, hasMarketEstimate ? format(marketGross) : '—',
        hasMarketEstimate ? format(marketNet) : null, 'This is how much you will receive.')
    appendPriceCell(row, profitPercent == null ? '—' : `${profitPercent}%`, profit, 'Net profit.')
    return {
        element: row,
        index,
        values: [index, numberOrNull(appId), String(hashName), Number(atTop), numberOrNull(order),
            hasMarketEstimate ? numberOrNull(marketGross) : null, numberOrNull(profitPercent)]
    }
}

function compareRows(left, right) {
    const a = left.values[sortColumn]
    const b = right.values[sortColumn]
    if ((a == null) !== (b == null)) return a == null ? 1 : -1
    if (a === b) return left.index - right.index
    const order = typeof a === 'number' ? a - b : a.localeCompare(b)
    return (ascending ? order : -order) || left.index - right.index
}

function addSortedRow(row) {
    let low = 0
    let high = rows.length
    while (low < high) {
        const middle = (low + high) >>> 1
        if (compareRows(rows[middle], row) <= 0) low = middle + 1
        else high = middle
    }
    tableBody.insertBefore(row.element, rows[low]?.element ?? null)
    rows.splice(low, 0, row)
}

for (const [column, button] of sortButtons.entries()) {
    button.addEventListener('click', () => {
        ascending = sortColumn === column && !ascending
        sortColumn = column
        for (const [index, control] of sortButtons.entries()) {
            if (index === column) control.parentElement.setAttribute('aria-sort', ascending ? 'ascending' : 'descending')
            else control.parentElement.removeAttribute('aria-sort')
        }
        rows.sort(compareRows)
        tableBody.append(...rows.map(row => row.element))
    })
}

function currentReport() {
    const status = reportState.scanStatusSORS
    const savedRows = Array.isArray(reportState.scanTableBadSORS) ? reportState.scanTableBadSORS : []
    const tail = reportState.scanTableTailSORS
    const live = Array.isArray(tail) && tail.length ? savedRows.concat(tail) : savedRows
    const saved = reportState.scanLastCompletedSORS
    const hasSaved = Array.isArray(saved?.rows)
    const canSwitch = hasSaved && !!status && status.phase !== 'completed'
    if (activeRun !== status?.runId) {
        activeRun = status?.runId
        selectedView = undefined
    }
    const preferred = !live.length && ['stopped', 'error'].includes(status?.phase) ? 'saved' : 'live'
    const showSaved = canSwitch && (selectedView ?? preferred) === 'saved'
    return {
        mode: showSaved ? 'saved' : 'live',
        canSwitch,
        flagged: live.length,
        entries: showSaved ? saved.rows : live,
        affixes: showSaved ? saved.currencyAffixes : reportState.scanPrefSuffSORS,
        key: showSaved ? `saved:${saved.runId ?? saved.finishedAt}` : `live:${status?.runId ?? ''}`
    }
}

viewButton.addEventListener('click', () => {
    selectedView = currentReport().mode === 'saved' ? 'live' : 'saved'
    render()
})

function renderRows({ entries, affixes, key }) {
    const money = [decodeCurrencyAffix(affixes?.[0]), decodeCurrencyAffix(affixes?.[1])]
    const identity = JSON.stringify([key, ...money])
    if (renderedReport !== identity || renderedEntries > entries.length) {
        tableBody.replaceChildren()
        renderedReport = identity
        renderedEntries = 0
        rows = []
    }
    const batch = document.createDocumentFragment()
    for (; renderedEntries < entries.length; renderedEntries++) {
        const entry = entries[renderedEntries]
        if (!Array.isArray(entry) || entry.length < 7) continue
        const row = createRow(entry, rows.length, money)
        if (sortColumn === undefined) {
            batch.appendChild(row.element)
            rows.push(row)
        } else {
            addSortedRow(row)
        }
    }
    if (batch.childNodes.length) tableBody.appendChild(batch)
    table.hidden = !rows.length
    empty.hidden = !!rows.length
}

function render() {
    const status = reportState.scanStatusSORS
    const view = currentReport()
    const showSaved = view.mode === 'saved'
    renderRows(view)
    viewControls.hidden = !view.canSwitch
    viewLabel.textContent = showSaved ? 'Showing last completed report' : 'Showing current scan'
    viewButton.textContent = showSaved ? 'View current scan' : 'View last completed report'

    const labels = {
        loading: 'Loading buy orders', scanning: 'Scanning', retrying: 'Waiting to retry', stopping: 'Stopping',
        completed: 'Scan completed', stopped: 'Scan stopped', error: 'Scan failed'
    }
    const total = Number(status?.total) || 0
    const checked = Math.max(0, Number(status?.checked) || 0)
    const label = labels[status?.phase] || 'Ready to scan'
    document.getElementById('scanStatus').textContent = total ? `${label} · ${checked} / ${total} orders` : label
    const currentItem = document.getElementById('scanCurrentItem')
    currentItem.hidden = !status?.itemName || !['scanning', 'retrying', 'stopping'].includes(status.phase)
    currentItem.textContent = status?.itemName || ''

    const counts = []
    if (status) {
        counts.push(`${view.flagged} flagged`)
        if (status.skipped) counts.push(`${status.skipped} skipped`)
        if (status.withoutSalePrice) counts.push(`${status.withoutSalePrice} without sale estimate`)
        if (status.canceled) counts.push(`${status.canceled} canceled`)
        if (status.failedCancellations) counts.push(`${status.failedCancellations} unconfirmed cancellations`)
    }
    const countLine = document.getElementById('scanCounts')
    countLine.hidden = counts.length === 0
    countLine.textContent = counts.join(' · ')
    const issue = document.getElementById('scanIssue')
    issue.textContent = status?.error || status?.recentIssues?.at(-1) || ''
    issue.hidden = !issue.textContent

    if (showSaved || status?.phase === 'completed') {
        empty.textContent = 'No orders matched the scan conditions.'
    } else if (activePhases.has(status?.phase)) {
        empty.textContent = 'No matching orders found yet.'
    } else if (status?.phase === 'stopped' || status?.phase === 'error') {
        empty.textContent = 'No matching orders were recorded before the scan ended.'
    } else {
        empty.textContent = 'Start a scan to see orders that match the scan conditions.'
    }

    const savedAt = reportState.scanLastCompletedSORS?.finishedAt
    const endTime = typeof savedAt === 'number' ? new Date(savedAt).toLocaleString() : savedAt || reportState.scanEndTimeSORS
    document.getElementById('lastScan').textContent = endTime && endTime !== 'N/A' ? endTime : 'Not yet completed'
    const value = status ? (status.phase === 'completed' ? 100 : total ? checked / total * 100 : 0) :
        Number(reportState.scanProgressSORS) || 0
    const percentage = Math.min(100, Math.max(0, value))
    const progress = document.getElementById('progress')
    progress.style.width = `${percentage}%`
    progress.style.color = reportState.scanErrorSORS ? 'red' : '#0075ff'
    progress.setAttribute('aria-valuenow', percentage)
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return
    let changed = false
    for (const key of reportKeys) {
        if (!(key in changes)) continue
        if (!initialReadComplete) changesBeforeLoad.add(key)
        reportState[key] = changes[key].newValue
        changed = true
    }
    if (changed) render()
})

chrome.storage.local.get(reportKeys, (result) => {
    for (const key of reportKeys) {
        if (!changesBeforeLoad.has(key)) reportState[key] = result[key]
    }
    initialReadComplete = true
    render()
})
