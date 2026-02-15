// Relay Chat - Minimal SPA Frontend
const app = document.getElementById("app");

let currentUser = null;
let sessionToken = null;
let currentChannel = null;
let openThreadId = null;
let wsConn = null;

const REACTION_EMOJIS = ["👍", "👎", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "🙏"];

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" }, credentials: "include" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// --- WebSocket ---

function connectWS() {
  if (wsConn) { wsConn.close(); wsConn = null; }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  let url = `${proto}//${location.host}/ws`;
  if (sessionToken) url += `?token=${encodeURIComponent(sessionToken)}`;
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handleWSEvent(data);
    } catch {}
  };
  ws.onclose = () => {
    wsConn = null;
    setTimeout(() => {
      if (currentUser) connectWS();
    }, 3000);
  };
  wsConn = ws;
}

function handleWSEvent(data) {
  if (data.type === "new_message") {
    const msg = data.payload;
    if (currentChannel && msg.channelId === currentChannel.id && !msg.parentId) {
      appendMessage(msg);
    }
  } else if (data.type === "new_reply") {
    const msg = data.payload;
    if (openThreadId && msg.parentId === openThreadId) {
      appendReply(msg);
    }
    if (currentChannel && msg.channelId === currentChannel.id) {
      updateReplyCount(msg.parentId);
    }
  } else if (data.type === "reaction_added") {
    const r = data.payload;
    updateReactionUI(r.messageId, r.emoji, r.userId, true);
  } else if (data.type === "reaction_removed") {
    const r = data.payload;
    updateReactionUI(r.messageId, r.emoji, r.userId, false);
  }
}

// --- Reactions ---

function renderReactions(msgId, reactions) {
  let html = '<div class="reactions-bar">';
  for (const r of reactions) {
    const mine = currentUser && r.userIds && r.userIds.includes(currentUser.id);
    html += `<button class="reaction-pill${mine ? " mine" : ""}" data-emoji="${esc(r.emoji)}">${r.emoji} <span class="reaction-count">${r.count}</span></button>`;
  }
  html += `<button class="reaction-add-btn" data-add-for="${msgId}">+</button>`;
  html += '</div>';
  return html;
}

function attachReactionHandlers(container, msgId) {
  const bar = container.querySelector(".reactions-bar");
  if (!bar) return;
  bar.querySelectorAll(".reaction-pill").forEach(btn => {
    btn.onclick = () => toggleReaction(msgId, btn.dataset.emoji, btn.classList.contains("mine"));
  });
  const addBtn = bar.querySelector(".reaction-add-btn");
  if (addBtn) {
    addBtn.onclick = (e) => {
      e.stopPropagation();
      showReactionPicker(addBtn, msgId);
    };
  }
}

function showReactionPicker(anchorBtn, msgId) {
  // Remove any existing picker
  const existing = document.querySelector(".reaction-picker");
  if (existing) existing.remove();

  const picker = document.createElement("div");
  picker.className = "reaction-picker";
  picker.innerHTML = REACTION_EMOJIS.map(em =>
    `<button class="reaction-picker-btn" data-emoji="${em}">${em}</button>`
  ).join("");
  picker.querySelectorAll(".reaction-picker-btn").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      picker.remove();
      addReaction(msgId, btn.dataset.emoji);
    };
  });

  // Anchor picker relative to the + button
  const bar = anchorBtn.closest(".reactions-bar");
  bar.style.position = "relative";
  bar.appendChild(picker);

  // Close on outside click
  const closeHandler = (ev) => {
    if (!picker.contains(ev.target) && ev.target !== anchorBtn) {
      picker.remove();
      document.removeEventListener("click", closeHandler);
    }
  };
  setTimeout(() => document.addEventListener("click", closeHandler), 0);
}

async function addReaction(msgId, emoji) {
  await api("POST", `/api/messages/${msgId}/reactions`, { emoji });
}

async function removeReaction(msgId, emoji) {
  await api("DELETE", `/api/messages/${msgId}/reactions/${encodeURIComponent(emoji)}`);
}

async function toggleReaction(msgId, emoji, isMine) {
  // UI knows if current user has reacted; use correct endpoint.
  try {
    if (isMine) {
      await removeReaction(msgId, emoji);
    } else {
      await addReaction(msgId, emoji);
    }
  } catch {
    // ignore; WS will reconcile
  }
}

function findMessageContainers(msgId) {
  // Only select .message elements that are actual message containers, not nested elements
  const results = [];
  document.querySelectorAll(`.message[data-msg-id="${msgId}"]`).forEach(el => results.push(el));
  document.querySelectorAll(`.message[data-reply-id="${msgId}"]`).forEach(el => {
    if (!results.includes(el)) results.push(el);
  });
  return results;
}

