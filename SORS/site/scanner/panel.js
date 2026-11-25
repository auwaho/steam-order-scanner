/* Scan controls and progress on Steam's Buy Orders page. */

var SORSScanPanel = (() => {
    'use strict'

    const panelId = 'sors-scan-panel'
    const activePhases = new Set(['loading', 'scanning', 'retrying', 'stopping'])
    const phaseLabels = {
        loading: 'Loading buy orders…',
        scanning: 'Scanning buy orders',
        retrying: 'Waiting on Steam',
        stopping: 'Stopping…',
        completed: 'Scan complete',
        stopped: 'Scan stopped',
        error: 'Scan could not finish'
    }
    const gameNames = new Map([[730, 'CS2'], [570, 'Dota 2'], [440, 'Team Fortress 2'], [753, 'Steam Community Items']])

    function createElement(tag, className, text) {
        const element = document.createElement(tag)
        if (className) element.className = className
        if (text !== undefined) element.textContent = text
        return element
    }

    function mount({ onRefresh }) {
        const controller = new AbortController()
        const { signal } = controller
        let active = true
        let status
        let summary
        let summaryError
        let summaryLoading = false
        let actionError
        let pendingAction
        let collapsed = false
        let cancelHighOrders = false
        let cancelFirstOrders = false
        let receivedStatus = false
        let receivedCollapse = false
        let receivedCancelHigh = false
        let receivedCancelFirst = false
        let refreshedRun
        let frame
        let retryTimer

        const panel = createElement('section')
        panel.id = panelId
        panel.setAttribute('aria-labelledby', `${panelId}-title`)
        const header = createElement('div', 'sors-scan-header')
        const heading = createElement('h2', 'sors-scan-heading')
        const toggle = createElement('button', 'sors-scan-toggle')
        const chevron = createElement('span', 'sors-scan-chevron')
        chevron.setAttribute('aria-hidden', 'true')
        const headingText = createElement('span', 'sors-scan-heading-text')
        const title = createElement('span', 'sors-scan-title', 'Steam Order Scanner')
        title.id = `${panelId}-title`
        const compactStatus = createElement('span', 'sors-scan-compact-status')
        compactStatus.id = `${panelId}-compact-status`
        toggle.setAttribute('aria-labelledby', title.id)
        toggle.setAttribute('aria-describedby', compactStatus.id)
        toggle.setAttribute('aria-controls', `${panelId}-body`)
        headingText.append(title, compactStatus)
        toggle.append(chevron, headingText)
        heading.append(toggle)

        const controls = createElement('div', 'sors-scan-controls')
        const report = createElement('button', 'sors-scan-button', 'Report')
        const start = createElement('button', 'sors-scan-button sors-scan-start', 'Start scan')
        const stop = createElement('button', 'sors-scan-button', 'Stop')
        for (const button of [report, start, stop, toggle]) button.type = 'button'
        controls.append(report, start, stop)
        header.append(heading, controls)

        const summaryLine = createElement('div', 'sors-scan-summary')
        const totalsLine = createElement('div', 'sors-scan-totals')
        const summaryText = createElement('span')
        summaryText.setAttribute('aria-live', 'polite')
        const refresh = createElement('button', 'sors-scan-refresh', 'Refresh')
        refresh.type = 'button'
        refresh.setAttribute('aria-label', 'Refresh buy order totals')
        const cancellationNotice = createElement('span', 'sors-scan-cancellation-notice')
        totalsLine.append(summaryText, refresh)
        summaryLine.append(totalsLine, cancellationNotice)

        const body = createElement('div', 'sors-scan-body')
        body.id = `${panelId}-body`
        const progressLine = createElement('div', 'sors-scan-progress-line')
        const phaseText = createElement('span', 'sors-scan-phase')
        phaseText.setAttribute('role', 'status')
        const countText = createElement('span', 'sors-scan-count')
        progressLine.append(phaseText, countText)
        const progress = createElement('progress', 'sors-scan-progress')
        progress.max = 1
        progress.value = 0
        progress.setAttribute('aria-label', 'Buy order scan progress')
        const currentItem = createElement('div', 'sors-scan-current')
        const item = createElement('span')
        const currentName = createElement('strong')
        const currentGame = createElement('span', 'sors-scan-muted')
        const retry = createElement('span', 'sors-scan-retry')
        item.append(currentName, currentGame)
        currentItem.append(item, retry)
        const results = createElement('div', 'sors-scan-results')
        const issues = createElement('div', 'sors-scan-issues')
        const latestError = createElement('div', 'sors-scan-error')
        latestError.setAttribute('role', 'status')
        const issueList = createElement('ul')
        issues.append(latestError, issueList)
        body.append(summaryLine, progressLine, progress, currentItem, results, issues)
        panel.append(header, body)

        function ensureMounted() {
            if (!active) return
            const nav = document.querySelector('#CommunityTemplate a[href="buyorders"]')?.parentElement
            if (!nav?.querySelector('a[href="activelistings"]')) return
            if (panel.previousElementSibling !== nav) nav.after(panel)
        }

        function render() {
            if (!active) return
            const phase = status?.phase
            const busy = activePhases.has(phase)
            const checked = Math.max(0, Number(status?.checked) || 0)
            const total = Math.max(0, Number(status?.total) || 0)
            const count = total || phase === 'completed' ? `${checked} / ${total}` : ''
            const label = phaseLabels[phase] || 'Ready to scan'
            const retryAt = Number(status?.retryAt)
            const seconds = phase === 'retrying' && Number.isFinite(retryAt) ? Math.ceil((retryAt - Date.now()) / 1000) : 0
            const retryTime = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : seconds > 0 ? `${seconds}s` : ''
            const autoCancel = cancelHighOrders || cancelFirstOrders
            if (collapsed) {
                const shortStatus = [retryTime ? `Retrying in ${retryTime}` : label]
                if (count) shortStatus.push(count)
                if (summary) {
                    if (!count || summary.count !== total) shortStatus.push(`${summary.count} ${summary.orderLabel}`)
                    if (summary.committed) shortStatus.push(`${summary.committed} committed`)
                }
                if (autoCancel) shortStatus.push('Auto-cancel on')
                const failure = actionError || (phase === 'error' && status.error) ||
                    (summaryError && 'Buy order totals unavailable')
                if (failure) shortStatus.push(failure)
                compactStatus.textContent = shortStatus.join(' · ')
            } else {
                compactStatus.textContent = ''
            }
            panel.dataset.phase = phase || 'idle'
            compactStatus.hidden = !collapsed
            if (phaseText.textContent !== label) phaseText.textContent = label
            countText.textContent = count ? `${count} checked` : ''
            countText.hidden = !count
            progress.max = total || 1
            if (phase === 'loading') progress.removeAttribute('value')
            else progress.value = phase === 'completed' && !total ? 1 : Math.min(checked, total || 1)
            progress.hidden = !phase
            body.hidden = collapsed
            toggle.setAttribute('aria-expanded', String(!collapsed))
            toggle.title = collapsed ? 'Expand scanner' : 'Collapse scanner'
            start.hidden = busy
            stop.hidden = !busy
            start.disabled = !!pendingAction || summaryLoading
            stop.disabled = !!pendingAction || phase === 'stopping'
            refresh.disabled = summaryLoading || busy || !!pendingAction
            cancellationNotice.classList.toggle('is-enabled', autoCancel)
            cancellationNotice.textContent = autoCancel ? 'Auto-cancel on for all buy orders' : 'Auto-cancel off'
            refresh.textContent = summaryLoading ? 'Refreshing…' : 'Refresh'

            const itemName = status?.itemName
            const appId = Number(status?.itemAppId)
            currentItem.hidden = !itemName && !retryTime
            item.hidden = !itemName
            currentName.textContent = itemName || ''
            currentGame.textContent = itemName && appId > 0 ? ` · ${gameNames.get(appId) ?? `App ${appId}`}` : ''
            retry.textContent = retryTime ? `Next attempt in ${retryTime}` : ''
            retry.hidden = !retryTime
            const resultParts = []
            const flagged = Number(status?.flagged)
            if (flagged > 0) resultParts.push(`${flagged} ${flagged === 1 ? 'order' : 'orders'} to review`)
            if (Number(status?.canceled)) resultParts.push(`Canceled: ${status.canceled}`)
            if (Number(status?.skipped)) resultParts.push(`Skipped: ${status.skipped}`)
            if (Number(status?.withoutSalePrice)) resultParts.push(`Sale price unavailable: ${status.withoutSalePrice}`)
            if (Number(status?.failedCancellations)) resultParts.push(`Unconfirmed cancellations: ${status.failedCancellations}`)
            results.textContent = resultParts.join(' · ')
            results.hidden = !resultParts.length

            const error = actionError || status?.error || ''
            if (latestError.textContent !== error) latestError.textContent = error
            latestError.hidden = !error
            const recentIssues = Array.isArray(status?.recentIssues) ? status.recentIssues.slice(-3) : []
            const issueSignature = JSON.stringify(recentIssues)
            if (issueList.dataset.signature !== issueSignature) {
                issueList.replaceChildren(...recentIssues.map((issue) => createElement('li', '', String(issue))))
                issueList.dataset.signature = issueSignature
            }
            issueList.hidden = !recentIssues.length
            issues.hidden = latestError.hidden && issueList.hidden
            clearTimeout(retryTimer)
            if (retryTime) retryTimer = setTimeout(render, 1000)
        }

        function setSummary(data) {
            summaryLoading = data === undefined
            summaryError = data === null ? 'Buy order totals unavailable. Refresh to try again.' : undefined
            if (data === null) summary = undefined
            if (data) {
                const totals = new Map()
                for (const order of data.orders) {
                    const currency = Number(order.wallet_currency)
                    const amount = Number(order.price) * Number(order.quantity_remaining)
                    totals.set(currency, (totals.get(currency) || 0) + amount)
                }
                const committed = [...totals].map(([currency, amount]) => formatSteamMoney(amount, currency)).join(' + ')
                const count = data.total ?? data.orders.length
                summary = { count, committed, orderLabel: count === 1 ? 'buy order' : 'buy orders' }
            }
            if (summary) {
                const parts = [createElement('strong', null, String(summary.count)), ` ${summary.orderLabel}`]
                if (summary.committed) parts.push(' · ', createElement('strong', null, summary.committed), ' committed')
                summaryText.replaceChildren(...parts)
            } else {
                summaryText.textContent = summaryLoading ? 'Loading buy order totals…' :
                    summaryError || 'Buy order totals unavailable'
            }
            totalsLine.classList.toggle('sors-scan-summary-error', !!summaryError)
            render()
        }

        async function sendAction(type) {
            if (pendingAction) return
            pendingAction = type
            actionError = undefined
            render()
            try {
                const response = await chrome.runtime.sendMessage({ type })
                if (response?.error) throw new Error(response.error)
                if (response?.ok === false) throw new Error('The scanner could not complete this action.')
            } catch (error) {
                actionError = error?.message || 'The scanner could not complete this action.'
            } finally {
                pendingAction = undefined
                render()
            }
        }

        function onStorageChanged(changes, namespace) {
            if (namespace !== 'local') return
            if (changes.scanPanelCollapsedSORS) {
                receivedCollapse = true
                collapsed = !!changes.scanPanelCollapsedSORS.newValue
            }
            if (changes.cancelHighOrdersSORS) {
                receivedCancelHigh = true
                cancelHighOrders = !!changes.cancelHighOrdersSORS.newValue
            }
            if (changes.cancelFirstOrdersSORS) {
                receivedCancelFirst = true
                cancelFirstOrders = !!changes.cancelFirstOrdersSORS.newValue
            }
            if (changes.scanStatusSORS) {
                receivedStatus = true
                const previousPhase = status?.phase
                status = changes.scanStatusSORS.newValue
                const run = status?.runId || status?.startedAt
                if (activePhases.has(previousPhase) && !activePhases.has(status?.phase) &&
                    (status?.canceled || status?.failedCancellations) && (!run || refreshedRun !== run)) {
                    refreshedRun = run
                    onRefresh()
                }
            }
            if (changes.scanPanelCollapsedSORS || changes.scanStatusSORS ||
                changes.cancelHighOrdersSORS || changes.cancelFirstOrdersSORS) render()
        }

        toggle.addEventListener('click', () => {
            collapsed = !collapsed
            render()
            chrome.storage.local.set({ scanPanelCollapsedSORS: collapsed })
        }, { signal })
        header.addEventListener('click', (event) => {
            if (!event.target.closest('button')) toggle.click()
        }, { signal })
        refresh.addEventListener('click', onRefresh, { signal })
        start.addEventListener('click', () => sendAction('sors-scan-start'), { signal })
        stop.addEventListener('click', () => sendAction('sors-scan-stop'), { signal })
        report.addEventListener('click', () => sendAction('sors-open-report'), { signal })
        chrome.storage.onChanged.addListener(onStorageChanged)
        chrome.storage.local.get(['scanStatusSORS', 'scanPanelCollapsedSORS', 'cancelHighOrdersSORS', 'cancelFirstOrdersSORS'], (saved) => {
            if (!active) return
            if (!receivedStatus) status = saved.scanStatusSORS
            if (!receivedCollapse) collapsed = !!saved.scanPanelCollapsedSORS
            if (!receivedCancelHigh) cancelHighOrders = !!saved.cancelHighOrdersSORS
            if (!receivedCancelFirst) cancelFirstOrders = !!saved.cancelFirstOrdersSORS
            render()
        })
        const observer = new MutationObserver((records) => {
            if (frame !== undefined || !records.some(({ target }) => !panel.contains(target))) return
            frame = requestAnimationFrame(() => {
                frame = undefined
                ensureMounted()
            })
        })
        observer.observe(document.body, { childList: true, subtree: true })
        ensureMounted()
        setSummary(undefined)

        function dispose() {
            active = false
            controller.abort()
            observer.disconnect()
            chrome.storage.onChanged.removeListener(onStorageChanged)
            clearTimeout(retryTimer)
            if (frame !== undefined) cancelAnimationFrame(frame)
            panel.remove()
        }
        return { setSummary, dispose }
    }

    return { mount }
})()
