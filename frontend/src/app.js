// Relay Chat - Minimal SPA Frontend
const app = document.getElementById("app");

let currentUser = null;
let sessionToken = null;
let currentChannel = null;
let openThreadId = null;
let wsConn = null;

const REACTION_EMOJIS = ["👍", "👎", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "🙏"];

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function isMobile() {
  return window.matchMedia("(max-width: 768px)").matches;
}

// WebSocket reconnect state
let wsReconnectAttempt = 0;
let connectionStatusTimeout = null;

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" }, credentials: "include" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// --- WebSocket ---

function getReconnectDelay() {
  const delay = Math.min(1000 * Math.pow(2, wsReconnectAttempt), 30000);
  return Math.round(delay * (0.75 + Math.random() * 0.5));
}

function updateConnectionStatus(connected) {
  const el = document.getElementById("connection-status");
  if (!el) return;
  if (connected) {
    clearTimeout(connectionStatusTimeout);
    el.classList.add("hidden");
  } else {
    clearTimeout(connectionStatusTimeout);
    connectionStatusTimeout = setTimeout(() => {
      el.classList.remove("hidden");
      el.textContent = "[ reconnecting... ]";
    }, 2000);
  }
}

function connectWS() {
  if (wsConn) { wsConn.close(); wsConn = null; }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  let url = `${proto}//${location.host}/ws`;
  if (sessionToken) url += `?token=${encodeURIComponent(sessionToken)}`;
  const ws = new WebSocket(url);
  ws.onopen = () => {
    wsReconnectAttempt = 0;
    updateConnectionStatus(true);
  };
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      handleWSEvent(data);
    } catch {}
  };
  ws.onclose = () => {
    wsConn = null;
    updateConnectionStatus(false);
    const delay = getReconnectDelay();
    wsReconnectAttempt++;
    setTimeout(() => {
      if (currentUser) connectWS();
    }, delay);
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
  } else if (data.type === "channel_created") {
    const ch = data.payload;
    const list = document.getElementById("channel-list");
    if (list && !list.querySelector(`li[data-id="${ch.id}"]`)) {
      const li = document.createElement("li");
      li.dataset.id = ch.id;
      li.dataset.name = ch.name;
      li.textContent = ch.name;
      list.appendChild(li);
    }
  }
}

// --- Create Channel Modal ---

function showCreateChannelModal() {
  const existing = document.querySelector(".modal-backdrop");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3># create channel</h3>
      <label for="channel-name-input">Name</label>
      <input type="text" id="channel-name-input" placeholder="e.g. random" maxlength="50" autocomplete="off">
      <div class="channel-name-preview hidden" id="channel-name-preview"></div>
      <div class="error hidden" id="channel-create-error"></div>
      <div class="modal-actions">
        <button id="channel-create-submit">Create</button>
        <button id="channel-create-cancel" class="secondary">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const input = document.getElementById("channel-name-input");
  const preview = document.getElementById("channel-name-preview");
  const errEl = document.getElementById("channel-create-error");

  function formatName(raw) {
    return raw.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");
  }

  input.addEventListener("input", () => {
    const formatted = formatName(input.value);
    if (formatted && formatted !== input.value) {
      preview.textContent = "# " + formatted;
      preview.classList.remove("hidden");
    } else {
      preview.classList.add("hidden");
    }
  });

  async function submit() {
    const name = formatName(input.value).replace(/^-+|-+$/g, "");
    if (!name) {
      errEl.textContent = "Name is required";
      errEl.classList.remove("hidden");
      return;
    }
    try {
      const ch = await api("POST", "/api/channels", { name });
      backdrop.remove();
      // Add to sidebar if not already there (WS event may have added it)
      const list = document.getElementById("channel-list");
      if (list && !list.querySelector(`li[data-id="${ch.id}"]`)) {
        const li = document.createElement("li");
        li.dataset.id = ch.id;
        li.dataset.name = ch.name;
        li.textContent = ch.name;
        list.appendChild(li);
      }
      selectChannel({ id: ch.id, name: ch.name });
    } catch (e) {
      errEl.textContent = e.message || "Failed to create channel";
      errEl.classList.remove("hidden");
    }
  }

  document.getElementById("channel-create-submit").onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  function close() { backdrop.remove(); }
  document.getElementById("channel-create-cancel").onclick = close;
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); }
  });

  input.focus();
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

  document.body.appendChild(picker);

  // Position relative to anchor, clamped to viewport
  const rect = anchorBtn.getBoundingClientRect();
  const pickerHeight = 80;

  let top = rect.top - pickerHeight - 4;
  let left = rect.left;

  if (top < 8) top = rect.bottom + 4;
  if (left + 220 > window.innerWidth - 8) left = window.innerWidth - 228;
  if (left < 8) left = 8;

  picker.style.top = `${top}px`;
  picker.style.left = `${left}px`;

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

