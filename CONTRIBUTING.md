# Contributing to NATS UI

Thank you for considering a contribution to NATS UI! We welcome contributions from everyone. This document provides guidelines and instructions for contributing.

## Code of Conduct

Please note that this project is released with a [Contributor Code of Conduct](CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its terms.

## How to Contribute

### Reporting Bugs

Before creating a bug report, please check the issue list as you might find out that you don't need to create one. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps which reproduce the problem** in as many details as possible
- **Provide specific examples to demonstrate the steps** (include links, code snippets, or screenshots)
- **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior
- **Explain which behavior you expected to see instead and why**
- **Include screenshots and animated GIFs if possible** — you can use this tool to record GIFs
- **Include your environment details:** OS, Go version, Node.js version, NATS server version

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description of the suggested enhancement** in as many details as possible
- **Provide specific examples to demonstrate the steps** (include links, code snippets, or screenshots)
- **Describe the current behavior** and **explain the expected behavior**
- **Explain why this enhancement would be useful** to most NATS UI users

### Pull Requests

- Fill in the required template
- Follow the TypeScript/Go styleguides (see below)
- Include appropriate test cases if adding new functionality
- End all files with a newline
- Avoid platform-specific code

## Development Setup

### Prerequisites

- Go 1.19 or later
- Node.js 16 or later
- NATS server (local or remote)

### Local Development

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/yourusername/nats-ui.git
   cd nats-ui
   ```

2. **Install dependencies:**
   ```bash
   # Backend
   cd backend
   go mod tidy

   # Frontend
   cd ../frontend-app
   npm install
   ```

3. **Start the development environment:**
   ```bash
   # Terminal 1 - Start NATS server (if not running)
   nats-server -js

   # Terminal 2 - Start backend
   cd backend
   go run main.go

   # Terminal 3 - Start frontend dev server
   cd frontend-app
   npm run dev
   ```

4. **Open your browser** to `http://localhost:5173`

### Running Tests

Currently, the project does not have extensive test coverage. We encourage contributors to add tests for new features:

```bash
# Backend tests (when available)
cd backend
go test ./...

# Frontend tests (when available)
cd frontend-app
npm test
```

## Styleguides

### Go Code Style

- Follow standard Go conventions from [Effective Go](https://golang.org/doc/effective_go)
- Use `go fmt` to format code
- Use `go vet` to check for common errors
- Keep functions small and focused
- Add comments for exported functions and complex logic
- Use meaningful variable names

### TypeScript/React Code Style

- Follow the existing code structure and patterns in the project
- Use functional components with hooks
- Keep components small and reusable
- Use TypeScript for type safety
- Format code using Prettier (if configured)
- Components should have clear prop interfaces
- Use meaningful variable and function names

### Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line
- Example:
  ```
  Add case-insensitive filtering support

  - Implement normalizeStr helper function
  - Update ContentFilter struct with caseSensitive field
  - Add UI toggle for case sensitivity
  
  Fixes #123
  ```

## Documentation

If you add a new feature:

1. Update the [README.md](README.md) with usage examples
2. Update the API section if adding new endpoints
3. Add the feature to the [Roadmap](README.md#roadmap) if it wasn't already there
4. Include code comments for complex logic

## Directory Structure

```
nats-ui/
├── backend/                 # Go backend source
│   ├── main.go             # Entry point
│   ├── api/                # HTTP handlers
│   ├── nats/               # NATS client bridge
│   ├── models/             # Data structures
│   └── store/              # Persistence
├── frontend-app/           # React frontend source
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── stores/         # Zustand state management
│   │   ├── lib/            # Utilities and API client
│   │   └── types.ts        # TypeScript type definitions
│   └── vite.config.ts      # Vite configuration
├── docs/                   # Additional documentation (if needed)
├── .github/                # GitHub configuration
├── docker-compose.yml      # Docker setup
├── LICENSE                 # MIT License
├── README.md               # Project documentation
├── CONTRIBUTING.md         # This file
└── CODE_OF_CONDUCT.md      # Community guidelines
```

## Architecture Notes

### Backend (Go + Fiber)

- **Bridge Pattern:** The `Bridge` struct in `nats/bridge.go` manages all NATS connections
- **Connection Lifecycle:** Connections are stored in memory with mutex protection for thread safety
- **JetStream Integration:** All stream operations go through the JetStream context
- **Filtering Engine:** Content filters are implemented in `nats/filter.go` with support for multiple filter types

### Frontend (React + Vite + TypeScript)

- **State Management:** Uses Zustand for global state (connections, streams, messages)
- **Component Structure:** Components are organized by feature (streams, messages, connections)
- **API Client:** Centralized API calls in `lib/api.ts` for backend communication
- **WebSocket:** Live subscriptions use WebSocket connections for real-time message streaming
- **Styling:** Uses Tailwind CSS with inline styles for component-specific styling

## Testing Guidelines

When adding new features, please consider:

1. **Unit tests** for business logic (filters, formatting functions)
2. **Integration tests** for API endpoints
3. **Component tests** for React components (if using a test framework)
4. **Manual testing** against a real NATS server

Example test structure for filters:
```go
func TestContentFilter(t *testing.T) {
    tests := []struct {
        name     string
        data     []byte
        filter   *models.ContentFilter
        expected bool
    }{
        // Add test cases
    }
    // Test implementation
}
```

## Performance Considerations

- **Stream listing:** Currently enforces a 5-second timeout to prevent hanging on slow connections
- **Message fetching:** Limits to 500 messages maximum per request
- **WebSocket:** Uses buffered channels (size 256) for live message streaming
- **Filtering:** Content filters are applied client-side after fetching from NATS

## Getting Help

- **Issues:** Check existing issues or create a new one for bugs/questions
- **Discussions:** Use GitHub Discussions for general questions
- **NATS Community:** Visit [NATS.io](https://nats.io) for NATS-specific questions

## License

By contributing to NATS UI, you agree that your contributions will be licensed under its MIT License.

## Recognition

Contributors will be recognized in the project's README and release notes.

---

Thank you for contributing to NATS UI! 🚀
