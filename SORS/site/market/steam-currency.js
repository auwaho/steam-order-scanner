/*
  Steam currency display helpers (data from Steam global.js g_rgCurrencyData)
*/
// Account and item-page content scripts share these helpers in the same tab.
var RG_CURRENCY_DATA = {
    "USD": {
        "strCode": "USD",
        "eCurrencyCode": 1,
        "strSymbol": "$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "GBP": {
        "strCode": "GBP",
        "eCurrencyCode": 2,
        "strSymbol": "£",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "EUR": {
        "strCode": "EUR",
        "eCurrencyCode": 3,
        "strSymbol": "€",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": " ",
        "strSymbolAndNumberSeparator": ""
    },
    "CHF": {
        "strCode": "CHF",
        "eCurrencyCode": 4,
        "strSymbol": "CHF",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": " ",
        "strSymbolAndNumberSeparator": " "
    },
    "RUB": {
        "strCode": "RUB",
        "eCurrencyCode": 5,
        "strSymbol": "руб.",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": "",
        "strSymbolAndNumberSeparator": " "
    },
    "BRL": {
        "strCode": "BRL",
        "eCurrencyCode": 7,
        "strSymbol": "R$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": " "
    },
    "JPY": {
        "strCode": "JPY",
        "eCurrencyCode": 8,
        "strSymbol": "¥",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "NOK": {
        "strCode": "NOK",
        "eCurrencyCode": 9,
        "strSymbol": "kr",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": " "
    },
    "IDR": {
        "strCode": "IDR",
        "eCurrencyCode": 10,
        "strSymbol": "Rp",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": " ",
        "strSymbolAndNumberSeparator": " "
    },
    "MYR": {
        "strCode": "MYR",
        "eCurrencyCode": 11,
        "strSymbol": "RM",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "PHP": {
        "strCode": "PHP",
        "eCurrencyCode": 12,
        "strSymbol": "P",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "SGD": {
        "strCode": "SGD",
        "eCurrencyCode": 13,
        "strSymbol": "S$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "THB": {
        "strCode": "THB",
        "eCurrencyCode": 14,
        "strSymbol": "฿",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "VND": {
        "strCode": "VND",
        "eCurrencyCode": 15,
        "strSymbol": "₫",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": ""
    },
    "KRW": {
        "strCode": "KRW",
        "eCurrencyCode": 16,
        "strSymbol": "₩",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "TRY": {
        "strCode": "TRY",
        "eCurrencyCode": 17,
        "strSymbol": "TL",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": " "
    },
    "UAH": {
        "strCode": "UAH",
        "eCurrencyCode": 18,
        "strSymbol": "₴",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": " ",
        "strSymbolAndNumberSeparator": ""
    },
    "MXN": {
        "strCode": "MXN",
        "eCurrencyCode": 19,
        "strSymbol": "Mex$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "CAD": {
        "strCode": "CAD",
        "eCurrencyCode": 20,
        "strSymbol": "CDN$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "AUD": {
        "strCode": "AUD",
        "eCurrencyCode": 21,
        "strSymbol": "A$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "NZD": {
        "strCode": "NZD",
        "eCurrencyCode": 22,
        "strSymbol": "NZ$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "PLN": {
        "strCode": "PLN",
        "eCurrencyCode": 6,
        "strSymbol": "zł",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": " ",
        "strSymbolAndNumberSeparator": " "
    },
    "CNY": {
        "strCode": "CNY",
        "eCurrencyCode": 23,
        "strSymbol": "¥",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "INR": {
        "strCode": "INR",
        "eCurrencyCode": 24,
        "strSymbol": "₹",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "CLP": {
        "strCode": "CLP",
        "eCurrencyCode": 25,
        "strSymbol": "CLP$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": " "
    },
    "PEN": {
        "strCode": "PEN",
        "eCurrencyCode": 26,
        "strSymbol": "S/.",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "COP": {
        "strCode": "COP",
        "eCurrencyCode": 27,
        "strSymbol": "COL$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": " "
    },
    "ZAR": {
        "strCode": "ZAR",
        "eCurrencyCode": 28,
        "strSymbol": "R",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": " ",
        "strSymbolAndNumberSeparator": " "
    },
    "HKD": {
        "strCode": "HKD",
        "eCurrencyCode": 29,
        "strSymbol": "HK$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "TWD": {
        "strCode": "TWD",
        "eCurrencyCode": 30,
        "strSymbol": "NT$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "SAR": {
        "strCode": "SAR",
        "eCurrencyCode": 31,
        "strSymbol": "SR",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "AED": {
        "strCode": "AED",
        "eCurrencyCode": 32,
        "strSymbol": "AED",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "SEK": {
        "strCode": "SEK",
        "eCurrencyCode": 33,
        "strSymbol": "kr",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "ARS": {
        "strCode": "ARS",
        "eCurrencyCode": 34,
        "strSymbol": "ARS$",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": " "
    },
    "ILS": {
        "strCode": "ILS",
        "eCurrencyCode": 35,
        "strSymbol": "₪",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "BYN": {
        "strCode": "BYN",
        "eCurrencyCode": 36,
        "strSymbol": "Br",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    },
    "KZT": {
        "strCode": "KZT",
        "eCurrencyCode": 37,
        "strSymbol": "₸",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": " ",
        "strSymbolAndNumberSeparator": ""
    },
    "KWD": {
        "strCode": "KWD",
        "eCurrencyCode": 38,
        "strSymbol": "KD",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "QAR": {
        "strCode": "QAR",
        "eCurrencyCode": 39,
        "strSymbol": "QR",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "CRC": {
        "strCode": "CRC",
        "eCurrencyCode": 40,
        "strSymbol": "₡",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": ""
    },
    "UYU": {
        "strCode": "UYU",
        "eCurrencyCode": 41,
        "strSymbol": "$U",
        "bSymbolIsPrefix": true,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ",",
        "strThousandsSeparator": ".",
        "strSymbolAndNumberSeparator": ""
    },
    "BGN": {
        "strCode": "BGN",
        "eCurrencyCode": 42,
        "strSymbol": "лв",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "HRK": {
        "strCode": "HRK",
        "eCurrencyCode": 43,
        "strSymbol": "kn",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "CZK": {
        "strCode": "CZK",
        "eCurrencyCode": 44,
        "strSymbol": "Kč",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "DKK": {
        "strCode": "DKK",
        "eCurrencyCode": 45,
        "strSymbol": "kr.",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "HUF": {
        "strCode": "HUF",
        "eCurrencyCode": 46,
        "strSymbol": "Ft",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "RON": {
        "strCode": "RON",
        "eCurrencyCode": 47,
        "strSymbol": "lei",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": false,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": " "
    },
    "RMB": {
        "strCode": "RMB",
        "eCurrencyCode": 9000,
        "strSymbol": "刀币",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": "",
        "strSymbolAndNumberSeparator": " "
    },
    "NXP": {
        "strCode": "NXP",
        "eCurrencyCode": 9001,
        "strSymbol": "원",
        "bSymbolIsPrefix": false,
        "bWholeUnitsOnly": true,
        "strDecimalSymbol": ".",
        "strThousandsSeparator": ",",
        "strSymbolAndNumberSeparator": ""
    }
}

function getCurrencyCodeById(currencyId) {
    for (const code in RG_CURRENCY_DATA) {
        if (RG_CURRENCY_DATA[code].eCurrencyCode === currencyId) {
            return code
        }
    }
    return null
}

function getCurrencyPrefixSuffix(currencyId) {
    const code = getCurrencyCodeById(parseInt(currencyId))
    if (!code) return ['', '']

    const currencyData = RG_CURRENCY_DATA[code]
    const separator = currencyData.strSymbolAndNumberSeparator ?? ''

    if (currencyData.bSymbolIsPrefix) {
        return [currencyData.strSymbol + separator, '']
    }

    return ['', separator + currencyData.strSymbol]
}

function formatSteamMoney(amount, currencyId) {
    const currency = Number(currencyId)
    const [prefix, suffix] = getCurrencyPrefixSuffix(currency)
    const details = RG_CURRENCY_DATA[getCurrencyCodeById(currency)]
    const decimals = details?.bWholeUnitsOnly && amount % 100 === 0 ? 0 : 2
    const [whole, fraction] = (amount / 100).toFixed(decimals).split('.')
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, () => details?.strThousandsSeparator ?? ',')
    const number = fraction === undefined ? grouped : grouped + (details?.strDecimalSymbol ?? '.') + fraction
    return `${prefix}${number}${suffix}`
}