// --- Swipe Gestures ---

function setupSwipeGestures() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwiping = false;
  const EDGE_ZONE = 30;
  const MIN_DISTANCE = 60;
  const MAX_Y_DRIFT = 80;

  document.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    const sidebar = document.querySelector(".sidebar");
    isSwiping = touchStartX < EDGE_ZONE || (sidebar && sidebar.classList.contains("sidebar-open"));
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!isSwiping) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = Math.abs(touch.clientY - touchStartY);
    const elapsed = Date.now() - touchStartTime;

    if (deltaY > MAX_Y_DRIFT || elapsed > 500 || Math.abs(deltaX) < MIN_DISTANCE) return;

    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (!sidebar || !backdrop) return;

    if (deltaX > 0 && touchStartX < EDGE_ZONE && !sidebar.classList.contains("sidebar-open")) {
      sidebar.classList.add("sidebar-open");
      backdrop.classList.add("sidebar-backdrop-visible");
      document.body.classList.add("sidebar-is-open");
    } else if (deltaX < 0 && sidebar.classList.contains("sidebar-open")) {
      sidebar.classList.remove("sidebar-open");
      backdrop.classList.remove("sidebar-backdrop-visible");
      document.body.classList.remove("sidebar-is-open");
    }
  }, { passive: true });
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

