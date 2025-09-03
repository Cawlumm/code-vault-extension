// options.js

// Pick the correct API object
const ext = typeof browser !== "undefined" ? browser : chrome;

async function load() {
    const data = await ext.storage.sync.get({
        apiBaseUrl: "",
        loginPathOverride: "",
        tagDefaults: ""
    });
    console.log(document.getElementById("apiBaseUrl").value);
    document.getElementById("apiBaseUrl").value = data.apiBaseUrl;
    document.getElementById("loginPathOverride").value = data.loginPathOverride;
    document.getElementById("tagDefaults").value = data.tagDefaults;
}

async function save() {
    const apiBaseUrl = document.getElementById("apiBaseUrl").value.trim();
    const loginPathOverride = document.getElementById("loginPathOverride").value.trim();
    const tagDefaults = document.getElementById("tagDefaults").value.trim();

    await ext.storage.sync.set({ apiBaseUrl, loginPathOverride, tagDefaults });

    const saved = document.getElementById("saved");
    saved.textContent = "Saved";
    setTimeout(() => (saved.textContent = ""), 1200);
}

document.getElementById("save").addEventListener("click", save);
load();
