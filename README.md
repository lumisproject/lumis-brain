# lumisproject/lumis-brain

## Introduction

The `lumis-brain` repository provides an advanced backend for integrating AI-powered features into applications. It is designed to facilitate natural language processing, agent orchestration, and robust API handling for tasks such as chat, tool invocation, search, and memory management. The project supports direct communication with various AI models and provides a foundation for extending capabilities via plugins and modular agents.

## Features

- Modular agent system for handling user queries, tools, and plugins.
- Integration with multiple AI providers, including OpenAI and Google.
- Structured memory management supporting both chat and search.
- Support for tool invocation, including web search, code execution, and more.
- API endpoints for chat interaction, agent management, memory operations, and plugin orchestration.
- Environment-based configuration for flexible deployments.
- Robust error handling and logging for API requests.

## Requirements

- Node.js (version as specified in package.json)
- npm/yarn for dependency management
- Access to environment variables for AI provider keys and configurations
- (Optional) Docker for containerized deployment

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/lumisproject/lumis-brain.git
   cd lumis-brain
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   or
   ```bash
   yarn install
   ```

3. **Set up environment variables:**
   - Copy the `.env.example` to `.env` and fill in the required fields.
   - Required keys include AI provider API keys and other configuration variables.

## Usage

Run the service in development or production mode:

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm run build
npm start
```

The server runs and exposes various REST API endpoints for chat, memory, agent, and plugin operations.

### Example: Interacting with the Chat API

Send a POST request to `/api/chat` with a message and optional parameters to receive an AI-generated response.

## Configuration

All configuration is handled via environment variables. Common options include:

- AI provider keys (OpenAI, Google, etc.)
- Model selection parameters
- Plugin and tool enable/disable flags
- Memory storage options

Update the `.env` file to tailor the system’s behavior to your deployment needs.

## Contributing

Contributions are welcome! Please follow these steps:

- Fork the repository and create a new branch for your changes.
- Adhere to the established coding style and add tests where appropriate.
- Submit a pull request describing your changes and their purpose.
- Ensure your code passes all existing tests and includes new cases if applicable.

---

For further documentation on code structure, API endpoints, and advanced configuration, please refer to the inline code comments and the `/docs` directory if present.