function renderLogin(prefillInviteCode) {
  const showSignup = !!prefillInviteCode;
  app.innerHTML = `
    <div class="auth-container">
      <h1>Relay Chat</h1>
      <div class="auth-tabs">
        <button class="auth-tab${showSignup ? "" : " active"}" data-tab="login">Login</button>
        <button class="auth-tab${showSignup ? " active" : ""}" data-tab="signup">Sign Up</button>
      </div>
      <div class="card${showSignup ? " hidden" : ""}" id="login-card">
        <div id="error" class="error hidden"></div>
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="current-password">
        <button id="submit">Login</button>
      </div>
      <div class="card${showSignup ? "" : " hidden"}" id="signup-card">
        <div id="signup-error" class="error hidden"></div>
        <label for="invite-code">Invite Code</label>
        <input type="text" id="invite-code" value="${esc(prefillInviteCode || "")}"${prefillInviteCode ? " readonly" : ""}>
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

  // Tab switching
  const tabs = document.querySelectorAll(".auth-tab");
  const loginCard = document.getElementById("login-card");
  const signupCard = document.getElementById("signup-card");
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      if (tab.dataset.tab === "login") {
        loginCard.classList.remove("hidden");
        signupCard.classList.add("hidden");
      } else {
        loginCard.classList.add("hidden");
        signupCard.classList.remove("hidden");
      }
    };
  });

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
  wsReconnectAttempt = 0;
  connectWS();

  let channelsList = [];
  try {
    channelsList = await api("GET", "/api/channels");
  } catch {}

  const isAdmin = currentUser && currentUser.role === "admin";

  // Desktop sidebar still has admin section; mobile hides it via CSS
  const adminSection = isAdmin ? `
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
        <div class="card">
          <h3>Bots</h3>
          <button id="create-bot" class="btn-sm">Create Bot</button>
          <ul class="bot-list" id="bot-list"></ul>
        </div>
      </div>
    </div>
  ` : "";

  const settingsBtn = isAdmin ? `<button class="settings-btn" id="open-admin" aria-label="Settings">&#9881;</button>` : "";

  app.innerHTML = `
    <div class="chat-layout">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <div class="sidebar">
        <div class="sidebar-header">
          <h2>relay chat</h2>
          <div class="user-bar">
            <span class="user-info">${esc(currentUser.displayName)}</span>
            <button id="logout" class="secondary btn-sm">Logout</button>
          </div>
          ${adminSection}
        </div>
        <div class="channel-list-container">
          <div class="channel-list-header"><h3>Channels</h3><button id="create-channel-btn" class="channel-create-btn" aria-label="Create channel">+</button></div>
          <ul class="channel-list" id="channel-list">
            ${channelsList.map(c => `<li data-id="${c.id}" data-name="${esc(c.name)}">${esc(c.name)}</li>`).join("")}
          </ul>
        </div>
      </div>
      <div class="main-panel">
        <div id="channel-view" class="channel-view">
          <div class="channel-header" id="channel-header"><button class="hamburger-btn" id="sidebar-toggle" aria-label="Toggle sidebar">&#9776;</button><span id="channel-header-text">Select a channel</span>${settingsBtn}</div>
          <div id="connection-status" class="connection-status hidden"></div>
          <div class="message-list" id="message-list"></div>
          <div class="composer" id="composer" style="display:none">
            <input type="text" id="msg-input" placeholder="> message...">
            <button id="msg-send">Send</button>
          </div>
        </div>
        <div id="thread-panel" class="thread-panel hidden">
          <div class="thread-header">
            <h3>Thread</h3>
            <button id="close-thread" class="secondary btn-sm" aria-label="Close thread">&#8592; <span class="close-text">Close</span></button>
          </div>
          <div class="thread-parent" id="thread-parent"></div>
          <div class="thread-replies" id="thread-replies"></div>
          <div class="composer">
            <input type="text" id="reply-input" placeholder="> reply...">
            <button id="reply-send">Send</button>
          </div>
        </div>
        <div id="admin-page" class="admin-page hidden">
          <div class="admin-page-header">
            <h3>Settings</h3>
            <button id="close-admin" class="secondary btn-sm" aria-label="Close settings">&#8592; <span class="close-text">Close</span></button>
          </div>
          <div class="admin-page-content">
            <div class="admin-user-info">
              Logged in as <strong>${esc(currentUser.displayName)}</strong> (${esc(currentUser.role)})
            </div>
            <div class="card">
              <h3>Invites</h3>
              <div id="admin-invite-error" class="error hidden"></div>
              <div id="admin-invite-result"></div>
              <button id="admin-create-invite" class="btn-sm">Create Invite</button>
              <ul class="invite-list" id="admin-invite-list"></ul>
            </div>
            <div class="card">
              <h3>Bots</h3>
              <button id="admin-create-bot" class="btn-sm">Create Bot</button>
              <ul class="bot-list" id="admin-bot-list"></ul>
            </div>
            <div class="card">
              <h3>Account</h3>
              <button id="admin-logout" class="secondary">Logout</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("logout").onclick = doLogout;

  document.getElementById("channel-list").onclick = (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    const id = parseInt(li.dataset.id, 10);
    const name = li.dataset.name;
    selectChannel({ id, name });
  };

  document.getElementById("create-channel-btn").onclick = showCreateChannelModal;

  document.getElementById("msg-send").onclick = sendMessage;
  const msgInput = document.getElementById("msg-input");
  msgInput.onkeydown = (e) => {
    if (mentionDropdown && mentionUsers.length > 0 &&
        (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape")) {
      return; // handled by mention keydown
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };
  setupMentionAutocomplete(msgInput);

  document.getElementById("reply-send").onclick = sendReply;
  const replyInput = document.getElementById("reply-input");
  replyInput.onkeydown = (e) => {
    if (mentionDropdown && mentionUsers.length > 0 &&
        (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Escape")) {
      return; // handled by mention keydown
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
  };
  setupMentionAutocomplete(replyInput);

  document.getElementById("close-thread").onclick = closeThread;

  // Mobile sidebar toggle
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  document.getElementById("sidebar-toggle").onclick = () => {
    sidebar.classList.toggle("sidebar-open");
    backdrop.classList.toggle("sidebar-backdrop-visible");
    document.body.classList.toggle("sidebar-is-open");
  };
  backdrop.onclick = () => {
    sidebar.classList.remove("sidebar-open");
    backdrop.classList.remove("sidebar-backdrop-visible");
    document.body.classList.remove("sidebar-is-open");
  };

  setupSwipeGestures();

  // Desktop admin toggle (sidebar)
  if (isAdmin) {
    const toggleAdmin = document.getElementById("toggle-admin");
    if (toggleAdmin) {
      toggleAdmin.onclick = () => {
        document.getElementById("admin-panel").classList.toggle("hidden");
      };
    }
    const createInvite = document.getElementById("create-invite");
    if (createInvite) {
      createInvite.onclick = async () => {
        try {
          const invite = await api("POST", "/api/invites", {});
          const resultEl = document.getElementById("invite-result");
          resultEl.innerHTML = renderInviteLink(invite.code);
          attachCopyHandler(resultEl);
          loadInvites();
        } catch (e) {
          const errEl = document.getElementById("invite-error");
          errEl.textContent = e.message;
          errEl.classList.remove("hidden");
        }
      };
    }
    loadInvites();

    // Desktop bot handlers
    const createBot = document.getElementById("create-bot");
    if (createBot) {
      createBot.onclick = () => showCreateBotModal();
    }
    loadBots("bot-list");

    // Mobile admin page
    const openAdmin = document.getElementById("open-admin");
    if (openAdmin) {
      openAdmin.onclick = () => openAdminPage();
    }
    document.getElementById("close-admin").onclick = closeAdminPage;
    document.getElementById("admin-logout").onclick = doLogout;
    document.getElementById("admin-create-invite").onclick = async () => {
      try {
        const invite = await api("POST", "/api/invites", {});
        const resultEl = document.getElementById("admin-invite-result");
        resultEl.innerHTML = renderInviteLink(invite.code);
        attachCopyHandler(resultEl);
        loadAdminInvites();
      } catch (e) {
        const errEl = document.getElementById("admin-invite-error");
        errEl.textContent = e.message;
        errEl.classList.remove("hidden");
      }
    };

    // Mobile bot handlers
    const adminCreateBot = document.getElementById("admin-create-bot");
    if (adminCreateBot) {
      adminCreateBot.onclick = () => showCreateBotModal();
    }
    loadBots("admin-bot-list");
  }

  await handleRoute(channelsList);
}

async function doLogout() {
  await api("POST", "/api/auth/logout");
  currentUser = null;
  sessionToken = null;
  if (wsConn) { wsConn.close(); wsConn = null; }
  renderLogin();
}

// --- Invite Link Helpers ---

function inviteUrl(code) {
  return `${location.origin}/invite/${code}`;
}

function renderInviteLink(code) {
  const url = inviteUrl(code);
  return `<div class="invite-code">${esc(url)}</div><button class="btn-sm copy-link-btn" data-url="${esc(url)}">Copy Link</button>`;
}

function attachCopyHandler(container) {
  const btn = container.querySelector(".copy-link-btn");
  if (!btn) return;
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.url);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = btn.dataset.url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const origText = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = origText; }, 2000);
  };
}

// --- Admin Page ---

function openAdminPage() {
  const panel = document.getElementById("admin-page");
  panel.classList.remove("hidden");
  loadAdminInvites();
}

function closeAdminPage() {
  document.getElementById("admin-page").classList.add("hidden");
}

async function loadAdminInvites() {
  try {
    const invites = await api("GET", "/api/invites");
    const list = document.getElementById("admin-invite-list");
    if (!list) return;
    list.innerHTML = invites.map(i =>
      `<li><div class="invite-code">${esc(inviteUrl(i.code))}</div><div class="invite-meta"><span class="invite-usage">${i.useCount}${i.maxUses ? "/" + i.maxUses : ""} used</span><button class="btn-sm copy-link-btn" data-url="${esc(inviteUrl(i.code))}">Copy</button></div></li>`
    ).join("");
    list.querySelectorAll("li").forEach(li => attachCopyHandler(li));
  } catch {}
}

// --- Channel + Messages ---

async function selectChannel(channel, fromRoute = false) {
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
  document.body.classList.remove("sidebar-is-open");
  document.getElementById("composer").style.display = "flex";

  if (!fromRoute) {
    navigate(`/${channel.name}`);
  }

  await loadMessages(channel.id);
  if (!isMobile()) document.getElementById("msg-input").focus();
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
  const botBadge = msg.isBot ? '<span class="bot-badge">BOT</span>' : '';
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(msg.displayName)}</strong>${botBadge}
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

async function openThread(parentId, fromRoute = false) {
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

  if (!fromRoute && currentChannel) {
    navigate(`/${currentChannel.name}/t/${parentId}`);
  }

  await loadReplies(parentId);
  if (!isMobile()) document.getElementById("reply-input").focus();
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
  const botBadge = reply.isBot ? '<span class="bot-badge">BOT</span>' : '';
  div.innerHTML = `
    <div class="msg-header">
      <strong>${esc(reply.displayName)}</strong>${botBadge}
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
  if (currentChannel) {
    navigate(`/${currentChannel.name}`);
  }
}

