import React, {
  useState, useEffect, useRef, useCallback,
} from "react";
import axios from "axios";
import { io } from "socket.io-client";

// ─── API client ───────────────────────────────────────────────────────────────
const api = axios.create();
api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const initials = (name = "") =>
  name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const isImg = (name = "") => /\.(jpe?g|png|gif|webp)$/i.test(name);

function parseJwt(token) {
  try { return JSON.parse(atob(token.split(".")[1])); }
  catch { return null; }
}

// ─── Auth Page ────────────────────────────────────────────────────────────────
function AuthPage({ onLogin }) {
  const [mode, setMode]   = useState("login");
  const [form, setForm]   = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const { data } = await api.post(`/auth/${mode}`, form);
      localStorage.setItem("token", data.token);
      onLogin(data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    } finally { setBusy(false); }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-icon">💬</span>
          <span>ChatApp</span>
        </div>
        <div className="auth-sub">
          {mode === "login" ? "Sign in to your workspace" : "Create a new account"}
        </div>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          {mode === "register" && (
            <>
              <label htmlFor="auth-name">Name</label>
              <input id="auth-name" placeholder="Your name" value={form.name} onChange={set("name")} required />
            </>
          )}
          <label htmlFor="auth-email">Email</label>
          <input id="auth-email" type="email" placeholder="you@company.com" value={form.email} onChange={set("email")} required />
          <label htmlFor="auth-password">Password</label>
          <input id="auth-password" type="password" placeholder={mode === "register" ? "min. 6 characters" : "••••••••"} value={form.password} onChange={set("password")} required />
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
        <div className="auth-toggle">
          {mode === "login" ? (
            <>No account? <span role="button" tabIndex={0} onClick={() => setMode("register")} onKeyDown={(e) => e.key === "Enter" && setMode("register")}>Register</span></>
          ) : (
            <>Have an account? <span role="button" tabIndex={0} onClick={() => setMode("login")} onKeyDown={(e) => e.key === "Enter" && setMode("login")}>Sign in</span></>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Channel Modal ─────────────────────────────────────────────────────────
function NewChannelModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const { data } = await api.post("/channels", { name });
      onCreate(data);
      onClose();
    } catch (err) {
      alert(err.response?.data?.error || "Failed");
    }
  }
  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="New channel">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Create Channel</h3>
        <form onSubmit={submit}>
          <label htmlFor="new-ch-name">Channel name</label>
          <input id="new-ch-name" autoFocus placeholder="e.g. general" value={name}
            onChange={(e) => setName(e.target.value)} />
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Unread badge pill ────────────────────────────────────────────────────────
function UnreadBadge({ count }) {
  if (!count) return null;
  return (
    <span className="unread-badge" aria-label={`${count} unread message${count > 1 ? "s" : ""}`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ─── Single message ───────────────────────────────────────────────────────────
function Message({ msg, currentUserId, onDelete }) {
  const isMine = msg.user_id === currentUserId;
  return (
    <div className={`msg-group ${isMine ? "msg-mine" : ""}`} role="listitem">
      <div className="msg-avatar" aria-hidden="true">{initials(msg.user_name)}</div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="msg-name">{msg.user_name}</span>
          <span className="msg-time">{fmtTime(msg.created_at)}</span>
        </div>
        {msg.content && <div className="msg-text">{msg.content}</div>}
        {msg.file_url && (
          isImg(msg.file_name)
            ? <img className="msg-img" src={msg.file_url} alt={msg.file_name} />
            : <a className="msg-file" href={msg.file_url} target="_blank" rel="noreferrer">
                📎 {msg.file_name}
              </a>
        )}
      </div>
      {isMine && (
        <button
          className="msg-delete"
          onClick={() => onDelete(msg.id)}
          title="Delete message"
          aria-label="Delete message"
        >✕</button>
      )}
    </div>
  );
}

// ─── Chat pane ────────────────────────────────────────────────────────────────
function ChatPane({ channel, socket, currentUser, onlineIds }) {
  const [messages, setMessages]   = useState([]);
  const [text, setText]           = useState("");
  const [uploading, setUploading] = useState(false);
  const [typers, setTypers]       = useState({});
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef   = useRef(null);
  const fileRef     = useRef(null);
  const typingTimer = useRef(null);
  const inputRef    = useRef(null);

  // Load messages when channel changes
  useEffect(() => {
    if (!channel) return;
    setMessages([]);
    setLoadingMsgs(true);
    api.get(`/channels/${channel.id}/messages`)
      .then(({ data }) => setMessages(data))
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
    // Focus input on channel switch
    inputRef.current?.focus();
  }, [channel?.id]);

  // Socket listeners
  useEffect(() => {
    if (!socket || !channel) return;

    const onMsg = (msg) => {
      if (msg.channel_id === channel.id) {
        setMessages((prev) => [...prev, msg]);
        setTypers((t) => { const n = { ...t }; delete n[msg.user_id]; return n; });
      }
    };
    const onDeleted = ({ id, channelId }) => {
      if (channelId === channel.id)
        setMessages((prev) => prev.filter((m) => m.id !== id));
    };
    const onTypingStart = ({ userId, name, channelId }) => {
      if (channelId === channel.id && userId !== currentUser.id)
        setTypers((t) => ({ ...t, [userId]: name }));
    };
    const onTypingStop = ({ userId, channelId }) => {
      if (channelId === channel.id)
        setTypers((t) => { const n = { ...t }; delete n[userId]; return n; });
    };

    socket.on("message:new",     onMsg);
    socket.on("message:deleted", onDeleted);
    socket.on("typing:start",    onTypingStart);
    socket.on("typing:stop",     onTypingStop);

    return () => {
      socket.off("message:new",     onMsg);
      socket.off("message:deleted", onDeleted);
      socket.off("typing:start",    onTypingStart);
      socket.off("typing:stop",     onTypingStop);
    };
  }, [socket, channel?.id, currentUser.id]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(e) {
    e.preventDefault();
    if (!text.trim() || !socket) return;
    socket.emit("message:send", { channelId: channel.id, content: text.trim() });
    socket.emit("typing:stop", { channelId: channel.id });
    setText("");
    clearTimeout(typingTimer.current);
  }

  function handleTextChange(e) {
    setText(e.target.value);
    if (!socket) return;
    socket.emit("typing:start", { channelId: channel.id });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit("typing:stop", { channelId: channel.id });
    }, 2000);
  }

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload", fd);
      socket.emit("message:send", {
        channelId: channel.id,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
      });
    } catch (err) {
      alert(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function deleteMessage(id) {
    if (!confirm("Delete this message?")) return;
    try {
      await api.delete(`/messages/${id}`);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to delete");
    }
  }

  const typerNames = Object.values(typers);
  const typingText = typerNames.length === 0 ? ""
    : typerNames.length === 1 ? `${typerNames[0]} is typing…`
    : `${typerNames.join(", ")} are typing…`;

  if (!channel) {
    return (
      <div className="empty-state">
        <div className="empty-icon">💬</div>
        <h2>Welcome to ChatApp</h2>
        <p>Select a channel or start a direct message to begin chatting.</p>
      </div>
    );
  }

  return (
    <div className="chat">
      <div className="chat-header">
        <span className="chat-header-prefix" aria-hidden="true">{channel.is_dm ? "@" : "#"}</span>
        <span className="chat-header-name">{channel.name}</span>
        <span className="chat-header-badge">{messages.length} messages</span>
      </div>

      <div className="messages" role="list" aria-label={`Messages in ${channel.name}`}>
        {loadingMsgs && (
          <div className="messages-loading" aria-live="polite">
            <div className="loading-dots"><span/><span/><span/></div>
            <span>Loading messages…</span>
          </div>
        )}
        {!loadingMsgs && messages.length === 0 && (
          <div className="messages-empty">
            No messages yet — be the first to say something! 👋
          </div>
        )}
        {messages.map((m) => (
          <Message
            key={m.id}
            msg={m}
            currentUserId={currentUser.id}
            onDelete={deleteMessage}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="typing-indicator" aria-live="polite" aria-atomic="true">{typingText}</div>

      <div className="input-area">
        <form className="input-wrap" onSubmit={sendMessage}>
          <input
            ref={inputRef}
            type="text"
            placeholder={`Message ${channel.is_dm ? "@" : "#"}${channel.name}`}
            value={text}
            onChange={handleTextChange}
            aria-label={`Message ${channel.name}`}
          />
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleFile} aria-hidden="true" />
          <button
            type="button"
            className="attach-btn"
            onClick={() => fileRef.current?.click()}
            title="Attach file"
            aria-label="Attach file"
            disabled={uploading}
          >
            {uploading ? <span className="upload-spinner">⏳</span> : "📎"}
          </button>
          <button
            type="submit"
            className="send-btn"
            aria-label="Send message"
            disabled={!text.trim()}
          >
            Send ↑
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    const t = localStorage.getItem("token");
    return t ? parseJwt(t) : null;
  });
  const [socket,        setSocket]        = useState(null);
  const [channels,      setChannels]      = useState([]);
  const [users,         setUsers]         = useState([]);
  const [onlineIds,     setOnlineIds]     = useState(new Set());
  const [activeChannel, setActiveChannel] = useState(null);
  const [showModal,     setShowModal]     = useState(false);
  const [health,        setHealth]        = useState(null);
  // unreadCounts: { [channelId]: number }
  const [unreadCounts,  setUnreadCounts]  = useState({});

  const activeChannelRef = useRef(activeChannel);
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  // Health check on mount
  useEffect(() => {
    api.get("/health")
      .then(() => setHealth("ok"))
      .catch(() => setHealth("err"));
  }, []);

  // Connect when user logs in
  useEffect(() => {
    if (!user) return;
    const token = localStorage.getItem("token");

    const s = io({ auth: { token }, transports: ["websocket"] });

    s.on("connect", () => {
      setSocket(s);
    });
    s.on("connect_error", (err) => {
      console.error("Socket error:", err.message);
    });
    s.on("presence", (list) => {
      setOnlineIds(new Set(list.map((u) => u.userId)));
    });
    s.on("channel:new", (ch) => {
      setChannels((prev) => prev.find((c) => c.id === ch.id) ? prev : [...prev, ch]);
    });

    // ─── Track unread messages ──────────────────────────────────────
    s.on("message:new", (msg) => {
      const active = activeChannelRef.current;
      // Only count as unread if the message is NOT in the active channel
      // and NOT sent by current user
      if (
        msg.channel_id !== active?.id &&
        msg.user_id !== user.id
      ) {
        setUnreadCounts((prev) => ({
          ...prev,
          [msg.channel_id]: (prev[msg.channel_id] || 0) + 1,
        }));
      }
    });

    // Load data
    Promise.all([api.get("/channels"), api.get("/users")])
      .then(([ch, us]) => {
        setChannels(ch.data);
        setUsers(us.data);
        s.emit("join:channels", ch.data.map((c) => c.id));
        const first = ch.data.find((c) => !c.is_dm);
        if (first) setActiveChannel(first);
      })
      .catch(console.error);

    return () => s.disconnect();
  }, [user?.id]);

  // Re-join rooms when channels list grows
  useEffect(() => {
    if (socket?.connected && channels.length) {
      socket.emit("join:channels", channels.map((c) => c.id));
    }
  }, [channels.length]);

  // Clear unread count when switching to a channel
  function openChannel(ch) {
    setActiveChannel(ch);
    setUnreadCounts((prev) => {
      if (!prev[ch.id]) return prev;
      const next = { ...prev };
      delete next[ch.id];
      return next;
    });
  }

  async function startDM(other) {
    try {
      const { data } = await api.post("/channels/dm", { userId: other.id });
      setChannels((prev) => prev.find((c) => c.id === data.id) ? prev : [...prev, data]);
      openChannel(data);
      socket?.emit("join:channels", [data.id]);
    } catch (err) {
      alert(err.response?.data?.error || "Failed");
    }
  }

  function handleLogin(u) { setUser(u); }

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null); setSocket(null);
    setChannels([]); setUsers([]);
    setActiveChannel(null);
    setUnreadCounts({});
  }

  function handleNewChannel(ch) {
    setChannels((prev) => prev.find((c) => c.id === ch.id) ? prev : [...prev, ch]);
    openChannel(ch);
  }

  // Total unread across all channels (for page title)
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // Update page title with unread count — must be before early return to follow Rules of Hooks
  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) ChatApp` : "ChatApp";
  }, [totalUnread]);

  if (!user) return <AuthPage onLogin={handleLogin} />;

  const groupChannels = channels.filter((c) => !c.is_dm);
  const dmChannels    = channels.filter((c) => c.is_dm);


  return (
    <div className="layout">
      {/* ── Sidebar ── */}
      <nav className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-header">
          <div className="ws-logo">💬</div>
          <span className="ws-name">ChatApp</span>
          {health && (
            <span className={`health ${health}`} title={health === "ok" ? "API connected" : "API disconnected"}>
              {health === "ok" ? "●" : "●"}
            </span>
          )}
        </div>

        <div className="sidebar-scroll">
          {/* Channels */}
          <div className="sidebar-section">
            <div className="sidebar-section-title">
              <span>Channels</span>
              <button
                className="sidebar-add"
                onClick={() => setShowModal(true)}
                title="New channel"
                aria-label="Create new channel"
              >+</button>
            </div>
            {groupChannels.map((ch) => {
              const unread = unreadCounts[ch.id] || 0;
              return (
                <div key={ch.id}
                  role="button"
                  tabIndex={0}
                  className={`ch-item ${activeChannel?.id === ch.id ? "active" : ""} ${unread > 0 ? "has-unread" : ""}`}
                  onClick={() => openChannel(ch)}
                  onKeyDown={(e) => e.key === "Enter" && openChannel(ch)}
                  aria-current={activeChannel?.id === ch.id ? "page" : undefined}
                  aria-label={unread > 0 ? `${ch.name}, ${unread} unread messages` : ch.name}
                >
                  <span className="ch-prefix" aria-hidden="true">#</span>
                  <span className="ch-name">{ch.name}</span>
                  <UnreadBadge count={unread} />
                </div>
              );
            })}
          </div>

          {/* DMs */}
          {dmChannels.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-title"><span>Direct Messages</span></div>
              {dmChannels.map((ch) => {
                const unread = unreadCounts[ch.id] || 0;
                return (
                  <div key={ch.id}
                    role="button"
                    tabIndex={0}
                    className={`ch-item ${activeChannel?.id === ch.id ? "active" : ""} ${unread > 0 ? "has-unread" : ""}`}
                    onClick={() => openChannel(ch)}
                    onKeyDown={(e) => e.key === "Enter" && openChannel(ch)}
                    aria-current={activeChannel?.id === ch.id ? "page" : undefined}
                    aria-label={unread > 0 ? `${ch.name}, ${unread} unread messages` : ch.name}
                  >
                    <span className="ch-prefix" aria-hidden="true">@</span>
                    <span className="ch-name">{ch.name}</span>
                    <UnreadBadge count={unread} />
                  </div>
                );
              })}
            </div>
          )}

          {/* People */}
          <div className="sidebar-section">
            <div className="sidebar-section-title"><span>People</span></div>
            {users.map((u) => (
              <div key={u.id}
                role="button"
                tabIndex={0}
                className="ch-item"
                onClick={() => startDM(u)}
                onKeyDown={(e) => e.key === "Enter" && startDM(u)}
                title={`Direct message ${u.name}`}
                aria-label={`Start direct message with ${u.name}${onlineIds.has(u.id) ? " (online)" : ""}`}
              >
                <span className="ch-prefix" aria-hidden="true">·</span>
                <span className="ch-name">{u.name}</span>
                <span className={`presence ${onlineIds.has(u.id) ? "on" : ""}`} aria-hidden="true" />
              </div>
            ))}
          </div>
        </div>

        {/* Me */}
        <div className="sidebar-footer">
          <div className="me-avatar" aria-hidden="true">{initials(user.name)}</div>
          <div className="me-info">
            <span className="me-name">{user.name}</span>
            <span className="me-status">● Online</span>
          </div>
          <button
            className="logout-btn"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
          >⏻</button>
        </div>
      </nav>

      {/* ── Chat pane ── */}
      <ChatPane
        channel={activeChannel}
        socket={socket}
        currentUser={user}
        onlineIds={onlineIds}
      />

      {/* ── New channel modal ── */}
      {showModal && (
        <NewChannelModal
          onClose={() => setShowModal(false)}
          onCreate={handleNewChannel}
        />
      )}
    </div>
  );
}
