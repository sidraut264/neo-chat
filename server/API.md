# Chat App — API Contract

Base URL: `http://localhost:4000`
All protected routes require: `Authorization: Bearer <token>`

---

## Auth

### POST /auth/register
**Body:** `{ name, email, password (min 6 chars) }`
**Response 201:** `{ token, user: { id, name, email } }`
**Errors:** `409` email taken · `400` validation

### POST /auth/login
**Body:** `{ email, password }`
**Response 200:** `{ token, user: { id, name, email } }`
**Errors:** `401` invalid credentials

---

## Users

### GET /users/me 🔒
**Response:** `{ id, name, email, created_at }`

### GET /users 🔒
All users except the current user (for the People sidebar).
**Response:** `[{ id, name, email }]`

---

## Channels

### GET /channels 🔒
All channels the current user is a member of.
**Response:** `[{ id, name, is_dm, created_at }]`
Channels ordered: group channels first (alphabetical), then DMs.

### POST /channels 🔒
Create a new group channel. All existing users are added automatically.
**Body:** `{ name }`
**Response 201:** `{ id, name, is_dm: false, created_at }`

### POST /channels/dm 🔒
Start a DM with another user. Returns existing DM if one already exists.
**Body:** `{ userId: <int> }`
**Response 201 or 200:** `{ id, name, is_dm: true, created_at }`
**Errors:** `400` same user · `404` user not found

---

## Messages

### GET /channels/:id/messages 🔒
Returns last 50 messages, oldest first.
Supports pagination via `?before=<messageId>&limit=<n>` (max 100).
**Response:** `[{ id, channel_id, content, file_url, file_name, created_at, user_id, user_name }]`
**Errors:** `403` not a member of this channel

### DELETE /messages/:id 🔒
Delete your own message.
**Response 204**
**Errors:** `403` not your message · `404` not found
Also emits `message:deleted` via WebSocket to the channel.

---

## Files

### POST /upload 🔒
Upload a file (`multipart/form-data`, field name: `file`).
Max size: 10 MB.
Allowed types: jpeg, png, gif, webp, pdf, txt, zip, docx, xlsx.
**Response 201:** `{ fileUrl, fileName, mimeType, size }`

### GET /uploads/:filename
Serve an uploaded file (public, no auth required).

---

## Health

### GET /health
**Response:** `{ status: "ok" }`

---

## WebSocket

Connect to `ws://localhost:4000` with Socket.io.
Authenticate via handshake: `{ auth: { token: "<jwt>" } }`

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `join:channels` | `[channelId, ...]` | Join socket rooms on connect |
| `message:send` | `{ channelId, content?, fileUrl?, fileName? }` | Send a message |
| `typing:start` | `{ channelId }` | User started typing |
| `typing:stop` | `{ channelId }` | User stopped typing |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message:new` | `{ id, channel_id, content, file_url, file_name, created_at, user_id, user_name }` | New message in a channel |
| `message:deleted` | `{ id, channelId }` | A message was deleted |
| `presence` | `[{ userId, name }]` | Full list of online users (sent on any connect/disconnect) |
| `channel:new` | `{ id, name, is_dm }` | A new channel was created |
| `typing:start` | `{ userId, name, channelId }` | Someone started typing |
| `typing:stop` | `{ userId, channelId }` | Someone stopped typing |

---

## Error format
All errors follow: `{ error: "<message>" }`
HTTP status codes: `400` bad input · `401` unauthenticated · `403` forbidden · `404` not found · `409` conflict · `413` too large · `415` unsupported type
