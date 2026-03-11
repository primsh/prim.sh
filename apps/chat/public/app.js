// app.js — chat.prim.sh client
// @ts-check

// ── State ──────────────────────────────────────────────────────────────────────
let currentConversationId = null;
let isStreaming = false;

// ── DOM refs ───────────────────────────────────────────────────────────────────
const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");
const authBtn = document.getElementById("auth-btn");
const authError = document.getElementById("auth-error");
const inviteCodeInput = document.getElementById("invite-code");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const menuBtn = document.getElementById("menu-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const addFundsBtn = document.getElementById("add-funds-btn");
const messagesEl = document.getElementById("messages");
const inputEl = document.getElementById("input");
const sendBtn = document.getElementById("send-btn");
const balanceEl = document.getElementById("balance");
const convsEl = document.getElementById("conversations");

// ── Init ───────────────────────────────────────────────────────────────────────
async function init() {
  registerServiceWorker();
  setupInputHandlers();
  setupSidebar();

  const authed = await checkSession();
  if (authed) {
    showChat();
  }
}

// ── Service Worker ─────────────────────────────────────────────────────────────
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

// ── Auth ───────────────────────────────────────────────────────────────────────
async function checkSession() {
  try {
    const res = await fetch("/api/balance");
    if (res.ok) return true;
    // 401 → try passkey login silently
    return await attemptLogin();
  } catch {
    return false;
  }
}

async function attemptLogin() {
  try {
    const optRes = await fetch("/auth/login/options", { method: "POST" });
    if (!optRes.ok) return false;
    const { options: loginOptions, challenge_id } = await optRes.json();

    const credential = await navigator.credentials.get({
      publicKey: decodePublicKeyOptions(loginOptions),
    });
    if (!credential) return false;

    const verifyRes = await fetch("/auth/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: encodeCredential(credential), challenge_id }),
    });
    return verifyRes.ok;
  } catch {
    return false;
  }
}

async function register() {
  authBtn.disabled = true;
  authBtn.textContent = "Setting up...";
  hideError();

  try {
    const optRes = await fetch("/auth/register/options", { method: "POST" });
    if (!optRes.ok) throw new Error("Failed to get registration options");
    const { options: regOptions, challenge_id } = await optRes.json();

    const credential = await navigator.credentials.create({
      publicKey: decodePublicKeyOptions(regOptions),
    });
    if (!credential) throw new Error("Registration cancelled");

    const inviteCode = inviteCodeInput?.value?.trim() || undefined;
    const verifyRes = await fetch("/auth/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential: encodeCredential(credential),
        challenge_id,
        invite_code: inviteCode,
      }),
    });
    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}));
      throw new Error(err.message || "Registration failed");
    }

    showChat();
  } catch (e) {
    showError(e.message || "Authentication failed. Try again.");
    authBtn.disabled = false;
    authBtn.textContent = "Get started";
  }
}

// ── WebAuthn helpers ───────────────────────────────────────────────────────────
function decodePublicKeyOptions(options) {
  // Decode base64url fields from server
  const decoded = { ...options };
  if (decoded.challenge) {
    decoded.challenge = base64urlToBuffer(decoded.challenge);
  }
  if (decoded.user?.id) {
    decoded.user.id = base64urlToBuffer(decoded.user.id);
  }
  if (decoded.excludeCredentials) {
    decoded.excludeCredentials = decoded.excludeCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }
  if (decoded.allowCredentials) {
    decoded.allowCredentials = decoded.allowCredentials.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    }));
  }
  return decoded;
}

function encodeCredential(cred) {
  const response = cred.response;
  const result = {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    response: {},
  };
  if (response.clientDataJSON) {
    result.response.clientDataJSON = bufferToBase64url(response.clientDataJSON);
  }
  if (response.attestationObject) {
    result.response.attestationObject = bufferToBase64url(response.attestationObject);
  }
  if (response.authenticatorData) {
    result.response.authenticatorData = bufferToBase64url(response.authenticatorData);
  }
  if (response.signature) {
    result.response.signature = bufferToBase64url(response.signature);
  }
  return result;
}

