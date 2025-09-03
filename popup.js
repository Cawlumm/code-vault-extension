// popup.js

// Call initialization when popup opens
document.addEventListener('DOMContentLoaded', initializePopup);

// Add these helper functions at the top
function setCookie(name, value, days = 7) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function getCookie(name) {
    return document.cookie
        .split('; ')
        .find(row => row.startsWith(name + '='))
        ?.split('=')[1];
}

function deleteCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

// Update setToken function
async function setToken(token) {
    await ext.storage.sync.set({ token });
    setCookie('auth_token', token);
    updateUI(!!token);
}

// Add UI management function
// function updateUI(isLoggedIn) {
//     const loginSection = document.querySelector('.card:has(#loginBtn)');
//     const saveSection = document.querySelector('.card:has(#saveBtn)');
//     const logoutBtn = document.getElementById('logoutBtn');
//
//     if (isLoggedIn) {
//         loginSection.style.display = 'none';
//         saveSection.style.display = 'block';
//         logoutBtn.style.display = 'inline';
//     } else {
//         loginSection.style.display = 'block';
//         saveSection.style.display = 'none';
//         logoutBtn.style.display = 'none';
//     }
// }

// Update logout handler
document.getElementById("logoutBtn").addEventListener("click", async () => {
    await setToken("");
    deleteCookie('auth_token');
    document.getElementById("loginStatus").textContent = "Logged out";
    updateUI(false);
});

// Add initialization code
async function initializePopup() {
    const { token } = await settings();
    const cookieToken = getCookie('auth_token');

    if (cookieToken && !token) {
        await setToken(cookieToken);
    } else if (token && !cookieToken) {
        setCookie('auth_token', token);
    }

    updateUI(!!token || !!cookieToken);
}



// Use Firefox's `browser.*` if available, otherwise Chrome's `chrome.*`
const ext = typeof browser !== "undefined" ? browser : chrome;

function guessLangFromText(text) {
    if (/```(\w+)/.test(text)) return RegExp.$1.toLowerCase();
    if (/^\s*def\s+\w+\(/m.test(text)) return "python";
    if (/^\s*function\s+\w+\(|=>\s*{/.test(text)) return "javascript";
    if (/^\s*class\s+\w+\s*{/.test(text)) return "java";
    return "";
}

async function settings() {
    // Both Chrome MV3 and Firefox support promise-based storage now.
    return await ext.storage.sync.get({
        apiBaseUrl: "",
        token: "",
        loginPathOverride: "", // optional
    });
}
async function login(apiBaseUrl, email, password, loginPathOverride) {
    const endpoint = loginPathOverride
        ? [loginPathOverride]
        : ["/api/auth/login"];
    console.log(`endpoints to try: ${endpoint.join(", ")}`);

        try {
            const res = await fetch(`${apiBaseUrl.replace(/\/+$/,"")}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            const token = data.token || data.accessToken || data.jwt || data.access_token;
            if (token) return token;
        } catch (err) {
            console.error('Endpoint failed:', endpoint, err);
        }
}

