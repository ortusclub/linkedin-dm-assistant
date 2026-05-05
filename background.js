const ORTUS_DM_EXPECTED_CONTENT_VERSION = "1.2";
const ORTUS_DM_MESSAGE_SOURCE = `ortus-dm:${ORTUS_DM_EXPECTED_CONTENT_VERSION}`;

const COMMAND_TO_ACTION = {
    "open-message": "openMessage",
    "paste-dm": "pasteDm",
    "paste-intro": "pasteIntro",
    "send-message": "sendMessage"
};

chrome.commands.onCommand.addListener(async (command) => {
    const action = COMMAND_TO_ACTION[command];
    if (!action) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    try {
        await ensureContentScript(tab.id);
        await chrome.tabs.sendMessage(tab.id, { source: ORTUS_DM_MESSAGE_SOURCE, action });
    } catch (error) {
        console.log("Ortus DM Assistant: command dispatch failed", error);
    }
});

async function ensureContentScript(tabId) {
    const [{ result: loadedVersion } = {}] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__ORTUS_DM_ASSISTANT_VERSION__ || null
    });

    if (loadedVersion === ORTUS_DM_EXPECTED_CONTENT_VERSION) return;

    await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
    });
}
