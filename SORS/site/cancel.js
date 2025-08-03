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

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.cancelRequestSORS) {
        sendResponse({
            cancelResponseSORS: request.cancelRequestSORS
        });
        cancelBadOrder(request.cancelRequestSORS)
    }
});

// function cancelBadOrder(params) {
//     return new Promise(function (resolve, reject) {
//         var xhr = new XMLHttpRequest();
//         xhr.open('POST', "https://steamcommunity.com/market/cancelbuyorder/", true);
//         xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
//         xhr.onreadystatechange = function () {
//             if (this.status == 200) {
//                 resolve(this.response);
//             } else {
//                 var error = new Error(this.statusText);
//                 error.code = this.status;
//                 reject(error);
//             }
//         }
//         xhr.onerror = function () {
//             reject(new Error("Network Error"));
//         };
//         xhr.send(params);
//     });
// }

function cancelBadOrder(params) {
    fetch('https://steamcommunity.com/market/cancelbuyorder', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: params
    });
}