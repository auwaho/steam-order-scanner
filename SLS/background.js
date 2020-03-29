chrome.runtime.onInstalled.addListener(function () {
  chrome.storage.sync.get(["cancelHighOrdersSLS"], function (result) {
    if (typeof result.cancelHighOrdersSLS == "undefined") {
      chrome.storage.sync.set({
        cancelHighOrdersSLS: false
      });
    }
  });
  chrome.storage.sync.get(["cancelLowOrdersSLS"], function (result) {
    if (typeof result.cancelLowOrdersSLS == "undefined") {
      chrome.storage.sync.set({
        cancelLowOrdersSLS: false
      });
    }
  });
  chrome.storage.sync.get(["showMoreOrdersSLS"], function (result) {
    if (typeof result.showMoreOrdersSLS == "undefined") {
      chrome.storage.sync.set({
        showMoreOrdersSLS: true
      });
    }
  });
  chrome.storage.sync.get(["showMoreOrdersQntSLS"], function (result) {
    if (typeof result.showMoreOrdersQntSLS == "undefined") {
      chrome.storage.sync.set({
        showMoreOrdersQntSLS: 20
      });
    }
  });
  chrome.storage.sync.get(["autoScanOrdersSLS"], function (result) {
    if (typeof result.autoScanOrdersSLS == "undefined") {
      chrome.storage.sync.set({
        autoScanOrdersSLS: false
      });
    }
  });
  chrome.storage.sync.get(["autoScanOrdersDelaySLS"], function (result) {
    if (typeof result.autoScanOrdersDelaySLS == "undefined") {
      chrome.storage.sync.set({
        autoScanOrdersDelaySLS: 20
      });
    }
  });
  chrome.storage.sync.get(["scanButtonSLS"], function (result) {
    if (typeof result.scanButtonSLS == "undefined") {
      chrome.storage.sync.set({
        scanButtonSLS: "start scan"
      });
    }
  });
});
chrome.storage.sync.get(["lowOrdersPctSLS"], function (result) {
  if (typeof result.lowOrdersPctSLS == "undefined") {
    chrome.storage.sync.set({
      lowOrdersPctSLS: 20
    });
  }
  chrome.storage.sync.get(["timeoutPerOrderSLS"], function (result) {
    if (typeof result.timeoutPerOrderSLS == "undefined") {
      chrome.storage.sync.set({
        timeoutPerOrderSLS: 1000
      });
    }
  });
});