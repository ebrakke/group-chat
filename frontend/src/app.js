// Relay Chat - Minimal SPA Frontend
const app = document.getElementById("app");

let currentUser = null;

async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" }, credentials: "include" };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// --- Screens ---

function renderBootstrap() {
  app.innerHTML = `
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
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
}

function renderLogin() {
  app.innerHTML = `
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
      renderMain();
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove("hidden");
    }
  };
}

async function renderMain() {
  let channelsHtml = "";
  try {
    const channels = await api("GET", "/api/channels");
    if (channels.length > 0) {
      channelsHtml = `<ul class="channel-list">${channels.map(c => `<li>${esc(c.name)}</li>`).join("")}</ul>`;
    } else {
      channelsHtml = `<p style="color:#aaa">No channels yet.</p>`;
    }
  } catch {
    channelsHtml = `<p class="error">Failed to load channels.</p>`;
  }

  const adminSection = currentUser && currentUser.role === "admin" ? `
    <div class="card">
      <h2>Admin: Create Invite</h2>
      <div id="invite-error" class="error hidden"></div>
      <div id="invite-result"></div>
      <label for="invite-max-uses">Max Uses (optional)</label>
      <input type="text" id="invite-max-uses" placeholder="e.g. 5">
      <button id="create-invite">Create Invite</button>
      <h2 style="margin-top:1rem">Existing Invites</h2>
      <ul class="invite-list" id="invite-list"></ul>
    </div>
  ` : "";

  app.innerHTML = `
    <div class="topbar">
      <h1>Relay Chat</h1>
      <div>
        <span class="user-info">${esc(currentUser.displayName)} (${esc(currentUser.role)})</span>
        <button id="logout" class="secondary" style="margin-left:0.5rem">Logout</button>
      </div>
    </div>
    <div class="card">
      <h2>Channels</h2>
      ${channelsHtml}
    </div>
    ${adminSection}
  `;

  document.getElementById("logout").onclick = async () => {
    await api("POST", "/api/auth/logout");
    currentUser = null;
    renderLogin();
  };

  if (currentUser && currentUser.role === "admin") {
    loadInvites();
    document.getElementById("create-invite").onclick = async () => {
      const errEl = document.getElementById("invite-error");
      errEl.classList.add("hidden");
      try {
        const maxStr = document.getElementById("invite-max-uses").value;
        const body = {};
        if (maxStr) body.maxUses = parseInt(maxStr, 10);
        const invite = await api("POST", "/api/invites", body);
        document.getElementById("invite-result").innerHTML = `
          <div class="invite-code">${invite.code}</div>
        `;
        loadInvites();
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove("hidden");
      }
    };
  }
}

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

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
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
