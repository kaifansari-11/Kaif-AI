// ── State ──
let uploadedContent = "";
let uploadedImages = [];
let uploadedImageFile = null;
let uploadedImagePath = null;

let sessions = {};       // { id: { title, messages: [] } }
let currentSessionId = null;

const SESSIONS_KEY = "kaif_ai_sessions";
const CURRENT_KEY  = "kaif_ai_current";

// ── Storage helpers ──
function saveSessions() {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(CURRENT_KEY, currentSessionId);
  } catch(e) {
    showToast("Storage full — old chats may not be saved.");
  }
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    sessions = raw ? JSON.parse(raw) : {};
    currentSessionId = localStorage.getItem(CURRENT_KEY);
  } catch(e) {
    sessions = {};
    currentSessionId = null;
  }
}

function getMessages() {
  return sessions[currentSessionId]?.messages || [];
}

// ── Session management ──
function createSession(title) {
  const id = "s_" + Date.now();
  sessions[id] = { title: title || "New chat", messages: [] };
  return id;
}

function switchSession(id) {
  currentSessionId = id;
  renderSessionList();
  renderChat();
  saveSessions();
}

function deleteSession(id, e) {
  e.stopPropagation();
  delete sessions[id];
  if (currentSessionId === id) {
    const ids = Object.keys(sessions);
    currentSessionId = ids.length ? ids[ids.length - 1] : null;
    if (!currentSessionId) {
      currentSessionId = createSession();
    }
  }
  saveSessions();
  renderSessionList();
  renderChat();
}

function newChat() {
  currentSessionId = createSession();
  saveSessions();
  renderSessionList();
  renderChat();
}

function autoTitleSession(text) {
  if (!sessions[currentSessionId]) return;
  if (sessions[currentSessionId].title !== "New chat") return;
  sessions[currentSessionId].title = text.slice(0, 40) + (text.length > 40 ? "…" : "");
  saveSessions();
  renderSessionList();
}

