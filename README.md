# ChatApp 💬

A modern, real-time chat application built with **Fastify**, **Socket.io**, and **React**. This app features a polished dark-themed UI, real-time messaging, unread message badges, and file sharing.

## ✨ Features

- **Real-time Messaging**: Instant communication powered by Socket.io.
- **Unread Badges**: See how many messages you've missed in each channel.
- **Channels & DMs**: Create public channels or chat privately with other users.
- **Presence Indicators**: See who's online in real-time.
- **File Sharing**: Upload and share images or documents.
- **Modern UI/UX**: Polished dark theme with smooth animations and transitions.
- **Accessibility**: Built with ARIA roles and keyboard support in mind.
- **Responsive Design**: Works great on different screen sizes.

## 🚀 Tech Stack

- **Frontend**: React, Vite, Socket.io-client, Axios, Vanilla CSS.
- **Backend**: Fastify, Socket.io, Node.js.
- **Database**: PostgreSQL (via `pg`).
- **Containerization**: Docker & Docker Compose.

---

## 🛠️ Setup Guide

Follow these steps to get the project running locally.

### Prerequisites

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **Docker** & **Docker Compose** (for the database)

### 1. Clone the Repository

```bash
git clone https://github.com/sidraut264/neo-chat.git
cd neo-chat
```

### 2. Backend Setup (Server)

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Copy the example environment file:
     ```bash
     cp .env.example .env
     ```
   - (Optional) Open `.env` and adjust the variables if needed.
4. Start the PostgreSQL database:
   ```bash
   docker-compose up -d
   ```
5. Run the server in development mode:
   ```bash
   npm run dev
   ```
   The server will start at `http://localhost:4000`.

### 3. Frontend Setup (Client)

1. Open a new terminal tab and navigate to the client directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

---

## 📂 Project Structure

- `client/`: React frontend application.
- `server/`: Fastify backend application.
  - `routes/`: API endpoint definitions.
  - `socket/`: Real-time event handlers.
  - `uploads/`: Directory for shared files.
- `docker-compose.yml`: Database configuration.

## 📝 License

This project is open-source and available under the MIT License.