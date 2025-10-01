# n8n-nodes-doku-mcp-client

This is an n8n community node that lets you integrate DOKU payment services into your n8n workflows through the DOKU MCP (Model Context Protocol) Server.

DOKU MCP Server provides a comprehensive set of payment-related tools and functionalities, enabling you to create payment links, manage transactions, handle customer data, and more - all within your AI-powered n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)
[Operations](#operations)
[Credentials](#credentials)
[Compatibility](#compatibility)
[Usage](#usage)
[Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

### Quick Install

```bash
npm install n8n-nodes-doku-mcp-client
```

## Operations

The DOKU MCP Client Tool node connects to the DOKU MCP Server and provides access to 17+ payment-related tools, including:

- **Payment Link Generation** - Create payment links for customers
- **Checkout Link Creation** - Generate checkout pages with multiple payment methods
- **Transaction Reporting** - Track and retrieve transaction details
- **Customer Management** - Manage customer data and profiles
- **Virtual Account Management** - Create and manage virtual account numbers
- **QRIS Code Generation** - Generate QR codes for QRIS payments
- And more...

The specific tools available depend on your DOKU MCP Server configuration and will be dynamically loaded when the node connects to the server.

## Credentials

To use this node, you need:

1. **DOKU Merchant Account** - Sign up at [DOKU](https://doku.com) to become a merchant
2. **API Credentials** - Generate your API keys from the DOKU merchant dashboard:
   - Client ID (e.g., `BRN-...`)
   - API Key (e.g., `doku_key_test_...`)

### Setting up Authentication

Authentication is built directly into the node. Simply provide:
- **Client ID**: Your DOKU Client ID
- **API Key**: Your DOKU API Key (will be securely encrypted)

The node automatically handles the authentication by:
- Base64-encoding your API key
- Setting the `Authorization: Basic {encoded_key}` header
- Including the `Client-Id` header with your Client ID

## Compatibility

- **Minimum n8n version**: 1.0.0
- **Node.js version**: 18.x or higher (20.x recommended)
- **Tested with**: n8n 1.97.1

## Usage

### Basic Setup

1. Add the **DOKU MCP Client Tool** node to your workflow
2. Configure the connection:
   - **Endpoint**: Enter your DOKU MCP Server endpoint (e.g., `https://mcp.doku.com/sse`)
   - **Server Transport**: Choose between "HTTP Streamable" (recommended) or "Server Sent Events (Deprecated)"
   - **Client ID**: Enter your DOKU Client ID
   - **API Key**: Enter your DOKU API Key (will be masked for security)

3. Connect the node to an **AI Agent** node in n8n
4. The agent will automatically have access to all DOKU payment tools

### Example Configuration

```
Endpoint: https://mcp.doku.com/sse
Server Transport: HTTP Streamable
Client ID: MCH-0106-7015945058936
API Key: doku_key_test_xxxxxxxxxxxxxxxxx
```

### Example Workflow

You can use this node in an AI Agent workflow to:
- Process customer payment requests
- Generate payment links dynamically
- Check transaction status
- Create QRIS codes for mobile payments
- Manage virtual accounts

The AI Agent can intelligently use the appropriate DOKU tool based on the conversation context and user intent.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [DOKU MCP Server Documentation](https://developers.doku.com/accept-payments/doku-mcp-server)
- [DOKU Developer Portal](https://developers.doku.com/)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