// ── Render sidebar session list ──
function renderSessionList() {
  const list = document.getElementById("sessionList");
  const ids = Object.keys(sessions).reverse();

  if (!ids.length) {
    list.innerHTML = `<p style="font-size:12px;color:var(--text3);padding:10px 12px;">No chats yet</p>`;
    return;
  }

  list.innerHTML = ids.map(id => `
    <div class="session-item ${id === currentSessionId ? 'active' : ''}" onclick="switchSession('${id}')">
      <span class="session-title">${escapeHtml(sessions[id].title)}</span>
      <button class="session-delete" onclick="deleteSession('${id}', event)" title="Delete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join("");
}

// ── Render chat messages ──
function renderChat() {
  const chatBox = document.getElementById("chat-box");
  const msgs = getMessages();

  if (!msgs.length) {
    chatBox.innerHTML = `
      <div class="welcome" id="welcomeScreen">
        <div class="welcome-logo">K</div>
        <h2>How can I help you?</h2>
        <p>Ask anything. Attach files, images, PDFs, or spreadsheets.</p>
        <div class="quick-prompts">
          <button class="qp-btn" onclick="quickPrompt('Explain how the internet works')">Explain the internet</button>
          <button class="qp-btn" onclick="quickPrompt('Write a Python script to sort a list')">Python sort script</button>
          <button class="qp-btn" onclick="quickPrompt('What are the best practices for REST APIs?')">REST API tips</button>
          <button class="qp-btn" onclick="quickPrompt('Help me debug my JavaScript code')">Debug JS code</button>
        </div>
      </div>`;
    return;
  }

  chatBox.innerHTML = `<div class="msg-wrap" id="msgWrap"></div>`;
  const wrap = document.getElementById("msgWrap");

  msgs.forEach(msg => {
    if (msg.role === "user") {
      wrap.appendChild(buildUserBubble(msg.display || msg.content, msg.imageUrl));
    } else if (msg.role === "assistant") {
      wrap.appendChild(buildAiBubble(msg.content));
    }
  });

  chatBox.scrollTop = chatBox.scrollHeight;
  hljs.highlightAll();
  addCopyButtons();
}

// ── Build message elements ──
function buildUserBubble(text, imageUrl) {
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const el = document.createElement("div");
  el.className = "msg user";
  el.innerHTML = `
    <div class="msg-avatar">Y</div>
    <div class="msg-content">
      <div class="msg-label">You <span class="msg-time">${now}</span></div>
      <div class="msg-body">${escapeHtml(text)}${imageUrl ? `<br><img class="msg-image" src="${imageUrl}" alt="uploaded image">` : ""}</div>
    </div>`;
  return el;
}

function buildAiBubble(text) {
  const model = document.getElementById("modelSelect").value;
  const label = getModelLabel(model);
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const el = document.createElement("div");
  el.className = "msg ai";
  el.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-content">
      <div class="msg-label">${label} <span class="msg-time">${now}</span></div>
      <div class="msg-body">${marked.parse(text)}</div>
    </div>`;
  return el;
}

function getModelLabel(val) {
  const map = {
    "claude-sonnet-4-6": "Claude Sonnet",
    "claude-opus-4-8": "Claude Opus",
    "gpt-4o": "GPT-4o",
    "gpt-4o-mini": "GPT-4o mini",
    "gemini-1-5-flash": "Gemini Flash"
  };
  return map[val] || val;
}

// ── Streaming AI response ──
async function streamAIResponse(messagesPayload) {
  const selectedModel = document.getElementById("modelSelect").value;
  const chatBox = document.getElementById("chat-box");

  // Ensure msg-wrap exists
  if (!document.getElementById("msgWrap")) {
    chatBox.innerHTML = `<div class="msg-wrap" id="msgWrap"></div>`;
  }
  const wrap = document.getElementById("msgWrap");

  // Thinking bubble
  const thinkEl = document.createElement("div");
  thinkEl.className = "msg ai";
  thinkEl.id = "thinking";
  thinkEl.innerHTML = `
    <div class="msg-avatar">AI</div>
    <div class="msg-content">
      <div class="msg-label">${getModelLabel(selectedModel)}</div>
      <div class="msg-body">
        <div class="thinking-bubble"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  wrap.appendChild(thinkEl);
  chatBox.scrollTop = chatBox.scrollHeight;

  const model = document.getElementById("modelSelect").value;
  const label = getModelLabel(model);
  const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  try {
    let response;

    if (uploadedImagePath) {
      response = await puter.ai.chat([{
        role: "user",
        content: [
          { type: "file", puter_path: uploadedImagePath },
          { type: "text", text: messagesPayload[messagesPayload.length - 1].content }
        ]
      }], { model: selectedModel, stream: true });
    } else {
      response = await puter.ai.chat(messagesPayload, { model: selectedModel, stream: true });
    }

    thinkEl.remove();

    // Build streaming bubble
    const aiEl = document.createElement("div");
    aiEl.className = "msg ai";
    const bodyId = "stream_" + Date.now();
    aiEl.innerHTML = `
      <div class="msg-avatar">AI</div>
      <div class="msg-content">
        <div class="msg-label">${label} <span class="msg-time">${now}</span></div>
        <div class="msg-body streaming" id="${bodyId}"></div>
      </div>`;
    wrap.appendChild(aiEl);

    let fullText = "";
    const bodyEl = document.getElementById(bodyId);

    for await (const chunk of response) {
      const part = chunk?.text || chunk?.message?.content?.[0]?.text || "";
      fullText += part;
      bodyEl.innerHTML = marked.parse(fullText);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    bodyEl.classList.remove("streaming");

    // Save assistant message
    sessions[currentSessionId].messages.push({ role: "assistant", content: fullText });
    saveSessions();

    hljs.highlightAll();
    addCopyButtons();

    return fullText;

  } catch(err) {
    thinkEl.remove();
    const errEl = document.createElement("div");
    errEl.className = "msg ai";
    errEl.innerHTML = `
      <div class="msg-avatar">AI</div>
      <div class="msg-content">
        <div class="msg-label">${label}</div>
        <div class="msg-body" style="color:var(--danger)">Error: ${escapeHtml(err.message)}</div>
      </div>`;
    wrap.appendChild(errEl);
    throw err;
  }
}

// ── Send message ──
async function sendMessage() {
  const promptBox = document.getElementById("prompt");
  const chatBox = document.getElementById("chat-box");
  const prompt = promptBox.value.trim();
  if (!prompt && !uploadedImagePath) return;

  // Auto-create session if none
  if (!currentSessionId || !sessions[currentSessionId]) {
    currentSessionId = createSession();
    saveSessions();
    renderSessionList();
  }

  // Remove welcome screen
  const welcome = document.getElementById("welcomeScreen");
  if (welcome) welcome.remove();
  if (!document.getElementById("msgWrap")) {
    chatBox.innerHTML = `<div class="msg-wrap" id="msgWrap"></div>`;
  }

  const wrap = document.getElementById("msgWrap");
  const imageUrl = uploadedImageFile ? URL.createObjectURL(uploadedImageFile) : null;

  // Build display & actual content
  let displayText = prompt;
  let actualContent = prompt;
  if (uploadedContent) actualContent += "\n\nUploaded Files:\n" + uploadedContent;

  // Add user bubble
  const userEl = buildUserBubble(displayText, imageUrl);
  wrap.appendChild(userEl);

  // Save user message
  sessions[currentSessionId].messages.push({
    role: "user",
    content: actualContent,
    display: displayText,
    imageUrl: imageUrl
  });
  autoTitleSession(prompt);
  saveSessions();

  promptBox.value = "";
  autoResize(promptBox);
  document.getElementById("sendBtn").disabled = true;
  chatBox.scrollTop = chatBox.scrollHeight;

  // Build messages for API (last 20, sanitized)
  const recentMessages = sessions[currentSessionId].messages
    .slice(-20)
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role, content: m.content }));

  try {
    await streamAIResponse(recentMessages);
  } finally {
    // Cleanup
    uploadedContent = "";
    uploadedImageFile = null;
    if (uploadedImagePath) {
      try { await puter.fs.delete(uploadedImagePath); } catch {}
      uploadedImagePath = null;
    }
    document.getElementById("fileInput").value = "";
    document.getElementById("uploadedFiles").innerHTML = "";
    document.getElementById("sendBtn").disabled = false;
    chatBox.scrollTop = chatBox.scrollHeight;
  }
}

// ── Quick prompts ──
function quickPrompt(text) {
  document.getElementById("prompt").value = text;
  sendMessage();
}

// ── Clear current chat ──
function clearChat() {
  if (!currentSessionId || !sessions[currentSessionId]) return;
  sessions[currentSessionId].messages = [];
  sessions[currentSessionId].title = "New chat";
  saveSessions();
  renderSessionList();
  renderChat();
  uploadedContent = "";
  uploadedImageFile = null;
  uploadedImagePath = [];
  document.getElementById("uploadedFiles").innerHTML = "";
}

// ── Code copy buttons ──
function addCopyButtons() {
  document.querySelectorAll("pre").forEach(pre => {
    if (pre.querySelector(".code-header")) return;

    const code = pre.querySelector("code");
    const lang = (code?.className || "").replace("language-", "").split(" ")[0] || "code";

    const header = document.createElement("div");
    header.className = "code-header";
    header.innerHTML = `
      <span class="code-lang">${lang}</span>
      <button class="copy-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>`;

    header.querySelector(".copy-btn").onclick = function() {
      navigator.clipboard.writeText(code?.innerText || "");
      this.classList.add("copied");
      this.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
      setTimeout(() => {
        this.classList.remove("copied");
        this.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`;
      }, 2000);
    };

    pre.insertBefore(header, pre.firstChild);
  });
}

// ── File handling ──
document.getElementById("fileInput").addEventListener("change", async function(e) {
  uploadedContent = "";
  const uploadedFilesDiv = document.getElementById("uploadedFiles");
  uploadedFilesDiv.innerHTML = "";
  const files = e.target.files;

  for (const file of files) {
    const chip = document.createElement("div");

    if (file.type.startsWith("image/")) {
      chip.className = "image-chip";
      const imgUrl = URL.createObjectURL(file);
      chip.innerHTML = `<img src="${imgUrl}" alt="preview"><span>${file.name}</span>
        <button class="remove-file" onclick="removeFile(this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
      await handleImage(file);
    } else {
      chip.className = "file-chip";
      chip.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <span>${file.name}</span>
        <button class="remove-file" onclick="removeFile(this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;

      const textExts = [".txt",".md",".html",".css",".js",".json",".py",".java",".cpp",".ts",".jsx",".tsx",".yaml",".xml"];
      if (textExts.some(ext => file.name.endsWith(ext))) {
        const text = await file.text();
        uploadedContent += `\n\nFILE: ${file.name}\n\n${text}`;
      } else if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let pdfText = "";
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          pdfText += content.items.map(i => i.str).join(" ") + "\n\n";
        }
        uploadedContent += `\n\nPDF: ${file.name}\n\n${pdfText}`;
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const data = await file.arrayBuffer();
        const wb = XLSX.read(data);
        wb.SheetNames.forEach(name => {
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
          uploadedContent += `\n\nEXCEL SHEET "${name}":\n\n${csv}`;
        });
      }
    }

    uploadedFilesDiv.appendChild(chip);
  }
});

