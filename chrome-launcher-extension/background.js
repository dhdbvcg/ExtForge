const TARGET_URL = 'http://127.0.0.1:8601';

function openEditor() {
    chrome.tabs.query({ url: TARGET_URL }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { active: true });
            chrome.windows.update(tabs[0].windowId, { focused: true });
        } else {
            chrome.tabs.create({ url: TARGET_URL, active: true });
        }
    });
}

chrome.runtime.onStartup.addListener(() => {
    openEditor();
});

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        openEditor();
    }
});