// --- Mention Autocomplete ---

let mentionDropdown = null;
let mentionActiveIndex = 0;
let mentionUsers = [];
let mentionDebounce = null;
let mentionInput = null;   // which input is active
let mentionAtPos = -1;     // position of the triggering '@'

function setupMentionAutocomplete(input) {
  input.addEventListener("input", () => onMentionInput(input));
  input.addEventListener("keydown", (e) => onMentionKeydown(e, input));
  input.addEventListener("blur", () => {
    // Delay to allow click on dropdown item
    setTimeout(closeMentionDropdown, 150);
  });
}

function onMentionInput(input) {
  const pos = input.selectionStart;
  const text = input.value;

  // Walk backwards from cursor to find '@' preceded by start-of-string or space
  let atIdx = -1;
  for (let i = pos - 1; i >= 0; i--) {
    if (text[i] === " " || text[i] === "\n") break;
    if (text[i] === "@") {
      if (i === 0 || text[i - 1] === " " || text[i - 1] === "\n") {
        atIdx = i;
      }
      break;
    }
  }

  if (atIdx === -1) {
    closeMentionDropdown();
    return;
  }

  const query = text.slice(atIdx + 1, pos);
  mentionInput = input;
  mentionAtPos = atIdx;

  clearTimeout(mentionDebounce);
  mentionDebounce = setTimeout(() => fetchMentionUsers(query, input), 150);
}

