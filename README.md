# NATS UI

A fast, modern web UI for NATS messaging system with **content-based message filtering** that no other NATS GUI supports.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Go Report Card](https://goreportcard.com/badge/github.com/yourusername/nats-ui)](https://goreportcard.com/report/github.com/yourusername/nats-ui)

## Features

### 🎯 Content-Based Message Filtering (Unique!)
Filter messages by value with multiple options:
- **Contains** — Search for substring matches
- **Exact** — Match exact values
- **Regex** — Use regular expressions
- **JSON Path** — Filter by specific JSON fields using dot-notation
- **Case Sensitivity Toggle** — Control case-sensitive matching
- **Negate** — Exclude matching messages

### 📊 Historical Message Analysis
Filter stored stream messages by:
- **Sequence Number Range** — Filter by message sequence
- **DateTime Range** — Filter by timestamp (start/end)
- **Content Value** — Combine with content filters

### 🛠️ Complete Stream Management
- Create new JetStream streams
- Edit stream subjects
- Delete streams
- Purge messages
- View and manage consumers
- Pause/resume consumer delivery

### 📡 Live Subscriptions
- Subscribe to topics with content filtering
- Real-time message stream
- Live filtering applied instantly
- Auto-scroll and message counter

### 📈 Dashboard & Monitoring
- Server info and JetStream status
- Stream overview with statistics
- Message and byte counts
- Consumer tracking
- Multiple saved connections

### 💾 Persistent Configuration
- Save multiple NATS cluster connections
- Stored locally in `~/.nats-ui/connections.json`
- Easy switching between clusters

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| State Management | Zustand |
| Backend | Go + Fiber |
| NATS Client | nats.go |
| Storage | JSON file |

## Quick Start

### Option 1: Docker Compose (Easiest)

```bash
docker-compose up
# Open http://localhost:5173
```

### Option 2: Manual Setup

**Prerequisites:**
- Go 1.19+
- Node.js 16+
- NATS server running locally (or use `nats-server -js`)

**Backend:**
```bash
cd backend
go mod tidy
go run main.go
# Runs on http://localhost:8080
```

**Frontend:**
```bash
cd frontend-app
npm install
npm run dev
# Runs on http://localhost:5173
```

**Open UI:**
Navigate to `http://localhost:5173` and add your NATS connection:
- **URL:** `nats://localhost:4222`
- **Name:** Local NATS (or any name)

## Usage

### Publishing Messages

```bash
# Publish valid JSON (required for JSON filters)
nats pub orders.create '{"id":123,"status":"pending"}'
nats pub orders.update '{"id":123,"status":"shipped"}'
```

### Subscribing with Filters

1. Go to **Subscribe** tab
2. Enter subject or wildcard (e.g., `orders.>`)
3. Click **Content Filter**
4. Choose filter type:
   - **Contains:** Search raw payload or specific field
   - **Exact:** Match complete value
   - **Regex:** Use pattern matching
   - **JSON Path:** Filter by field (e.g., `status`)
5. Toggle **Case sensitive** as needed
6. Click **Subscribe**

### Viewing Stream Messages

1. Go to **Streams** tab
2. Click on a stream to expand
3. Use filters:
   - **Last N messages** — Limit results
   - **Sequence range** — Filter by seq numbers
   - **DateTime range** — Filter by timestamp
   - **Content filter** — Apply content matching
4. Click **Fetch** to retrieve messages

### Stream Management

1. Go to **Dashboard** tab
2. Click **Stream Admin** button
3. **Manage Streams:** View consumers, pause/resume, delete
4. **Create Stream:** Add new streams with subjects

### Quick Actions on Streams

Hover over any stream in the list:
- 🗑️ **Purge** — Delete all messages
- ❌ **Delete** — Remove the stream

## Filter Examples

| Goal | Type | Field | Value |
|------|------|-------|-------|
| Find error messages | contains | _(empty)_ | `error` |
| User in city | jsonpath | `user.address.city` | `New York` |
| Specific ID | exact | `user.id` | `usr_123` |
| Order pattern | regex | _(empty)_ | `^ORDER-[0-9]+` |
| Exclude heartbeats | contains + negate | _(empty)_ | `heartbeat` |

## Project Structure

```
nats-ui/
├── backend/              # Go backend
│   ├── main.go          # Entry point
│   ├── api/             # HTTP handlers
│   ├── nats/            # NATS bridge & filtering
│   ├── models/          # Data models
│   └── store/           # Connection storage
├── frontend-app/        # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── stores/      # Zustand state
│   │   ├── lib/         # API client
│   │   └── types.ts     # TypeScript types
│   └── vite.config.ts   # Vite config
├── docker-compose.yml   # Docker setup
├── LICENSE              # MIT License
└── README.md            # This file
```

## Configuration

### Environment Variables

**Backend:**
- `PORT` — HTTP server port (default: 8080)

**Frontend:**
- Automatically proxies `/api` to backend via Vite dev server

### Connection Storage

Connections are stored in:
```
~/.nats-ui/connections.json
```

Example:
```json
[
  {
    "id": "local",
    "name": "Local NATS",
    "url": "nats://localhost:4222",
    "username": "",
    "password": ""
  }
]
```

## Development

### Install Dependencies

```bash
# Backend
cd backend
go mod tidy

# Frontend
cd frontend-app
npm install
```

### Run in Development Mode

```bash
# Terminal 1 - Backend
cd backend
go run main.go

# Terminal 2 - Frontend
cd frontend-app
npm run dev
```

### Build for Production

```bash
# Backend
cd backend
go build -o nats-ui

# Frontend
cd frontend-app
npm run build
```

## API Endpoints

### Connections
- `GET /api/connections` — List saved connections
- `POST /api/connections` — Create connection
- `PUT /api/connections/{id}` — Update connection
- `DELETE /api/connections/{id}` — Delete connection

### Connection Status
- `POST /api/connections/{id}/connect` — Connect to NATS
- `POST /api/connections/{id}/disconnect` — Disconnect
- `GET /api/connections/{id}/status` — Check connection status

### Streams
- `GET /api/connections/{id}/streams` — List streams
- `POST /api/connections/{id}/streams` — Create stream
- `PUT /api/connections/{id}/streams/{stream}` — Edit stream
- `DELETE /api/connections/{id}/streams/{stream}` — Delete stream
- `POST /api/connections/{id}/streams/{stream}/purge` — Purge stream

### Stream Messages
- `POST /api/connections/{id}/streams/{stream}/messages` — Get messages with filters

### Consumers
- `GET /api/connections/{id}/streams/{stream}/consumers` — List consumers
- `POST /api/connections/{id}/streams/{stream}/consumers` — Create consumer
- `DELETE /api/connections/{id}/streams/{stream}/consumers/{consumer}` — Delete consumer
- `POST /api/connections/{id}/streams/{stream}/consumers/{consumer}/pause` — Pause
- `POST /api/connections/{id}/streams/{stream}/consumers/{consumer}/resume` — Resume

### Publishing
- `POST /api/connections/{id}/publish` — Publish message

### Live Subscriptions
- `GET /ws/{id}/subscribe` — WebSocket for live message stream

## Roadmap

- [ ] SSH tunnel support
- [ ] Object store browser
- [ ] Advanced authentication (Token/NKey)
- [ ] Message history replay
- [ ] Export messages (JSON/CSV)
- [ ] Multi-language support
- [ ] Dark mode improvements
- [ ] Performance optimizations

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## Comparison with Other NATS UIs

| Feature | NATS UI | QAZE | Others |
|---------|---------|------|--------|
| Content-based filtering | ✅ Unique | Limited | Limited |
| Case-sensitive matching | ✅ Yes | ❓ | ❓ |
| DateTime range filtering | ✅ Yes | ✅ | ❌ |
| Stream management | ✅ Yes | ✅ | ✅ |
| Web-based | ✅ Yes | ❌ | Varies |
| Open source | ✅ MIT | ❌ | Varies |
| Lightweight | ✅ Yes | ❌ | Varies |

## Support

- 📖 [Documentation](README.md)
- 🐛 [Report Issues](https://github.com/yourusername/nats-ui/issues)
- 💬 [Discussions](https://github.com/yourusername/nats-ui/discussions)
- 📧 [Email](mailto:your-email@example.com)

## Acknowledgments

- [NATS](https://nats.io) — The messaging system
- [nats.go](https://github.com/nats-io/nats.go) — Go NATS client
- [React](https://react.dev) — UI framework
- [Tailwind CSS](https://tailwindcss.com) — Styling

## Related Projects

- [NATS](https://github.com/nats-io/nats-server) — NATS server
- [nats.go](https://github.com/nats-io/nats.go) — Go client library
- [QAZE](https://qaze.app) — Alternative NATS GUI

---

**Made with ❤️ for the NATS community**
