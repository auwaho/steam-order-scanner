;(() => {
    let route
    let stopEnhancements

    function update() {
        const nextRoute = location.pathname.replace(/\/$/, '')
        if (nextRoute === route) return

        stopEnhancements?.()
        stopEnhancements = undefined
        document.getElementById('sors-active-listing-totals')?.remove()
        route = nextRoute

        if (route === '/market/buyorders') stopEnhancements = SORSBuyOrders.refresh()
        if (route === '/market/activelistings') stopEnhancements = SORSActiveListings.refresh()
    }

    update()
    window.navigation.addEventListener('navigatesuccess', update)
})()
