/*
  Fee calculation logic vendored from Steam economy_common.js
  https://community.akamai.steamstatic.com/public/javascript/economy_common.js
  Last synced: 2026-05-31
*/

function ToValidMarketPrice(nPrice, rgWallet) {
    const nFloor = parseInt(rgWallet.wallet_market_minimum ?? 1)
    const nIncrement = parseInt(rgWallet.wallet_currency_increment ?? 1)

    if (nPrice <= nFloor) {
        return nFloor
    }
    if (nPrice <= nIncrement) {
        return nIncrement
    }
    if (nIncrement > 1) {
        let dAmount = nPrice / nIncrement
        const dSign = dAmount < 0 ? -1 : 1
        dAmount = dSign * Math.floor(Math.abs(dAmount) + 0.5) * nIncrement
        return dAmount
    }
    return nPrice
}

function CalculateFee(base_amt, pct, rgWallet) {
    if (pct > 0) {
        return ToValidMarketPrice(Math.floor(base_amt * pct), rgWallet)
    }
    return 0
}

function GetTotalWithFees(base_amt, ppct, spct, rgWallet) {
    const nBase = ToValidMarketPrice(base_amt, rgWallet)
    const nPubFee = CalculateFee(base_amt, ppct, rgWallet)
    const nSteamFee = CalculateFee(base_amt, spct, rgWallet)
    return nBase + nPubFee + nSteamFee
}

function GetItemPriceFromTotal(nTotal, rgWallet) {
    const ppct = parseFloat(rgWallet.wallet_publisher_fee_percent_default ?? 0.1)
    const spct = parseFloat(rgWallet.wallet_fee_percent ?? 0.05)
    const nIncrement = parseInt(rgWallet.wallet_currency_increment ?? 1)
    const nFloor = parseInt(rgWallet.wallet_market_minimum ?? 1)

    const nInitialGuess = Math.floor(nTotal / (1.0 + ppct + spct))
    const nMaxBase = nTotal - 2 * nFloor

    let nBase = ToValidMarketPrice(Math.min(nInitialGuess, nMaxBase), rgWallet)

    for (let i = 0; i < 3; i++) {
        const nCalculated = GetTotalWithFees(nBase, ppct, spct, rgWallet)
        if (nCalculated === nTotal) {
            return nBase
        }
        if (nCalculated < nTotal) {
            nBase += nIncrement
        } else {
            nBase -= nIncrement
            break
        }
    }

    return Math.max(nFloor, nBase)
}
