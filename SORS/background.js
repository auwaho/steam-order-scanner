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
    scanTableTailSORS: [],
    scanEndTimeSORS: 'N/A',
    scanPrefSuffSORS: ['', ''],
    scanErrorSORS: false
}

const ownerKey = 'scanOwner'
const activePhases = new Set(['loading', 'scanning', 'retrying', 'stopping'])
let commandQueue = Promise.resolve()

async function ensureDefaultsInitialized() {
    const current = await chrome.storage.local.get([...Object.keys(DEFAULTS), 'accountWideScanSettingsSORS',
        'scanStatusSORS', 'scanLastCompletedSORS'])
    const updates = Object.fromEntries(Object.entries(DEFAULTS).filter(([key]) => current[key] === undefined))
    if (!current.accountWideScanSettingsSORS) {
        // The previous opt-in applied only to orders matched to a visible row.
        updates.cancelFirstOrdersSORS = false
        updates.cancelHighOrdersSORS = false
        updates.accountWideScanSettingsSORS = true
    }
    if (current.scanLastCompletedSORS === undefined) {
        const status = current.scanStatusSORS
        const legacyComplete = !status && current.scanProgressSORS === 100 &&
            current.scanEndTimeSORS && current.scanEndTimeSORS !== 'N/A'
        updates.scanLastCompletedSORS = null
        if ((status?.phase === 'completed' || legacyComplete) && Array.isArray(current.scanTableBadSORS)) {
            const tail = status?.phase === 'completed' && Array.isArray(current.scanTableTailSORS)
                ? current.scanTableTailSORS : []
            updates.scanLastCompletedSORS = {
                rows: [...current.scanTableBadSORS, ...tail],
                currencyAffixes: current.scanPrefSuffSORS ?? ['', ''],
                finishedAt: status?.finishedAt ?? current.scanEndTimeSORS,
                ...(status?.runId ? { runId: status.runId } : {})
            }
        }
    }
    if (Object.keys(updates).length) await chrome.storage.local.set(updates)
}

function enqueue(task) {
    const result = commandQueue.then(task)
    commandQueue = result.catch((error) => console.error('Steam Order Scanner:', error))
    return result
}

function isBuyOrdersPage(url) {
    return /^https:\/\/steamcommunity\.com\/market\/buyorders\/?(?:[?#]|$)/.test(url ?? '')
}

async function readOwner() {
    return (await chrome.storage.session.get(ownerKey))[ownerKey]
}

async function finishInterrupted(owner, phase, error) {
    const { scanStatusSORS: status } = await chrome.storage.local.get('scanStatusSORS')
    if (activePhases.has(status?.phase) && (!owner || status.runId === owner.runId)) {
        if (status.pendingCancellation) {
            const issue = `${status.pendingCancellation.itemName}: Steam did not confirm the cancellation before the scan was interrupted.`
            status.failedCancellations = (status.failedCancellations || 0) + 1
            status.recentIssues = [...(status.recentIssues ?? []).slice(-4), issue]
            status.pendingCancellation = null
        }
        await chrome.storage.local.set({
            scanStatusSORS: { ...status, phase, error, retryAt: null, finishedAt: Date.now() },
            scanErrorSORS: phase === 'error' || !!(status.skipped || status.withoutSalePrice || status.failedCancellations)
        })
    }
    await chrome.storage.session.remove(ownerKey)
}

async function callRunner(owner, type) {
    return chrome.tabs.sendMessage(owner.tabId, { type, runId: owner.runId }, { frameId: 0 })
}

async function startScan(sender) {
    const previous = await readOwner()
    if (previous) {
        const reply = await callRunner(previous, 'sors-run-status').catch(() => null)
        if (reply?.active) return { ok: false, error: 'A scan is already running.' }
        await finishInterrupted(previous, 'stopped', 'The previous scan tab is no longer available.')
    }
    const tab = sender.tab
    if (!tab?.id || !isBuyOrdersPage(sender.url ?? tab.url)) {
        return { ok: false, error: 'Open the Steam Buy Orders page to start a scan.' }
    }
    const owner = { tabId: tab.id, runId: crypto.randomUUID() }
    await chrome.storage.session.set({ [ownerKey]: owner })
    await chrome.storage.local.set({
        scanStatusSORS: {
            runId: owner.runId, phase: 'loading', startedAt: Date.now(), checked: 0, total: 0,
            skipped: 0, withoutSalePrice: 0, failedCancellations: 0, canceled: 0, recentIssues: []
        },
        scanProgressSORS: 0,
        scanErrorSORS: false,
        scanTableBadSORS: [],
        scanTableTailSORS: []
    })
    const reply = await callRunner(owner, 'sors-run-start').catch(() => null)
    if (reply?.ok) return reply
    const error = reply?.error ?? 'Reload the Steam Buy Orders page and try again.'
    await finishInterrupted(owner, 'error', error)
    return { ok: false, error }
}

async function stopScan() {
    const owner = await readOwner()
    if (!owner) return { ok: true }
    const reply = await callRunner(owner, 'sors-run-stop').catch(() => null)
    if (!reply?.ok) await finishInterrupted(owner, 'stopped', 'The scan tab is no longer available.')
    return { ok: true }
}

const commands = {
    'sors-scan-start': (_message, sender) => startScan(sender),
    'sors-scan-stop': stopScan,
    'sors-open-report': async () => {
        await chrome.tabs.create({ url: chrome.runtime.getURL('ext/report/report.html') })
        return { ok: true }
    },
    'sors-run-update': async ({ updates }, sender) => {
        const owner = await readOwner()
        if (!owner || owner.runId !== updates?.scanStatusSORS?.runId || owner.tabId !== sender.tab?.id) {
            return { ok: false, error: 'This tab no longer owns the scan.' }
        }
        await chrome.storage.local.set(updates)
        return { ok: true }
    },
    'sors-run-finished': async ({ runId, error }, sender) => {
        const owner = await readOwner()
        if (owner?.runId === runId && owner.tabId === sender.tab?.id) {
            await finishInterrupted(owner, 'error', error ?? 'The scan ended before its status could be saved.')
        }
        return { ok: true }
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!Object.hasOwn(commands, message?.type)) return
    enqueue(() => commands[message.type](message, sender)).then(
        sendResponse,
        (error) => sendResponse({ ok: false, error: error.message })
    )
    return true
})

function handleOwnerTabChange(tabId, runnerCommand) {
    void enqueue(async () => {
        const owner = await readOwner()
        if (owner?.tabId !== tabId) return
        const reply = runnerCommand ? await callRunner(owner, runnerCommand).catch(() => null) : null
        if (!reply?.ok && !reply?.active) {
            await finishInterrupted(owner, 'stopped', 'The Steam Buy Orders page was closed or reloaded.')
        }
    }).catch(() => {})
}

chrome.tabs.onRemoved.addListener((tabId) => handleOwnerTabChange(tabId))
chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading' || (change.url && !isBuyOrdersPage(change.url))) {
        handleOwnerTabChange(tabId, 'sors-run-stop')
    } else if (change.status === 'complete') {
        handleOwnerTabChange(tabId, 'sors-run-status')
    }
})

void enqueue(async () => {
    await ensureDefaultsInitialized()
    const owner = await readOwner()
    const runner = owner && await callRunner(owner, 'sors-run-status').catch(() => null)
    if (!runner?.active) await finishInterrupted(owner, 'stopped', 'The previous scan was interrupted.')
}).catch(() => {})