async function fetchMentionUsers(query, input) {
  try {
    const users = await api("GET", `/api/users/search?q=${encodeURIComponent(query)}`);
    if (mentionInput !== input) return; // stale
    mentionUsers = users;
    mentionActiveIndex = 0;
    if (users.length > 0) {
      showMentionDropdown(input);
    } else {
      closeMentionDropdown();
    }
  } catch {
    closeMentionDropdown();
  }
}

function showMentionDropdown(input) {
  if (!mentionDropdown) {
    mentionDropdown = document.createElement("div");
    mentionDropdown.className = "mention-dropdown";
    document.body.appendChild(mentionDropdown);
  }

  mentionDropdown.innerHTML = mentionUsers.map((u, i) => {
    const active = i === mentionActiveIndex ? " active" : "";
    const badge = u.isBot ? '<span class="bot-badge">BOT</span>' : "";
    return `<div class="mention-item${active}" data-index="${i}">
      <span class="mention-name">@${esc(u.username)}</span>${badge}
      <span class="mention-display">${esc(u.displayName)}</span>
    </div>`;
  }).join("");

  // Click handlers on items
  mentionDropdown.querySelectorAll(".mention-item").forEach(el => {
    el.onmousedown = (e) => {
      e.preventDefault(); // prevent blur
      selectMention(parseInt(el.dataset.index, 10));
    };
  });

  // Position above the input
  const rect = input.getBoundingClientRect();
  const dropdownHeight = Math.min(mentionUsers.length, 6) * 40;

  let top = rect.top - dropdownHeight - 4;
  let left = rect.left;

  // If not enough room above, show below
  if (top < 8) top = rect.bottom + 4;
  if (left + 260 > window.innerWidth - 8) left = window.innerWidth - 268;
  if (left < 8) left = 8;

  mentionDropdown.style.top = `${top}px`;
  mentionDropdown.style.left = `${left}px`;
  mentionDropdown.style.width = `${Math.min(rect.width, 300)}px`;
}

