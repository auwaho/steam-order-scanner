const scanButton = document.getElementById("scanButton");
const cancelHighOrders = document.getElementById("cancelHighOrders");
const cancelLowOrders = document.getElementById("cancelLowOrders");
const showMoreOrders = document.getElementById("showMoreOrders");
const showMoreOrdersQnt = document.getElementById("showMoreOrdersQnt");
const autoScanOrders = document.getElementById("autoScanOrders");
const autoScanOrdersDelay = document.getElementById("autoScanOrdersDelay");

/////////////подгружаем сохраненные данные/////////////
chrome.storage.sync.get(["cancelHighOrdersSLS"], function (result) {
  cancelHighOrders.checked = result.cancelHighOrdersSLS;
});
chrome.storage.sync.get(["cancelLowOrdersSLS"], function (result) {
  cancelLowOrders.checked = result.cancelLowOrdersSLS;
});
chrome.storage.sync.get(["showMoreOrdersSLS"], function (result) {
  showMoreOrders.checked = result.showMoreOrdersSLS;
});
chrome.storage.sync.get(["showMoreOrdersQntSLS"], function (result) {
  showMoreOrdersQnt.value = result.showMoreOrdersQntSLS;
});
chrome.storage.sync.get(["autoScanOrdersSLS"], function (result) {
  autoScanOrders.checked = result.autoScanOrdersSLS;
});
chrome.storage.sync.get(["autoScanOrdersDelaySLS"], function (result) {
  autoScanOrdersDelay.value = result.autoScanOrdersDelaySLS;
});
chrome.storage.sync.get(["scanButtonSLS"], function (result) {
  scanButton.innerText = result.scanButtonSLS;
});

/////////////сохраняем данные по клику/////////////
cancelHighOrders.addEventListener("change", event => {
  if (event.target.checked) {
    chrome.storage.sync.set({
      cancelHighOrdersSLS: true
    });
  } else {
    chrome.storage.sync.set({
      cancelHighOrdersSLS: false
    });
  }
});
cancelLowOrders.addEventListener("change", event => {
  if (event.target.checked) {
    chrome.storage.sync.set({
      cancelLowOrdersSLS: true
    });
  } else {
    chrome.storage.sync.set({
      cancelLowOrdersSLS: false
    });
  }
});
showMoreOrders.addEventListener("change", event => {
  if (event.target.checked) {
    chrome.storage.sync.set({
      showMoreOrdersSLS: true
    });
  } else {
    chrome.storage.sync.set({
      showMoreOrdersSLS: false
    });
  }
});
showMoreOrdersQnt.addEventListener("change", () => {
  chrome.storage.sync.set({
    showMoreOrdersQntSLS: showMoreOrdersQnt.value
  });
});
autoScanOrders.addEventListener("change", event => {
  if (event.target.checked) {
    chrome.storage.sync.set({
      autoScanOrdersSLS: true
    });
  } else {
    chrome.storage.sync.set({
      autoScanOrdersSLS: false
    });
  }
});
autoScanOrdersDelay.addEventListener("change", () => {
  chrome.storage.sync.set({
    autoScanOrdersDelaySLS: autoScanOrdersDelay.value
  });
});
scanButton.addEventListener("click", () => {
  if (scanButton.innerText == "start scan") {
    chrome.tabs.executeScript({
      file: "scanner.js"
    });
    scanButton.innerText = "stop scan";
    chrome.storage.sync.set({
      scanButtonSLS: scanButton.innerText
    });
  } else {
    chrome.tabs.executeScript({
      file: "scanner.js"
    });
    scanButton.innerText = "start scan";
    chrome.storage.sync.set({
      scanButtonSLS: scanButton.innerText
    });
  }
  scanButton.disabled = true;
  setTimeout(() => {
    scanButton.disabled = false;
  }, 1500);
});

chrome.tabs.query({
  'active': true,
  'lastFocusedWindow': true
}, function (tabs) {
  if (tabs[0].url == "https://steamcommunity.com/market/") {
    scanButton.disabled = false;
  }
});