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
   - Client ID
   - API Key (Secret Key)

### Setting up Authentication

This node supports multiple authentication methods through n8n's credential system:

1. **Header Auth** (Recommended for DOKU MCP Server)
   - Header Name: `Authorization`
   - Header Value: `Basic {base64_encoded_credentials}`
   - Also set `Client-Id` header with your DOKU Client ID

2. **Basic Auth** - Use your DOKU API credentials directly

3. **Bearer Token** - If using token-based authentication

4. **Custom Auth (JSON)** - For advanced authentication scenarios

### Encoding API Keys

DOKU MCP Server requires base64-encoded credentials:

```bash
# Encode your API key (note the colon at the end)
echo -n "your-api-key:" | base64
```

## Compatibility

- **Minimum n8n version**: 1.0.0
- **Node.js version**: 18.x or higher (20.x recommended)
- **Tested with**: n8n 1.97.1

## Usage

### Basic Setup

1. Add the **DOKU MCP Client Tool** node to your workflow
2. Configure the connection:
   - **Endpoint**: Enter your DOKU MCP Server endpoint (e.g., `https://mcp.doku.com/sse`)
   - **Server Transport**: Choose between SSE or HTTP Streamable
   - **Authentication**: Select your authentication method
   - **Credential Type**: Choose the appropriate credential type
   - **Credential**: Select or create your DOKU credentials

3. Connect the node to an **AI Agent** node in n8n
4. The agent will automatically have access to all DOKU payment tools

### Example Configuration

**Endpoint**: `https://mcp.doku.com/sse`
**Server Transport**: Server Sent Events
**Authentication**: Generic Credential Type
**Credential Type**: Header Auth

Configure your credentials with:
- `Authorization` header: `Basic {your_base64_encoded_api_key}`
- `Client-Id` header: `{your_doku_client_id}`

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
