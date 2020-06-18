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

chrome.storage.local.get(['scanEndTimeSLS', 'scanTableSLS'], function (result) {
    var tableHtml = `<caption><b>LAST FULL SCAN:</b> ${result.scanEndTimeSLS}</caption><tbody><tr><td><b>ID</b></td><td><b>APP ID</b></td><td><b>ITEM LINK</b></td><td><b>ORDER</b/></td><td><b>PROFIT</b></td></tr>${result.scanTableSLS}</tbody>`;
    var tableRef = document.getElementById('sorsTable');
    tableRef.innerHTML = tableHtml;
})