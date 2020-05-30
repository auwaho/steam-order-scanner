chrome.storage.local.get(['scanEndTimeSLS', 'scanTableSLS'], function (result) {
    var tableHtml = `<caption><b>LAST FULL SCAN:</b> ${result.scanEndTimeSLS}</caption><tbody><tr><td><b>ID</b></td><td><b>APP ID</b></td><td><b>ITEM LINK</b></td><td><b>ORDER</b/></td><td><b>PROFIT</b></td></tr>${result.scanTableSLS}</tbody>`;
    var tableRef = document.getElementById('sorsTable');
    tableRef.innerHTML = tableHtml;
})