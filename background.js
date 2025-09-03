// background.js  — cross-browser (Chrome MV3 SW + Firefox MV2 bg script)

// Pick the correct API object
const ext = typeof browser !== "undefined" ? browser : chrome;

// Badge helpers (action in MV3 / recent FF, browserAction for FF MV2)
const badge = {
    async setText(text) {
        try {
            if (ext.action && ext.action.setBadgeText) {
                await ext.action.setBadgeText({ text });
            } else if (ext.browserAction && ext.browserAction.setBadgeText) {
                // Firefox MV2 doesn't return a Promise; ignore return value
                ext.browserAction.setBadgeText({ text });
            }
        } catch (_) {}
    },
    async clear(afterMs = 1500) {
        setTimeout(() => {
            try {
                if (ext.action && ext.action.setBadgeText) {
                    ext.action.setBadgeText({ text: "" });
                } else if (ext.browserAction && ext.browserAction.setBadgeText) {
                    ext.browserAction.setBadgeText({ text: "" });
                }
            } catch (_) {}
        }, afterMs);
    }
};

// Map to your API’s actual DTO field names here if needed
function payloadForApi({ title, content, language, tags, sourceUrl, sourceTitle }) {
    return {
        title,
        content,
        language,
        tags,
        sourceUrl,
        sourceTitle
        // If your DTO uses different names, remap here
    };
}

async function readSettings() {
    const { apiBaseUrl, token, tagDefaults } = await ext.storage.sync.get({
        apiBaseUrl: "",
        token: "",
        tagDefaults: ""
    });
    return { apiBaseUrl, token, tagDefaults };
}

// background.js  — cross-browser (Chrome MV3 SW + Firefox MV2 bg script)

// Simple JWT decoder (to check expiry if we want)
function decodeJwt(token) {
    try {
        const base64 = token.split(".")[1];
        const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
        // `escape` is deprecated but widely available in bg contexts
        return JSON.parse(decodeURIComponent(escape(json)));
    } catch {
        return null;
    }
}

function guessLanguage({ selectionText = "", url = "", title = "" }) {
    const lowerUrl = (url || "").toLowerCase();

    // 1) by file extension
    const extMap = {
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".jsx": "jsx",
        ".py": "python",
        ".java": "java",
        ".kt": "kotlin",
        ".go": "go",
        ".rb": "ruby",
        ".rs": "rust",
        ".php": "php",
        ".cs": "csharp",
        ".cpp": "cpp",
        ".c": "c",
        ".m": "objective-c",
        ".swift": "swift",
        ".sh": "bash",
        ".sql": "sql",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".json": "json",
        ".html": "html",
        ".css": "css",
        ".scss": "scss"
    };
    for (const [extn, lang] of Object.entries(extMap)) {
        if (lowerUrl.includes(extn)) return lang;
        if ((title || "").toLowerCase().includes(extn)) return lang;
    }

    // 2) fenced code with language ```lang
    const fence = selectionText.match(/```(\w+)\s/);
    if (fence && fence[1]) return fence[1].toLowerCase();

    // 3) keyword heuristics
    const s = selectionText;
    if (/^\s*#include|std::|<iostream>/.test(s)) return "cpp";
    if (/^\s*import\s+java|class\s+\w+\s*{/.test(s)) return "java";
    if (/^\s*def\s+\w+\(|^\s*import\s+\w+/.test(s)) return "python";
    if (/^\s*function\s+\w+\(|=>\s*{/.test(s)) return "javascript";
    if (/^\s*SELECT\s+|^\s*INSERT\s+|^\s*UPDATE\s+|^\s*DELETE\s+/i.test(s)) return "sql";
    if (/^\s*package\s+\w+;/.test(s)) return "java";
    if (/^\s*fn\s+\w+\(/.test(s)) return "rust";
    if (/^\s*console\.log/.test(s)) return "javascript";

    return "text";
}

async function saveSnippetFromSelection(info, tab) {
    // Store the selection data in local storage for the popup to access
    await ext.storage.local.set({
        pendingSnippet: {
            content: info.selectionText || "",
            sourceUrl: tab?.url || "",
            sourceTitle: tab?.title || "",
            language: guessLanguage({
                selectionText: info.selectionText,
                url: tab?.url,
                title: tab?.title
            })
        }
    });

    // Show a visual indicator that content is ready
    await badge.setText("...");

    // Optional: Change the icon or show a notification
    if (ext.action) {
        await ext.action.setTitle({ title: "Click to edit snippet" });
    } else if (ext.browserAction) {
        await ext.browserAction.setTitle({ title: "Click to edit snippet" });
    }
}

// Add this to clean up the badge when popup opens
ext.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.type === "popupOpened") {
        // Clear badge text
        if (ext.action) {
            await ext.action.setBadgeText({ text: "" });
            await ext.action.setTitle({ title: "" });
        } else if (ext.browserAction) {
            ext.browserAction.setBadgeText({ text: "" });
            ext.browserAction.setTitle({ title: "" });
        }
    }
});

// Installation/registration of menu
function onInstalled() {
    // Firefox MV2 + Chrome MV3 both support contextMenus with "contextMenus" permission
    ext.contextMenus.create({
        id: "saveToCodeVault",
        title: "Save selection to Code Vault",
        contexts: ["selection"]
    });
}

// Chrome MV3: runtime.onInstalled.addListener is available in SW
// Firefox MV2: same in bg script
ext.runtime.onInstalled.addListener(onInstalled);

// Context menu click
ext.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "saveToCodeVault") {
        saveSnippetFromSelection(info, tab);
    }
})