function updateReactionUI(msgId, emoji, userId, added) {
  const containers = findMessageContainers(msgId);
  containers.forEach(msgEl => {
    let bar = msgEl.querySelector(".reactions-bar");
    if (!bar) {
      const actionsEl = msgEl.querySelector(".msg-actions");
      bar = document.createElement("div");
      bar.className = "reactions-bar";
      bar.innerHTML = `<button class="reaction-add-btn" data-add-for="${msgId}">+</button>`;
      if (actionsEl) {
        msgEl.insertBefore(bar, actionsEl);
      } else {
        msgEl.appendChild(bar);
      }
      attachReactionHandlers(msgEl, msgId);
    }

    let pill = bar.querySelector(`.reaction-pill[data-emoji="${CSS.escape(emoji)}"]`);
    if (added) {
      if (pill) {
        const countEl = pill.querySelector(".reaction-count");
        const count = parseInt(countEl.textContent, 10) + 1;
        countEl.textContent = count;
        if (currentUser && userId === currentUser.id) pill.classList.add("mine");
      } else {
        const newPill = document.createElement("button");
        newPill.className = "reaction-pill" + (currentUser && userId === currentUser.id ? " mine" : "");
        newPill.dataset.emoji = emoji;
        newPill.innerHTML = `${emoji} <span class="reaction-count">1</span>`;
        newPill.onclick = () => toggleReaction(msgId, emoji, newPill.classList.contains("mine"));
        const addBtn = bar.querySelector(".reaction-add-btn");
        bar.insertBefore(newPill, addBtn);
      }
    } else {
      if (pill) {
        const countEl = pill.querySelector(".reaction-count");
        const count = parseInt(countEl.textContent, 10) - 1;
        if (count <= 0) {
          pill.remove();
        } else {
          countEl.textContent = count;
          if (currentUser && userId === currentUser.id) pill.classList.remove("mine");
        }
      }
    }
  });
}

// --- Screens ---