async function handleImage(file) {
  uploadedImageFile = file;
  try {
    const puterFile = await puter.fs.write(`temp_${Date.now()}_${file.name}`, file);
    uploadedImagePath = puterFile.path;
  } catch(e) {
    console.error("Image upload to Puter failed:", e);
  }
}

function removeFile(btn) {
  btn.closest(".file-chip, .image-chip").remove();
  uploadedContent = "";
  uploadedImageFile = null;
  uploadedImagePath = null;
  document.getElementById("fileInput").value = "";
}

// ── Auto-resize textarea ──
function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

document.getElementById("prompt").addEventListener("input", function() {
  autoResize(this);
});

// ── Keyboard send ──
document.getElementById("prompt").addEventListener("keydown", function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ── Paste image ──
document.addEventListener("paste", async (e) => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      const uploadedFilesDiv = document.getElementById("uploadedFiles");
      const chip = document.createElement("div");
      chip.className = "image-chip";
      const imgUrl = URL.createObjectURL(file);
      chip.innerHTML = `<img src="${imgUrl}" alt="pasted image"><span>Pasted image</span>
        <button class="remove-file" onclick="removeFile(this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>`;
      uploadedFilesDiv.appendChild(chip);
      await handleImage(file);
    }
  }
});

// ── Model label update ──
function updateModelName() {
  const val = document.getElementById("modelSelect").value;
  document.getElementById("currentModel").textContent = getModelLabel(val);
}
document.getElementById("modelSelect").addEventListener("change", updateModelName);

