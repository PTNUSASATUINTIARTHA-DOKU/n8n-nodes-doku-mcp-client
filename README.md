# n8n-nodes-doku-mcp-client

Official n8n community node for integrating **DOKU payment services** into your AI-powered workflows via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

Connect your n8n AI Agent to the DOKU MCP Server and let it autonomously create payment links, manage transactions, generate QRIS codes, and more — all through natural language.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

---

## Table of Contents

- [Installation](#installation)
- [Credentials](#credentials)
- [Usage](#usage)
- [Available Tools](#available-tools)
- [Tool Selection](#tool-selection)
- [Compatibility](#compatibility)
- [Resources](#resources)

---

## Installation

Install via the n8n UI (**Settings → Community Nodes → Install**) or directly with npm:

```bash
npm install n8n-nodes-doku-mcp-client
```

For full instructions see the [n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

---

## Credentials

You will need a **DOKU Merchant Account**. Sign up at [doku.com](https://www.doku.com) to get your credentials.

| Field | Description | Example |
|---|---|---|
| **Endpoint URL** | URL of your DOKU MCP Server | `https://mcp.doku.com/mcp` |
| **Server Transport** | Connection protocol | `HTTP Streamable` (recommended) |
| **Client ID** | Your DOKU merchant Client ID | `MCH-0106-XXXXXXXXX` |
| **API Key** | Your DOKU API Key (stored encrypted) | `doku_key_test_...` |

The node handles authentication automatically:
- Encodes your API Key as `Authorization: Basic <base64(apiKey:)>`
- Passes your Client ID via the `Client-Id` header

API keys are generated from the [DOKU Merchant Dashboard](https://dashboard.doku.com).

---

## Usage

### 1. Add the node to an AI Agent workflow

The **DOKU MCP Client Tool** node is a **tool-type node** — it must be connected to an **AI Agent** node via the `Tools` output port.

```
[Chat Trigger] → [AI Agent] ← [DOKU MCP Client Tool]
```

### 2. Configure the credential

Create a new **DOKU MCP Server API** credential with your endpoint URL, Client ID, and API Key.

### 3. Select which tools to expose

Use the **Tools to Include** setting to control what the agent can do:

| Mode | Description |
|---|---|
| **All** | Expose every tool the MCP server provides |
| **Selected** | Expose only the tools you choose |
| **All Except** | Expose everything except the tools you exclude |

### 4. Run your workflow

The AI Agent will automatically discover the available DOKU tools and invoke them when relevant. No additional configuration is required.

---

## Available Tools

The DOKU MCP Server exposes **30 tools** across four categories. Tools are loaded dynamically at runtime — the exact set depends on your server configuration.

### Checkout Payment (2 tools)

| Tool | Description |
|---|---|
| `create_payment_link` | Generate a payment link without pre-filled customer data |
| `create_checkout_link` | Generate a checkout link with customer data specified |

### Direct Payment (18 tools)

| Tool | Description |
|---|---|
| `get_merchant_payment_methods` | Retrieve activated payment methods for your merchant account |
| `generate_payment_virtual_account` | Generate a Virtual Account number for bank transfer |
| `update_payment_virtual_account` | Modify details of an existing Virtual Account |
| `delete_payment_virtual_account` | Close or disable payment of an existing Virtual Account |
| `generate_payment_qris` | Generate a QRIS code for direct payments |
| `generate_payment_card_auth` | Perform 3D Secure (3DS) authentication for credit/debit cards |
| `generate_payment_card_capture` | Capture a previously authorized card transaction |
| `generate_payment_card_charge` | Charge a card transaction after successful 3DS authentication |
| `generate_payment_ovo_auth` | Authenticate an OVO account before payment |
| `generate_payment_ovo` | Generate an OVO e-Wallet payment using authCode |
| `generate_payment_doku_ewallet_auth` | Authenticate or bind a DOKU e-Wallet account before payment |
| `generate_payment_doku_ewallet` | Charge a DOKU e-Wallet account after successful authentication |
| `generate_payment_dana` | Generate a DANA e-Wallet payment |
| `generate_payment_shopeepay` | Generate a ShopeePay e-Wallet payment |
| `generate_payment_akulaku` | Generate an Akulaku PayLater or installment transaction |
| `generate_payment_kredivo` | Generate a Kredivo PayLater or installment transaction |
| `generate_payment_alfagroup` | Generate a payment code for cash payments at Alfamart/Alfamidi |
| `generate_payment_indomaret` | Generate a payment code for cash payments at Indomaret |

### Transaction Utility (3 tools)

| Tool | Description |
|---|---|
| `get_transaction_by_invoice_number` | Retrieve transaction details using an invoice number |
| `get_transaction_by_customer_name` | Retrieve transaction details using a customer name |
| `get_transaction_by_date_range` | Retrieve transactions within a specified date range |

### Customer Management (7 tools)

| Tool | Description |
|---|---|
| `add_customer` | Create a new customer with name, email, and phone |
| `update_customer` | Update existing customer details (e.g. phone, email) |
| `delete_customer` | Remove a customer from your records |
| `get_customer_by_id` | Retrieve customer details using their unique customer ID |
| `get_customer_by_name` | Retrieve customer details using full or partial name |
| `get_customer_by_email` | Retrieve customer details using a registered email address |
| `get_all_customers` | Retrieve all customers linked to your merchant account |

---

## Tool Selection

When using **Selected** or **All Except** modes, tool names are loaded dynamically from the MCP Server. Click **Refresh** in the dropdown to reload the list whenever your server's tool set changes.

---

## Compatibility

| Requirement | Version |
|---|---|
| n8n | ≥ 1.82.0 |
| Node.js | ≥ 18.x (20.x recommended) |
| MCP SDK | ≥ 1.25.x |
| Tested with n8n | 1.97.1 |

---

## Resources

- [DOKU MCP Server Documentation](https://developers.doku.com/accept-payments/doku-mcp-server)
- [DOKU Developer Portal](https://developers.doku.com/)
- [n8n Community Nodes Documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [npm package](https://www.npmjs.com/package/n8n-nodes-doku-mcp-client)