function renderBootstrap() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>Relay Chat Setup</h1>
      <div class="card">
        <h2>Create Admin Account</h2>
        <div id="error" class="error hidden"></div>
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username">
        <label for="displayName">Display Name</label>
        <input type="text" id="displayName">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="new-password">
        <button id="submit">Create Admin</button>
      </div>
    </div>
  `;
  document.getElementById("submit").onclick = async () => {
    const errEl = document.getElementById("error");
    errEl.classList.add("hidden");
    try {
      const data = await api("POST", "/api/auth/bootstrap", {
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
        displayName: document.getElementById("displayName").value || undefined,
      });
      currentUser = data.user;
      sessionToken = data.token;
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
}

function renderLogin() {
  app.innerHTML = `
    <div class="auth-container">
      <h1>Relay Chat</h1>
      <div class="card">
        <h2>Login</h2>
        <div id="error" class="error hidden"></div>
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="current-password">
        <button id="submit">Login</button>
      </div>
      <div class="card">
        <h2>Sign Up (Invite Only)</h2>
        <div id="signup-error" class="error hidden"></div>
        <label for="invite-code">Invite Code</label>
        <input type="text" id="invite-code">
        <label for="signup-username">Username</label>
        <input type="text" id="signup-username" autocomplete="username">
        <label for="signup-display">Display Name</label>
        <input type="text" id="signup-display">
        <label for="signup-password">Password</label>
        <input type="password" id="signup-password" autocomplete="new-password">
        <button id="signup-submit" class="secondary">Sign Up</button>
      </div>
    </div>
  `;

  document.getElementById("submit").onclick = async () => {
    const errEl = document.getElementById("error");
    errEl.classList.add("hidden");
    try {
      const data = await api("POST", "/api/auth/login", {
        username: document.getElementById("username").value,
        password: document.getElementById("password").value,
      });
      currentUser = data.user;
      sessionToken = data.token;
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };

  document.getElementById("signup-submit").onclick = async () => {
    const errEl = document.getElementById("signup-error");
    errEl.classList.add("hidden");
    try {
      const data = await api("POST", "/api/auth/signup", {
        username: document.getElementById("signup-username").value,
        password: document.getElementById("signup-password").value,
        displayName: document.getElementById("signup-display").value || undefined,
        inviteCode: document.getElementById("invite-code").value,
      });
      currentUser = data.user;
      sessionToken = data.token;
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
}

async function renderMain() {
  connectWS();

  let channelsList = [];
  try {
    channelsList = await api("GET", "/api/channels");
  } catch {}

  const adminSection = currentUser && currentUser.role === "admin" ? `
    <div class="admin-section">
      <button id="toggle-admin" class="secondary btn-sm">Admin</button>
      <div id="admin-panel" class="hidden">
        <div class="card">
          <h3>Create Invite</h3>
          <div id="invite-error" class="error hidden"></div>
          <div id="invite-result"></div>
          <button id="create-invite" class="btn-sm">Create Invite</button>
          <ul class="invite-list" id="invite-list"></ul>
        </div>
      </div>
    </div>
  ` : "";

  app.innerHTML = `
    <div class="chat-layout">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <div class="sidebar">
        <div class="sidebar-header">
          <h2>Relay Chat</h2>
          <div class="user-bar">
            <span class="user-info">${esc(currentUser.displayName)}</span>
            <button id="logout" class="secondary btn-sm">Logout</button>
          </div>
          ${adminSection}
        </div>
        <div class="channel-list-container">
          <h3>Channels</h3>
          <ul class="channel-list" id="channel-list">
            ${channelsList.map(c => `<li data-id="${c.id}" data-name="${esc(c.name)}">${esc(c.name)}</li>`).join("")}
          </ul>
        </div>
      </div>
      <div class="main-panel">
        <div id="channel-view" class="channel-view">
          <div class="channel-header" id="channel-header"><button class="hamburger-btn" id="sidebar-toggle" aria-label="Toggle sidebar">&#9776;</button><span id="channel-header-text">Select a channel</span></div>
          <div class="message-list" id="message-list"></div>
          <div class="composer" id="composer" style="display:none">
            <input type="text" id="msg-input" placeholder="Type a message...">
            <button id="msg-send">Send</button>
          </div>
        </div>
        <div id="thread-panel" class="thread-panel hidden">
          <div class="thread-header">
            <h3>Thread</h3>
            <button id="close-thread" class="secondary btn-sm">Close</button>
          </div>
          <div class="thread-parent" id="thread-parent"></div>
          <div class="thread-replies" id="thread-replies"></div>
          <div class="composer">
            <input type="text" id="reply-input" placeholder="Reply in thread...">
            <button id="reply-send">Send</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("logout").onclick = async () => {
    await api("POST", "/api/auth/logout");
    currentUser = null;
    sessionToken = null;
    if (wsConn) { wsConn.close(); wsConn = null; }
    renderLogin();
  };

  document.getElementById("channel-list").onclick = (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const id = parseInt(li.dataset.id, 10);
    const name = li.dataset.name;
    selectChannel({ id, name });
  };

  document.getElementById("msg-send").onclick = sendMessage;
  document.getElementById("msg-input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  document.getElementById("reply-send").onclick = sendReply;
  document.getElementById("reply-input").onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
  };

  document.getElementById("close-thread").onclick = closeThread;

  // Mobile sidebar toggle
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  document.getElementById("sidebar-toggle").onclick = () => {
    sidebar.classList.toggle("sidebar-open");
    backdrop.classList.toggle("sidebar-backdrop-visible");
  };
  backdrop.onclick = () => {
    sidebar.classList.remove("sidebar-open");
    backdrop.classList.remove("sidebar-backdrop-visible");
  };

  if (currentUser && currentUser.role === "admin") {
    document.getElementById("toggle-admin").onclick = () => {
      document.getElementById("admin-panel").classList.toggle("hidden");
    };
    document.getElementById("create-invite").onclick = async () => {
      try {
        const invite = await api("POST", "/api/invites", {});
        document.getElementById("invite-result").innerHTML = `<div class="invite-code">${invite.code}</div>`;
        loadInvites();
      } catch (e) {
        const errEl = document.getElementById("invite-error");
        errEl.textContent = e.message;
        errEl.classList.remove("hidden");
      }
    };
    loadInvites();
  }

  const general = channelsList.find(c => c.name === "general");
  if (general) selectChannel(general);
}

// --- Channel + Messages ---

async function selectChannel(channel) {
  currentChannel = channel;
  openThreadId = null;
  document.getElementById("thread-panel").classList.add("hidden");

  document.querySelectorAll(".channel-list li").forEach(li => {
    li.classList.toggle("active", parseInt(li.dataset.id, 10) === channel.id);
  });

  document.getElementById("channel-header-text").textContent = `# ${channel.name}`;

  // Close mobile sidebar
  const sb = document.querySelector(".sidebar");
  const bd = document.querySelector(".sidebar-backdrop");
  if (sb) sb.classList.remove("sidebar-open");
  if (bd) bd.classList.remove("sidebar-backdrop-visible");
  document.getElementById("composer").style.display = "flex";

  await loadMessages(channel.id);
  document.getElementById("msg-input").focus();
}

async function loadMessages(channelId) {
  const list = document.getElementById("message-list");
  list.innerHTML = "";
  try {
    const msgs = await api("GET", `/api/channels/${channelId}/messages?limit=50`);
    msgs.reverse().forEach(msg => appendMessage(msg));
    list.scrollTop = list.scrollHeight;
  } catch (e) {
    list.innerHTML = `<div class="error">Failed to load messages</div>`;
  }
}

