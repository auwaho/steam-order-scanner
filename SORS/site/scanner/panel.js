/* Scan controls and progress on Steam's Buy Orders page. */

var SORSScanPanel = (() => {
    'use strict'

    const panelId = 'sors-scan-panel'
    const activePhases = new Set(['loading', 'scanning', 'retrying', 'stopping'])

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
        const summaryText = createElement('span')
        const refresh = createElement('button', 'sors-scan-refresh', 'Refresh')
        refresh.type = 'button'
        refresh.setAttribute('aria-label', 'Refresh buy order totals')
        summaryLine.append(summaryText, refresh)
        const cancellationNotice = createElement('div', 'sors-scan-cancellation-notice', 'Auto-cancel is enabled for all buy orders.')

        const body = createElement('div', 'sors-scan-body')
        body.id = `${panelId}-body`
        const progressLine = createElement('div', 'sors-scan-progress-line')
        const phaseText = createElement('span')
        phaseText.setAttribute('role', 'status')
        const countText = createElement('span', 'sors-scan-count')
        progressLine.append(phaseText, countText)
        const progress = createElement('progress', 'sors-scan-progress')
        progress.max = 1
        progress.value = 0
        progress.setAttribute('aria-label', 'Buy order scan progress')
        const currentItem = createElement('div', 'sors-scan-current')
        const currentLabel = createElement('span', 'sors-scan-muted')
        const currentName = createElement('span')
        currentItem.append(currentLabel, currentName)
        const results = createElement('div', 'sors-scan-results')
        const issues = createElement('div', 'sors-scan-issues')
        const latestError = createElement('div', 'sors-scan-error')
        latestError.setAttribute('role', 'status')
        const issueList = createElement('ul')
        issues.append(latestError, issueList)
        body.append(progressLine, progress, currentItem, results, issues)
        panel.append(header, summaryLine, cancellationNotice, body)

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
            const labels = {
                loading: 'Loading buy orders…',
                scanning: 'Scanning buy orders',
                retrying: 'Waiting to retry',
                stopping: 'Stopping…',
                completed: 'Scan complete',
                stopped: 'Scan stopped',
                error: 'Scan could not finish'
            }
            let label = labels[phase] || 'Ready to scan'
            if (phase === 'retrying' && status.retryAt) {
                const seconds = Math.max(0, Math.ceil((Number(status.retryAt) - Date.now()) / 1000))
                if (seconds) label = `Retrying in ${seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`}`
            }
            panel.dataset.phase = phase || 'idle'
            compactStatus.textContent = collapsed ? `${label}${total ? ` · ${checked} / ${total}` : ''}` : ''
            compactStatus.hidden = !collapsed
            phaseText.textContent = label
            countText.textContent = total ? `${checked} / ${total}` : ''
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
            cancellationNotice.hidden = !cancelHighOrders && !cancelFirstOrders

            if (summaryLoading && !summary) summaryText.textContent = 'Loading buy order totals…'
            else if (summary) summaryText.textContent = summary
            else summaryText.textContent = summaryError || 'Buy order totals unavailable'
            summaryLine.classList.toggle('sors-scan-summary-error', !!summaryError)
            refresh.textContent = summaryLoading ? 'Refreshing…' : 'Refresh'

            const itemName = status?.itemName
            currentItem.hidden = !itemName
            currentLabel.textContent = busy ? 'Current item · ' : 'Last item · '
            currentName.textContent = itemName || ''
            const resultParts = []
            if (Number(status?.canceled)) resultParts.push(`Canceled: ${status.canceled}`)
            if (Number(status?.skipped)) resultParts.push(`Skipped: ${status.skipped}`)
            if (Number(status?.withoutSalePrice)) resultParts.push(`Sale price unavailable: ${status.withoutSalePrice}`)
            if (Number(status?.failedCancellations)) resultParts.push(`Unconfirmed cancellations: ${status.failedCancellations}`)
            results.textContent = resultParts.join(' · ')
            results.hidden = !resultParts.length

            latestError.textContent = actionError || status?.error || summaryError || ''
            latestError.hidden = !latestError.textContent
            const recentIssues = Array.isArray(status?.recentIssues) ? status.recentIssues.slice(-3) : []
            const issueSignature = JSON.stringify(recentIssues)
            if (issueList.dataset.signature !== issueSignature) {
                issueList.replaceChildren(...recentIssues.map((issue) => createElement('li', '', String(issue))))
                issueList.dataset.signature = issueSignature
            }
            issueList.hidden = !recentIssues.length
            issues.hidden = latestError.hidden && issueList.hidden
            clearTimeout(retryTimer)
            if (phase === 'retrying' && status.retryAt) retryTimer = setTimeout(render, 1000)
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
                summary = `Buy orders: ${data.total ?? data.orders.length}${committed ? ` · Total committed: ${committed}` : ''}`
            }
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
        render()
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