function base64urlToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function bufferToBase64url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ── UI transitions ─────────────────────────────────────────────────────────────
function showChat() {
  authScreen.hidden = true;
  chatScreen.hidden = false;
  inputEl.focus();
  loadBalance();
  loadConversations();
}

function showError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
}

function hideError() {
  authError.hidden = true;
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function setupSidebar() {
  menuBtn.addEventListener("click", () => toggleSidebar(true));
  sidebarOverlay.addEventListener("click", () => toggleSidebar(false));
  newChatBtn.addEventListener("click", () => {
    currentConversationId = null;
    clearMessages();
    toggleSidebar(false);
  });
  addFundsBtn.addEventListener("click", openFundingPage);
}

function toggleSidebar(open) {
  sidebar.classList.toggle("open", open);
  sidebarOverlay.hidden = !open;
}

function openFundingPage() {
  // Fetch wallet address then open pay.prim.sh
  fetch("/api/balance")
    .then((r) => r.json())
    .then((data) => {
      const wallet = data.wallet_address || "";
      const url = `https://pay.prim.sh?to=${wallet}&amount=5`;
      window.open(url, "_blank", "noopener");
    })
    .catch(() => {
      window.open("https://pay.prim.sh", "_blank", "noopener");
    });
}

// ── Balance ────────────────────────────────────────────────────────────────────
async function loadBalance() {
  try {
    const res = await fetch("/api/balance");
    if (!res.ok) return;
    const data = await res.json();
    balanceEl.textContent = `$${Number.parseFloat(data.balance_usdc || "0").toFixed(2)}`;
  } catch {
    balanceEl.textContent = "--";
  }
}

// ── Conversations ──────────────────────────────────────────────────────────────
async function loadConversations() {
  try {
    const res = await fetch("/api/conversations");
    if (!res.ok) return;
    const data = await res.json();
    renderConversations(data.conversations || []);
  } catch {
    // silent
  }
}

function renderConversations(convs) {
  convsEl.innerHTML = "";
  for (const c of convs) {
    const el = document.createElement("div");
    el.className = `conv-item${c.id === currentConversationId ? " active" : ""}`;
    el.textContent = c.title || "New conversation";
    el.addEventListener("click", () => loadConversation(c.id));
    convsEl.appendChild(el);
  }
}

async function loadConversation(id) {
  currentConversationId = id;
  toggleSidebar(false);
  clearMessages();

  try {
    const res = await fetch(`/api/conversations/${id}/messages`);
    if (!res.ok) return;
    const data = await res.json();
    for (const msg of data.messages || []) {
      appendMessage(msg.role, msg.content, msg.tool_calls);
    }
    loadConversations();
  } catch {
    // silent
  }
}

// ── Input handling ─────────────────────────────────────────────────────────────
function setupInputHandlers() {
  authBtn.addEventListener("click", register);

  inputEl.addEventListener("input", () => {
    autoResize();
    sendBtn.disabled = !inputEl.value.trim() || isStreaming;
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (inputEl.value.trim() && !isStreaming) sendMessage();
    }
  });

  sendBtn.addEventListener("click", () => {
    if (inputEl.value.trim() && !isStreaming) sendMessage();
  });
}

function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = `${Math.min(inputEl.scrollHeight, 150)}px`;
}