async function saveSnippet(apiBaseUrl, token, payload)
{
    console.log(token);

    const res = await fetch(`${apiBaseUrl.replace(/\/+$/,"")}/api/v1/snippets`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${text}`);
    }
}

// Open Options page (both browsers support this)
document.getElementById("openOptions").addEventListener("click", (e) => {
    e.preventDefault();
    // Firefox returns a Promise, Chrome doesn't — ignoring the return is fine in both.
    ext.runtime.openOptionsPage();
});

document.getElementById("loginBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const loginBtn = document.getElementById("loginBtn");
    loginBtn.disabled = true;
    showLoader('loginLoader');

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const { apiBaseUrl, loginPathOverride } = await settings();
    const status = document.getElementById("loginStatus");

    try {
        status.textContent = "Logging in...";
        const token = await login(apiBaseUrl, email, password, loginPathOverride);
        await setToken(token);
        status.textContent = "Logged in";
    } catch (err) {
        console.error('Login error:', err);
        status.textContent = err.message;
    } finally {
        loginBtn.disabled = false;
        hideLoader('loginLoader');
    }
});

document.getElementById("saveBtn").addEventListener("click", async () => {
    const saveBtn = document.getElementById("saveBtn");
    saveBtn.disabled = true;
    showLoader('saveLoader');
    const title = document.getElementById("title").value.trim() || "Untitled snippet";
    const language = document.getElementById("language").value.trim();
    const tags = document.getElementById("tags").value.split(",").map(t => t.trim()).filter(Boolean);
    const content = document.getElementById("content").value;
    const { apiBaseUrl, token } = await settings();
    const status = document.getElementById("saveStatus");

    if (!apiBaseUrl) return (status.textContent = "Set API base URL in Options.");
    if (!token) return (status.textContent = "Please log in first.");
    if (!content.trim()) return (status.textContent = "Nothing to save.");

    const lang = language || guessLangFromText(content) || "text";

    let sourceUrl = "";
    let sourceTitle = "";
    try {
        const tabs = await ext.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs[0]) {
            sourceUrl = tabs[0].url || "";
            sourceTitle = tabs[0].title || "";
        }
    } catch (_) {
        // Ignore errors from restricted pages
    }

    const payload = {
        title,
        body: content,
        language: lang,
        tags,
        meta: {
            sourceUrl,
            sourceTitle
        }
    };

    status.textContent = "Saving...";
    try {
        await saveSnippet(apiBaseUrl, token, payload);
        status.textContent = "Saved";
        document.getElementById("content").value = "";
        document.getElementById("language").value = "";
        document.getElementById("title").value = "";
        document.getElementById("tags").value = "";
    } catch (e) {
        status.textContent = e.message;
    } finally {
        saveBtn.disabled = false;
        hideLoader('saveLoader');
    }
});

// Pre-fill language on paste
document.getElementById("content").addEventListener("input", (e) => {
    const proposed = guessLangFromText(e.target.value);
    if (proposed && !document.getElementById("language").value) {
        document.getElementById("language").value = proposed;
    }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
    await setToken("");
    document.getElementById("loginStatus").textContent = "Logged out";
});


// Add this at the beginning of your popup.js
async function checkPendingSnippet() {
    const { pendingSnippet } = await ext.storage.local.get('pendingSnippet');
    if (pendingSnippet) {
        // Fill the form fields
        document.getElementById("content").value = pendingSnippet.content;
        document.getElementById("language").value = pendingSnippet.language;

        // Generate a title from the first line or content
        const suggestedTitle = pendingSnippet.content
            .split('\n')[0]
            .slice(0, 50) + (pendingSnippet.content.length > 50 ? '...' : '');
        document.getElementById("title").value = suggestedTitle;

        // Store source info for the save function to use
        window.sourceInfo = {
            sourceUrl: pendingSnippet.sourceUrl,
            sourceTitle: pendingSnippet.sourceTitle
        };

        // Clear the pending snippet
        await ext.storage.local.remove('pendingSnippet');
    }
}

// Add at the start of popup.js
document.addEventListener('DOMContentLoaded', async () => {
    // Clear the badge when popup opens
    await ext.runtime.sendMessage({ type: "popupOpened" });
    await checkPendingSnippet();
});

// Add these helper functions for UI toggling
function showLoginForm() {
    document.getElementById('loginFields').style.display = 'block';
    document.getElementById('registerFields').style.display = 'none';
    document.getElementById('loginBtn').style.display = 'block';
    document.getElementById('registerBtn').style.display = 'none';
    document.getElementById('toggleRegister').style.display = 'block';
    document.getElementById('toggleLogin').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginFields').style.display = 'none';
    document.getElementById('registerFields').style.display = 'block';
    document.getElementById('loginBtn').style.display = 'none';
    document.getElementById('registerBtn').style.display = 'block';
    document.getElementById('toggleRegister').style.display = 'none';
    document.getElementById('toggleLogin').style.display = 'block';
}

// Add register function
async function register(apiBaseUrl, email, password, confirmPassword) {
    // if (password !== confirmPassword) {
    //     throw new Error("Passwords do not match");
    // }

    const res = await fetch(`${apiBaseUrl.replace(/\/+$/,"")}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Registration failed: ${text || res.statusText}`);
    }

    const data = await res.json();
    const token = data.token || data.accessToken || data.jwt || data.access_token;
    if (token) return token;
    throw new Error("Registration successful. Please login.");
}

// Modify your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async () => {
    await ext.runtime.sendMessage({ type: "popupOpened" });
    await checkPendingSnippet();
    await initializePopup();
    showLoginForm(); // Start with login form
});

// Add toggle event listeners
document.getElementById("toggleRegister").addEventListener("click", (e) => {
    e.preventDefault();
    showRegisterForm();
});

document.getElementById("toggleLogin").addEventListener("click", (e) => {
    e.preventDefault();
    showLoginForm();
});

// Add register button event listener
document.getElementById("registerBtn").addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const registerBtn = document.getElementById("registerBtn");
    registerBtn.disabled = true;
    showLoader('loginLoader');

    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const { apiBaseUrl } = await settings();
    const status = document.getElementById("loginStatus");

    try {
        status.textContent = "Registering...";
        const token = await register(apiBaseUrl, email, password);
        if (token) {
            await setToken(token);
            status.textContent = "Registration successful!";
            updateUI(true);
        } else {
            status.textContent = "Registration successful. Please login.";
            showLoginForm();
        }
    } catch (err) {
        console.error('Registration error:', err);
        status.textContent = err.message;
    } finally {
        registerBtn.disabled = false;
        hideLoader('loginLoader');
    }
});

// Add these helper functions
function showLoader(loaderId) {
    document.getElementById(loaderId).style.display = 'inline-block';
}

function hideLoader(loaderId) {
    document.getElementById(loaderId).style.display = 'none';
}

// Add these variables at the top of the file
let page = 0;
const PAGE_SIZE = 10;
let loading = false;
let hasMore = true;

// Add this function to fetch snippets
async function fetchSnippets(page = 0) {
    const { apiBaseUrl, token } = await settings();
    if (!token) return null;

    const res = await fetch(
        `${apiBaseUrl.replace(/\/+$/,"")}/api/v1/snippets?page=${page}&size=${PAGE_SIZE}`, {
            headers: {
                "Authorization": `Bearer ${token}`,
            }
        });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

// Add function to create snippet element
function createSnippetElement(snippet) {
    const div = document.createElement('div');
    div.className = 'snippet-item';
    div.innerHTML = `
        <div class="snippet-title">${escapeHtml(snippet.title)}</div>
        <div class="snippet-meta">
            <span class="snippet-language">${escapeHtml(snippet.language || 'text')}</span>
            <span>${new Date(snippet.createdAt).toLocaleDateString()}</span>
        </div>
    `;

    div.addEventListener('click', () => {
        document.getElementById('title').value = snippet.title;
        document.getElementById('language').value = snippet.language || '';
        document.getElementById('content').value = snippet.body;
        document.getElementById('tags').value =
            Array.isArray(snippet.tags) ? snippet.tags.join(', ') : '';
    });

    return div;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
// Add function to load snippets
async function loadSnippets(append = false) {
    if (loading || !hasMore) return;

    const snippetsList = document.getElementById('snippetsList');
    const loader = document.getElementById('snippetsLoader');
    const status = document.getElementById('snippetsStatus');

    try {
        loading = true;
        loader.style.display = 'block';
        status.textContent = '';

        const data = await fetchSnippets(page);
        if (!append) {
            snippetsList.innerHTML = '';
        }

        if (data?.content?.length) {
            data.content.forEach(snippet => {
                snippetsList.appendChild(createSnippetElement(snippet));
            });
            hasMore = !data.last;
            page++;
        } else {
            hasMore = false;
            if (page === 0) {
                status.textContent = 'No snippets found';
            }
        }
    } catch (err) {
        console.error('Error loading snippets:', err);
        status.textContent = 'Failed to load snippets';
    } finally {
        loading = false;
        loader.style.display = 'none';
    }
}

// Add scroll handler for infinite scroll
function handleSnippetsScroll(e) {
    const element = e.target;
    if (element.scrollHeight - element.scrollTop - element.clientHeight < 50) {
        loadSnippets(true);
    }
}

// Update the updateUI function to handle snippets section
function updateUI(isLoggedIn) {
    const loginSection = document.querySelector('.card:has(#loginBtn)');
    const saveSection = document.querySelector('.card:has(#saveBtn)');
    const snippetsSection = document.querySelector('.snippets-section');
    const logoutBtn = document.getElementById('logoutBtn');

    if (isLoggedIn) {
        loginSection.style.display = 'none';
        saveSection.style.display = 'block';
        snippetsSection.style.display = 'block';
        logoutBtn.style.display = 'inline';
        // Load initial snippets
        page = 0;
        hasMore = true;
        loadSnippets();
    } else {
        loginSection.style.display = 'block';
        saveSection.style.display = 'none';
        snippetsSection.style.display = 'none';
        logoutBtn.style.display = 'none';
    }
}

// Add this to your DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async () => {
    await ext.runtime.sendMessage({ type: "popupOpened" });
    await checkPendingSnippet();
    await initializePopup();
    showLoginForm();

    // Add scroll listener for infinite scroll
    document.querySelector('.snippets-section').addEventListener('scroll', handleSnippetsScroll);
});

// Update the save snippet success handler to refresh the snippets list
document.getElementById("saveBtn").addEventListener("click", async () => {
    // ... existing save logic ...
    try {
        await saveSnippet(apiBaseUrl, token, payload);
        status.textContent = "Saved";
        document.getElementById("content").value = "";
        document.getElementById("language").value = "";
        document.getElementById("title").value = "";
        document.getElementById("tags").value = "";
        // Refresh snippets list
        page = 0;
        hasMore = true;
        loadSnippets();
    } catch (e) {
        status.textContent = e.message;
    } finally {
        saveBtn.disabled = false;
        hideLoader('saveLoader');
    }
});