function closeMentionDropdown() {
  if (mentionDropdown) {
    mentionDropdown.remove();
    mentionDropdown = null;
  }
  mentionUsers = [];
  mentionActiveIndex = 0;
  mentionAtPos = -1;
  mentionInput = null;
  clearTimeout(mentionDebounce);
}

function selectMention(index) {
  const user = mentionUsers[index];
  if (!user || !mentionInput) return;

  const input = mentionInput;
  const before = input.value.slice(0, mentionAtPos);
  const after = input.value.slice(input.selectionStart);
  const insert = `@${user.username} `;
  input.value = before + insert + after;

  const newPos = mentionAtPos + insert.length;
  input.setSelectionRange(newPos, newPos);
  input.focus();
  closeMentionDropdown();
}

function onMentionKeydown(e, input) {
  if (!mentionDropdown || mentionUsers.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    mentionActiveIndex = (mentionActiveIndex + 1) % mentionUsers.length;
    showMentionDropdown(input);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    mentionActiveIndex = (mentionActiveIndex - 1 + mentionUsers.length) % mentionUsers.length;
    showMentionDropdown(input);
  } else if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    selectMention(mentionActiveIndex);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeMentionDropdown();
  }
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
      `<li><div class="invite-code">${esc(inviteUrl(i.code))}</div><div class="invite-meta"><span class="invite-usage">${i.useCount}${i.maxUses ? "/" + i.maxUses : ""} used</span><button class="btn-sm copy-link-btn" data-url="${esc(inviteUrl(i.code))}">Copy</button></div></li>`
    ).join("");
    list.querySelectorAll("li").forEach(li => attachCopyHandler(li));
  } catch {}
}

// --- Bots ---

async function loadBots(listId) {
  try {
    const botList = await api("GET", "/api/bots");
    const list = document.getElementById(listId);
    if (!list) return;
    if (!botList.length) {
      list.innerHTML = '<li class="bot-empty">No bots yet</li>';
      return;
    }
    list.innerHTML = botList.map(b => `
      <li class="bot-item" data-bot-id="${b.id}">
        <div class="bot-info">
          <strong>${esc(b.displayName)}</strong>
          <span class="bot-username">@${esc(b.username)}</span>
        </div>
        <div class="bot-item-actions">
          <button class="btn-sm secondary manage-bot-btn" data-bot-id="${b.id}">Manage</button>
        </div>
      </li>
    `).join("");
    list.querySelectorAll(".manage-bot-btn").forEach(btn => {
      btn.onclick = () => showManageBotModal(parseInt(btn.dataset.botId, 10));
    });
  } catch {}
}

function showCreateBotModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Create Bot</h3>
      <label>Username</label>
      <input type="text" id="bot-username-input" placeholder="my-bot" maxlength="50" autocomplete="off">
      <label>Display Name</label>
      <input type="text" id="bot-displayname-input" placeholder="My Bot" maxlength="100" autocomplete="off">
      <div id="bot-create-error" class="error hidden"></div>
      <div class="modal-actions">
        <button id="bot-create-submit">Create</button>
        <button id="bot-create-cancel" class="secondary">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#bot-create-cancel").onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
  const nameInput = backdrop.querySelector("#bot-username-input");
  nameInput.focus();
  backdrop.querySelector("#bot-create-submit").onclick = async () => {
    const username = nameInput.value.trim().toLowerCase();
    const displayName = backdrop.querySelector("#bot-displayname-input").value.trim();
    if (!username) return;
    try {
      await api("POST", "/api/bots", { username, displayName: displayName || username });
      backdrop.remove();
      loadBots("bot-list");
      loadBots("admin-bot-list");
    } catch (e) {
      const errEl = backdrop.querySelector("#bot-create-error");
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
  nameInput.onkeydown = (e) => {
    if (e.key === "Enter") backdrop.querySelector("#bot-create-submit").click();
  };
}

async function showManageBotModal(botId) {
  let botList;
  try { botList = await api("GET", "/api/bots"); } catch { return; }
  const bot = botList.find(b => b.id === botId);
  if (!bot) return;

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal modal-wide">
      <h3>${esc(bot.displayName)} <span class="bot-username">@${esc(bot.username)}</span></h3>

      <div class="manage-section">
        <h4>Tokens</h4>
        <div id="manage-token-list" class="manage-list"></div>
        <div class="manage-actions">
          <input type="text" id="token-label-input" placeholder="Token label (optional)" class="input-sm">
          <button id="generate-token-btn" class="btn-sm">Generate Token</button>
        </div>
      </div>

      <div class="manage-section">
        <h4>Channel Bindings</h4>
        <div id="manage-binding-list" class="manage-list"></div>
        <div class="manage-actions">
          <select id="bind-channel-select" class="input-sm"></select>
          <button id="bind-channel-btn" class="btn-sm">Bind</button>
        </div>
      </div>

      <div class="modal-actions">
        <button id="delete-bot-btn" class="btn-sm" style="background:#c0392b">Delete Bot</button>
        <button id="manage-close" class="secondary">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector("#manage-close").onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };

  // Load tokens
  async function refreshTokens() {
    try {
      const tokens = await api("GET", `/api/bots/${botId}/tokens`);
      const el = backdrop.querySelector("#manage-token-list");
      if (!tokens.length) {
        el.innerHTML = '<div class="manage-empty">No tokens</div>';
        return;
      }
      el.innerHTML = tokens.map(t => `
        <div class="manage-item">
          <span>${esc(t.label || "(no label)")} <span class="manage-meta">${t.revokedAt ? "revoked" : "active"}</span></span>
          ${t.revokedAt ? '' : `<button class="btn-sm secondary revoke-token-btn" data-token-id="${t.id}">Revoke</button>`}
        </div>
      `).join("");
      el.querySelectorAll(".revoke-token-btn").forEach(btn => {
        btn.onclick = async () => {
          try {
            await api("DELETE", `/api/bots/tokens/${btn.dataset.tokenId}`);
            refreshTokens();
          } catch {}
        };
      });
    } catch {}
  }

  // Load bindings
  async function refreshBindings() {
    try {
      const bindings = await api("GET", `/api/bots/${botId}/bindings`);
      const channels = await api("GET", "/api/channels");
      const el = backdrop.querySelector("#manage-binding-list");
      if (!bindings.length) {
        el.innerHTML = '<div class="manage-empty">No channel bindings</div>';
      } else {
        el.innerHTML = bindings.map(b => {
          const ch = channels.find(c => c.id === b.channelId);
          const name = ch ? ch.name : `#${b.channelId}`;
          const scopes = [b.canRead ? "read" : "", b.canWrite ? "write" : ""].filter(Boolean).join(", ");
          return `
            <div class="manage-item">
              <span>#${esc(name)} <span class="manage-meta">${scopes}</span></span>
              <button class="btn-sm secondary unbind-btn" data-channel-id="${b.channelId}">Unbind</button>
            </div>
          `;
        }).join("");
        el.querySelectorAll(".unbind-btn").forEach(btn => {
          btn.onclick = async () => {
            try {
              await api("DELETE", `/api/bots/${botId}/bindings/${btn.dataset.channelId}`);
              refreshBindings();
            } catch {}
          };
        });
      }

      // Populate channel select (exclude already bound)
      const boundIds = new Set(bindings.map(b => b.channelId));
      const select = backdrop.querySelector("#bind-channel-select");
      const available = channels.filter(c => !boundIds.has(c.id));
      select.innerHTML = available.length
        ? available.map(c => `<option value="${c.id}">#${esc(c.name)}</option>`).join("")
        : '<option disabled>All channels bound</option>';
    } catch {}
  }

  refreshTokens();
  refreshBindings();

  // Generate token
  backdrop.querySelector("#generate-token-btn").onclick = async () => {
    const label = backdrop.querySelector("#token-label-input").value.trim();
    try {
      const result = await api("POST", `/api/bots/${botId}/tokens`, { label });
      backdrop.querySelector("#token-label-input").value = "";
      refreshTokens();
      showBotTokenModal(result.token);
    } catch {}
  };

  // Bind channel
  backdrop.querySelector("#bind-channel-btn").onclick = async () => {
    const select = backdrop.querySelector("#bind-channel-select");
    const channelId = parseInt(select.value, 10);
    if (!channelId) return;
    try {
      await api("POST", `/api/bots/${botId}/bindings`, { channelId, canRead: true, canWrite: true });
      refreshBindings();
    } catch {}
  };

  // Delete bot
  backdrop.querySelector("#delete-bot-btn").onclick = async () => {
    if (!confirm(`Delete bot @${bot.username}? This cannot be undone.`)) return;
    try {
      await api("DELETE", `/api/bots/${botId}`);
      backdrop.remove();
      loadBots("bot-list");
      loadBots("admin-bot-list");
    } catch {}
  };
}

