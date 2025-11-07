import type {
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class DokuMcpServerApi implements ICredentialType {
	name = 'dokuMcpServerApi';

	displayName = 'DOKU MCP Server API';

	documentationUrl = 'https://docs.doku.com/mcp';

	properties: INodeProperties[] = [
		{
			displayName: 'Endpoint',
			name: 'endpointUrl',
			type: 'string',
			description: 'DOKU MCP server endpoint URL',
			placeholder: 'e.g. https://mcp.doku.com/sse',
			default: '',
			required: true,
		},
		{
			displayName: 'Server Transport',
			name: 'serverTransport',
			type: 'options',
			options: [
				{
					name: 'Server Sent Events (Deprecated)',
					value: 'sse',
				},
				{
					name: 'HTTP Streamable',
					value: 'httpStreamable',
				},
			],
			default: 'httpStreamable',
			description: 'The transport protocol used by your MCP endpoint',
		},
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'BRN-...',
			description: 'Your DOKU Client ID',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
			placeholder: 'doku_key_test_...',
			description: 'Your DOKU API Key',
		},
	];
}