// ── Clear button ──
document.getElementById("clearBtn").addEventListener("click", clearChat);

// ── New chat button ──
document.getElementById("newChatBtn").addEventListener("click", newChat);

// ── Sidebar toggle (mobile) ──
document.getElementById("sidebarToggle").addEventListener("click", () => {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar.classList.toggle("open");
  overlay.classList.toggle("open");
});
document.getElementById("sidebarOverlay").addEventListener("click", () => {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("open");
});

// ── Scroll to bottom button ──
const chatBox = document.getElementById("chat-box");
const scrollBtn = document.getElementById("scrollBtn");
chatBox.addEventListener("scroll", () => {
  const atBottom = chatBox.scrollHeight - chatBox.scrollTop - chatBox.clientHeight < 80;
  scrollBtn.classList.toggle("visible", !atBottom);
});
function scrollToBottom() {
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: "smooth" });
}

// ── Toast ──
function showToast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Escape HTML ──
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Authentication ──
async function updateAuthUI() {
  const authSection = document.getElementById("authSection");
  const isSignedIn = puter.auth.isSignedIn();

  if (isSignedIn) {
    const user = await puter.auth.getUser();
    authSection.innerHTML = `
      <div class="user-info">
        <div class="msg-avatar">${user.username.charAt(0).toUpperCase()}</div>
        <span>${user.username}</span>
      </div>
      <button class="auth-btn" onclick="handleSignOut()" title="Sign Out">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
      </button>
    `;
  } else {
    authSection.innerHTML = `
      <button class="auth-btn primary" onclick="handleSignIn()">Sign in with Puter</button>
    `;
  }
}

async function handleSignIn() {
  try {
    await puter.auth.signIn();
    updateAuthUI();
    showToast("Signed in successfully.");
  } catch (e) {
    showToast("Sign in cancelled or failed.");
  }
}

function handleSignOut() {
  puter.auth.signOut();
  updateAuthUI();
  showToast("Signed out successfully.");
}

// ── Init ──
function init() {
  loadSessions();

  // Ensure at least one session
  if (!currentSessionId || !sessions[currentSessionId]) {
    const ids = Object.keys(sessions);
    if (ids.length) {
      currentSessionId = ids[ids.length - 1];
    } else {
      currentSessionId = createSession();
      saveSessions();
    }
  }

  updateModelName();
  renderSessionList();
  renderChat();
  updateAuthUI();
}

init();