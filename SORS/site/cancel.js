chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.cancelRequestSORS) {
        sendResponse({
            cancelResponseSORS: request.cancelRequestSORS
        });
        cancelBadOrder(request.cancelRequestSORS)
    }
});

function cancelBadOrder(params) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', "https://steamcommunity.com/market/cancelbuyorder/", true);
        xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        xhr.onreadystatechange = function () {
            if (this.status == 200) {
                resolve(this.response);
            } else {
                var error = new Error(this.statusText);
                error.code = this.status;
                reject(error);
            }
        }
        xhr.onerror = function () {
            reject(new Error("Network Error"));
        };
        xhr.send(params);
    });
}