// ── Chat ───────────────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = "";
  autoResize();
  sendBtn.disabled = true;
  isStreaming = true;

  // Remove empty state
  const empty = messagesEl.querySelector(".empty-state");
  if (empty) empty.remove();

  // User message
  appendMessage("user", text);

  // Assistant placeholder
  const assistantEl = appendMessage("assistant", "");
  assistantEl.classList.add("streaming");
  const bubble = assistantEl.querySelector(".msg-bubble");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        conversation_id: currentConversationId,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      bubble.textContent = err.message || "Something went wrong.";
      assistantEl.classList.remove("streaming");
      isStreaming = false;
      sendBtn.disabled = false;
      return;
    }

    // Read SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let reasoningText = "";
    let reasoningEl = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);

        if (payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload);
          if (event.type === "reasoning") {
            if (!reasoningEl) {
              reasoningEl = document.createElement("details");
              reasoningEl.className = "reasoning-block";
              reasoningEl.open = true;
              const summary = document.createElement("summary");
              summary.textContent = "Thinking\u2026";
              reasoningEl.appendChild(summary);
              const content = document.createElement("div");
              content.className = "reasoning-content";
              reasoningEl.appendChild(content);
              bubble.appendChild(reasoningEl);
            }
            reasoningText += event.data;
            reasoningEl.querySelector(".reasoning-content").innerHTML =
              renderMarkdown(reasoningText);
            scrollToBottom();
          } else if (event.type === "token") {
            if (reasoningEl) {
              reasoningEl.open = false;
              reasoningEl.querySelector("summary").textContent = "Thought process";
              reasoningEl = null;
            }
            fullText += event.data;
            rebuildBubble(bubble, reasoningText, fullText);
            scrollToBottom();
          } else if (event.type === "tool_start") {
            const indicator = createToolIndicator(event.data);
            bubble.appendChild(indicator);
            scrollToBottom();
          } else if (event.type === "tool_end") {
            const indicators = bubble.querySelectorAll(
              `.tool-indicator[data-tool="${event.data.id}"]`,
            );
            for (const ind of indicators) ind.classList.add("done");
          } else if (event.type === "status") {
            bubble.textContent = event.data;
            scrollToBottom();
          } else if (event.type === "conversation_id") {
            currentConversationId = event.data;
          } else if (event.type === "error") {
            fullText += `\n\n_Error: ${event.data}_`;
            rebuildBubble(bubble, reasoningText, fullText);
          }
        } catch {
          // malformed JSON, skip
        }
      }
    }

    assistantEl.classList.remove("streaming");
    if (fullText || reasoningText) {
      rebuildBubble(bubble, reasoningText, fullText);
    }
  } catch (e) {
    bubble.textContent = "Connection lost. Please try again.";
    assistantEl.classList.remove("streaming");
  }

  isStreaming = false;
  sendBtn.disabled = !inputEl.value.trim();
  loadBalance();
  loadConversations();
}

function rebuildBubble(bubble, reasoning, text) {
  let html = "";
  if (reasoning) {
    html += `<details class="reasoning-block"><summary>Thought process</summary>`;
    html += `<div class="reasoning-content">${renderMarkdown(reasoning)}</div></details>`;
  }
  if (text) {
    html += renderMarkdown(text);
  }
  bubble.innerHTML = html;
}

// ── Message rendering ──────────────────────────────────────────────────────────
function appendMessage(role, content, toolCalls) {
  const el = document.createElement("div");
  el.className = `msg msg-${role}`;

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.innerHTML = content ? renderMarkdown(content) : "";

  if (toolCalls) {
    for (const tc of toolCalls) {
      const ind = createToolIndicator({ name: tc.name, id: tc.id });
      ind.classList.add("done");
      bubble.appendChild(ind);
    }
  }

  el.appendChild(bubble);
  messagesEl.appendChild(el);
  scrollToBottom();
  return el;
}

function clearMessages() {
  messagesEl.innerHTML = `
    <div class="empty-state">
      <div class="empty-logo">&gt;_</div>
      <p>What would you like to build?</p>
    </div>`;
}

function createToolIndicator(data) {
  const el = document.createElement("div");
  el.className = "tool-indicator";
  if (data.id) el.dataset.tool = data.id;

  const spinner = document.createElement("span");
  spinner.className = "tool-spinner";

  const label = document.createElement("span");
  label.textContent = toolLabel(data.name || data);

  el.appendChild(spinner);
  el.appendChild(label);
  return el;
}

function toolLabel(name) {
  const labels = {
    spawn_server: "Deploying server...",
    send_email: "Sending email...",
    create_wallet: "Creating wallet...",
    store_put: "Storing data...",
    dns_set: "Setting up DNS...",
    search: "Searching...",
  };
  return labels[name] || `Running ${name}...`;
}

// ── Markdown (minimal) ────────────────────────────────────────────────────────
function renderMarkdown(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

// ── Scroll ─────────────────────────────────────────────────────────────────────
function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Boot ───────────────────────────────────────────────────────────────────────
init();
