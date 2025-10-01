import {
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
	NodeOperationError,
} from 'n8n-workflow';

import type { McpServerTransport } from './types';
import { connectMcpClient, getAllTools } from './utils';

export async function getTools(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const node = this.getNode();
	const serverTransport = this.getNodeParameter('serverTransport') as McpServerTransport;
	const endpointUrl = this.getNodeParameter('endpointUrl') as string;

	// Build DOKU authentication headers
	const clientId = this.getNodeParameter('clientId') as string;
	const apiKey = this.getNodeParameter('apiKey') as string;

	// Create Basic Auth header with API Key and Client-Id header
	const base64ApiKey = Buffer.from(`${apiKey}:`).toString('base64');
	const headers = {
		'Authorization': `Basic ${base64ApiKey}`,
		'Client-Id': clientId,
	};
	const client = await connectMcpClient({
		serverTransport,
		endpointUrl,
		headers,
		name: node.type,
		version: node.typeVersion,
	});

	if (!client.ok) {
		throw new NodeOperationError(this.getNode(), 'Could not connect to your MCP server');
	}

	const tools = await getAllTools(client.result);
	return tools.map((tool) => ({
		name: tool.name,
		value: tool.name,
		description: tool.description,
		inputSchema: tool.inputSchema,
	}));
}
