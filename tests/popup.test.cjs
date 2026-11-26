const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const popupPath = path.resolve(__dirname, '../SORS/ext/popup')
const settle = () => new Promise(setImmediate)

function deferred() {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

function openPopup(stored = {}, read = Promise.resolve(stored)) {
    const inputs = [...fs.readFileSync(path.join(popupPath, 'popup.html'), 'utf8').matchAll(/<input\b([^>]+)>/g)]
        .map(([, attributes]) => {
            const values = Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)]
                .map(([, key, value]) => [key, value]))
            const listeners = new Map()
            return {
                ...values, disabled: false, checked: /\bchecked\b/.test(attributes),
                defaultChecked: /\bchecked\b/.test(attributes), defaultValue: values.value ?? '',
                addEventListener: (event, listener) => listeners.set(event, listener),
                change(value) {
                    assert.equal(this.disabled, false, this.id + ' must be enabled for a user edit')
                    if (this.type === 'checkbox') this.checked = value
                    else this.value = String(value)
                    listeners.get('change')()
                }
            }
        })
    const status = { hidden: true, textContent: '' }
    const writes = []
    let onChanged
    const update = values => {
        Object.assign(stored, values)
        onChanged(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'local')
    }
    const context = vm.createContext({
        document: {
            querySelectorAll: selector => selector === '.settings input' ? inputs : [],
            getElementById: id => inputs.find(input => input.id === id) ?? status,
            addEventListener() {}
        },
        chrome: { storage: {
            local: {
                get: () => read,
                set(values) {
                    const pending = deferred()
                    writes.push({ values, reject: pending.reject, succeed() { update(values); pending.resolve() } })
                    return pending.promise
                }
            },
            onChanged: { addListener: listener => { onChanged = listener } }
        } }
    })
    vm.runInContext(fs.readFileSync(path.join(popupPath, 'popup.js'), 'utf8'), context)
    return { input: id => inputs.find(input => input.id === id), writes, status, update }
}

for (const id of ['cancelHighOrders', 'cancelFirstOrders']) {
    test(id + ' restores the confirmed value and keeps its error through unrelated successful saves', async () => {
        const other = id === 'cancelHighOrders' ? 'cancelFirstOrders' : 'cancelHighOrders'
        const popup = openPopup({ [`${id}SORS`]: true, [`${other}SORS`]: true })
        await settle()
        const checkbox = popup.input(id)
        checkbox.change(false)
        assert.equal(checkbox.disabled, true)
        popup.writes[0].reject(new Error('Write failed'))
        await settle()
        assert.equal(checkbox.checked, true)
        assert.equal(checkbox.disabled, false)
        assert.equal(popup.status.hidden, false)

        popup.input('delayPerOrder').change(400)
        popup.writes[1].succeed()
        await settle()
        assert.equal(popup.status.hidden, false)
        assert.equal(checkbox.checked, true)
        popup.input(other).change(false)
        popup.writes[2].succeed()
        await settle()
        assert.equal(popup.status.hidden, false)

        checkbox.change(false)
        popup.writes[3].succeed()
        await settle()
        assert.equal(checkbox.checked, false)
        assert.equal(popup.status.hidden, true)
    })
}

test('auto-cancel waits for confirmed settings and restores a newer external value after a failed write', async () => {
    const read = deferred()
    const popup = openPopup({}, read.promise)
    const checkbox = popup.input('cancelHighOrders')
    assert.equal(checkbox.disabled, true)
    assert.equal(popup.input('delayPerOrder').disabled, false)
    popup.update({ cancelHighOrdersSORS: true })
    read.resolve({ cancelHighOrdersSORS: false })
    await settle()
    assert.equal(checkbox.checked, true)
    assert.equal(checkbox.disabled, false)

    checkbox.change(false)
    popup.update({ cancelHighOrdersSORS: true })
    popup.writes[0].reject(new Error('Write failed'))
    await settle()
    assert.equal(checkbox.checked, true)
})

test('a failed initial read keeps auto-cancel controls locked and explains why after another setting saves', async () => {
    const read = deferred()
    const popup = openPopup({}, read.promise)
    read.reject(new Error('Read failed'))
    await settle()
    popup.input('delayPerOrder').change(400)
    popup.writes[0].succeed()
    await settle()
    assert.equal(popup.input('cancelHighOrders').disabled, true)
    assert.equal(popup.input('cancelFirstOrders').disabled, true)
    assert.match(popup.status.textContent, /Settings could not be loaded/)
})

test('fractional fields and editing other fields during load preserve their previous behavior', async () => {
    const read = deferred()
    const popup = openPopup({}, read.promise)
    const quantity = popup.input('showMoreOrdersQty')
    quantity.change(20.9)
    popup.writes[0].succeed()
    read.resolve({ showMoreOrdersQtySORS: 20 })
    await settle()
    assert.equal(Number(quantity.value), 20.9)
    assert.equal(Number(popup.writes[0].values.showMoreOrdersQtySORS), 20.9)
})

test('a non-auto-cancel save keeps the previous generic error and recovery behavior', async () => {
    const popup = openPopup()
    await settle()
    popup.input('delayPerOrder').change(500)
    popup.writes[0].reject(new Error('Write failed'))
    await settle()
    assert.equal(Number(popup.input('delayPerOrder').value), 500)
    assert.equal(popup.status.hidden, false)

    popup.input('delayRandom').change(25)
    popup.writes[1].succeed()
    await settle()
    assert.equal(popup.status.hidden, true)
})