function showBotTokenModal(token) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal">
      <h3>Bot Token Generated</h3>
      <p class="token-warning">Copy this token now. It will not be shown again.</p>
      <div class="invite-code" style="user-select:all;word-break:break-all">${esc(token)}</div>
      <div class="modal-actions">
        <button class="btn-sm copy-link-btn" data-url="${esc(token)}">Copy Token</button>
        <button id="token-modal-close" class="secondary">Done</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  attachCopyHandler(backdrop);
  backdrop.querySelector("#token-modal-close").onclick = () => backdrop.remove();
  backdrop.onclick = (e) => { if (e.target === backdrop) backdrop.remove(); };
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

// --- Routing ---

function navigate(path, replace = false) {
  if (replace) {
    history.replaceState(null, "", path);
  } else {
    history.pushState(null, "", path);
  }
}

async function handleRoute(channelsList) {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);

  let channelName = null;
  let threadId = null;

  if (parts.length >= 1) {
    channelName = parts[0];
  }
  if (parts.length === 3 && parts[1] === "t") {
    threadId = parseInt(parts[2], 10);
    if (isNaN(threadId)) threadId = null;
  }

  let target = null;
  if (channelName) {
    target = channelsList.find(c => c.name === channelName);
  }

  if (!target) {
    target = channelsList.find(c => c.name === "general");
  }

  if (target) {
    await selectChannel(target, true);
    const canonicalPath = `/${target.name}`;
    if (!channelName || !channelsList.find(c => c.name === channelName)) {
      navigate(canonicalPath, true);
    }
    if (threadId) {
      await openThread(threadId, true);
    }
  }
}

window.addEventListener("popstate", () => {
  if (!currentUser) return;
  const channelEls = document.querySelectorAll(".channel-list li");
  const channelsList = Array.from(channelEls).map(li => ({
    id: parseInt(li.dataset.id, 10),
    name: li.dataset.name,
  }));
  handleRoute(channelsList);
});

// --- Boot ---

function extractInviteCode() {
  const match = location.pathname.match(/^\/invite\/([a-f0-9]+)$/i);
  return match ? match[1] : null;
}

async function boot() {
  const inviteCode = extractInviteCode();

  try {
    const { hasUsers } = await api("GET", "/api/auth/has-users");
    if (!hasUsers) {
      renderBootstrap();
      return;
    }
  } catch {
    renderLogin(inviteCode);
    return;
  }

  try {
    currentUser = await api("GET", "/api/auth/me");
    renderMain();
  } catch {
    renderLogin(inviteCode);
  }
}

boot();