function appendMessage(msg) {
  const list = document.getElementById("message-list");
  if (!list) return;
  if (list.querySelector(`[data-msg-id="${msg.id}"]`)) return;

  const div = document.createElement("div");
  div.className = "message";
  div.dataset.msgId = msg.id;
  const replyBtn = `<button class="reply-btn btn-sm secondary" data-msg-id="${msg.id}">Reply${msg.replyCount ? ` (${msg.replyCount})` : ""}</button>`;
  const reactionsHtml = renderReactions(msg.id, msg.reactions || []);
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(msg.displayName)}</strong>
      <span class="msg-time">${fmtTime(msg.createdAt)}</span>
    </div>
    <div class="msg-body">${esc(msg.content)}</div>
    ${reactionsHtml}
    <div class="msg-actions">${replyBtn}</div>
  `;
  div.querySelector(".reply-btn").onclick = () => openThread(msg.id);
  attachReactionHandlers(div, msg.id);
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function updateReplyCount(parentId) {
  const msgEl = document.querySelector(`[data-msg-id="${parentId}"]`);
  if (!msgEl) return;
  const btn = msgEl.querySelector(".reply-btn");
  if (!btn) return;
  const match = btn.textContent.match(/\((\d+)\)/);
  const count = match ? parseInt(match[1], 10) + 1 : 1;
  btn.textContent = `Reply (${count})`;
}

// --- Threads ---

async function openThread(parentId) {
  openThreadId = parentId;
  const panel = document.getElementById("thread-panel");
  panel.classList.remove("hidden");

  const parentEl = document.getElementById("thread-parent");
  const msgEl = document.querySelector(`[data-msg-id="${parentId}"]`);
  if (msgEl) {
    const name = msgEl.querySelector("strong").textContent;
    const body = msgEl.querySelector(".msg-body").textContent;
    const time = msgEl.querySelector(".msg-time").textContent;
    parentEl.innerHTML = `
      <div class="message">
        <div class="msg-header"><strong>${esc(name)}</strong><span class="msg-time">${esc(time)}</span></div>
        <div class="msg-body">${esc(body)}</div>
      </div>
    `;
  }

  await loadReplies(parentId);
  document.getElementById("reply-input").focus();
}

async function loadReplies(parentId) {
  const list = document.getElementById("thread-replies");
  list.innerHTML = "";
  try {
    const replies = await api("GET", `/api/messages/${parentId}/thread?limit=50`);
    replies.forEach(reply => appendReply(reply));
    list.scrollTop = list.scrollHeight;
  } catch {
    list.innerHTML = `<div class="error">Failed to load replies</div>`;
  }
}

function appendReply(reply) {
  const list = document.getElementById("thread-replies");
  if (!list) return;
  if (list.querySelector(`[data-reply-id="${reply.id}"]`)) return;

  const div = document.createElement("div");
  div.className = "message reply";
  div.dataset.replyId = reply.id;
  div.dataset.msgId = reply.id;
  const reactionsHtml = renderReactions(reply.id, reply.reactions || []);
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(reply.displayName)}</strong>
      <span class="msg-time">${fmtTime(reply.createdAt)}</span>
    </div>
    <div class="msg-body">${esc(reply.content)}</div>
    ${reactionsHtml}
  `;
  attachReactionHandlers(div, reply.id);
  list.appendChild(div);
  list.scrollTop = list.scrollHeight;
}

function closeThread() {
  openThreadId = null;
  document.getElementById("thread-panel").classList.add("hidden");
}

// --- Send ---

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const content = input.value.trim();
  if (!content || !currentChannel) return;
  input.value = "";
  try {
    await api("POST", `/api/channels/${currentChannel.id}/messages`, { content });
  } catch (e) {
    input.value = content;
  }
}

async function sendReply() {
  const input = document.getElementById("reply-input");
  const content = input.value.trim();
  if (!content || !openThreadId) return;
  input.value = "";
  try {
    await api("POST", `/api/messages/${openThreadId}/reply`, { content });
  } catch (e) {
    input.value = content;
  }
}

// --- Admin ---

async function loadInvites() {
  try {
    const invites = await api("GET", "/api/invites");
    const list = document.getElementById("invite-list");
    if (!list) return;
    list.innerHTML = invites.map(i =>
      `<li>${i.code} (used: ${i.useCount}${i.maxUses ? "/" + i.maxUses : ""})</li>`
    ).join("");
  } catch {}
}

// --- Helpers ---

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function fmtTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}

// --- Boot ---
async function boot() {
  try {
    const { hasUsers } = await api("GET", "/api/auth/has-users");
    if (!hasUsers) {
      renderBootstrap();
      return;
    }
  } catch {
    renderLogin();
    return;
  }

  try {
    currentUser = await api("GET", "/api/auth/me");
    renderMain();
  } catch {
    renderLogin();
  }
}

boot();
