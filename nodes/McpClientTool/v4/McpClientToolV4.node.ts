import type {
	INodeType,
	INodeTypeBaseDescription,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { logWrapper } from '../../utils/logWrapper';
import { getConnectionHintNoticeField } from '../../utils/sharedFields';

import { getTools } from './loadOptions';
import type { McpServerTransport, McpTool, McpToolIncludeMode } from './types';
import {
	buildMcpToolName,
	connectMcpClient,
	createCallTool,
	getAllTools,
	getSelectedTools,
	mcpToolToDynamicTool,
} from './utils';

export class McpClientToolV4 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 4,
			defaults: {},
			inputs: [],
			outputs: [{ type: NodeConnectionTypes.AiTool, displayName: 'Tools' }],
			credentials: [
				{
					name: 'dokuMcpServerApi',
					required: true,
				},
			],
			properties: [
				getConnectionHintNoticeField(),
				{
					displayName: 'Tools to Include',
					name: 'include',
					type: 'options',
					description: 'How to select the tools you want to be exposed to the AI Agent',
					default: 'all',
					options: [
						{
							name: 'All',
							value: 'all',
							description: 'Include all tools from the MCP server',
						},
						{
							name: 'Selected',
							value: 'selected',
							description: 'Include only specific tools',
						},
						{
							name: 'All Except',
							value: 'except',
							description: 'Include all except specific tools',
						},
					],
				},
				{
					displayName: 'Tools to Include',
					name: 'includeTools',
					type: 'multiOptions',
					default: [],
					description:
						'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					typeOptions: {
						loadOptionsMethod: 'getTools',
					},
					displayOptions: {
						show: {
							include: ['selected'],
						},
					},
				},
				{
					displayName: 'Tools to Exclude',
					name: 'excludeTools',
					type: 'multiOptions',
					default: [],
					description:
						'Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					typeOptions: {
						loadOptionsMethod: 'getTools',
					},
					displayOptions: {
						show: {
							include: ['except'],
						},
					},
				},
				{
					displayName: 'Options',
					name: 'options',
					type: 'collection',
					placeholder: 'Add Option',
					default: {},
					options: [
						{
							displayName: 'Timeout',
							name: 'timeout',
							type: 'number',
							default: 60000,
							description: 'Time in ms to wait for tool calls to finish',
							typeOptions: {
								minValue: 1,
							},
						},
					],
				},
			],
		};
	}

	methods = {
		loadOptions: {
			getTools,
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const node = this.getNode();
		const timeout = this.getNodeParameter('options.timeout', itemIndex, 60000) as number;

		const setError = (message: string, description?: string): SupplyData => {
			const error = new NodeOperationError(node, message, { itemIndex, description });
			this.addOutputData(NodeConnectionTypes.AiTool, itemIndex, error);
			throw error;
		};

		// Bail out early if execution was already cancelled
		const signal = this.getExecutionCancelSignal?.();
		if (signal?.aborted) {
			return setError('Execution was cancelled');
		}

		// Build DOKU auth headers
		const credentials = await this.getCredentials('dokuMcpServerApi', itemIndex);
		const serverTransport = credentials.serverTransport as McpServerTransport;
		const endpointUrl = credentials.endpointUrl as string;
		const clientId = credentials.clientId as string;
		const apiKey = credentials.apiKey as string;

		const domain = new URL(endpointUrl).hostname;
		if (domain.includes('{') && domain.includes('}')) {
			return setError(
				"Can't use a placeholder for the domain when using authentication",
				'This is for security reasons, to prevent the model accidentally sending your credentials to an unauthorized domain',
			);
		}

		const base64ApiKey = Buffer.from(`${apiKey}:`).toString('base64');
		const headers = {
			Authorization: `Basic ${base64ApiKey}`,
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
			this.logger.error('McpClientTool: Failed to connect to MCP Server', { error: client.error });
			switch (client.error.type) {
				case 'invalid_url':
					return setError('Could not connect to your MCP server. The provided URL is invalid.');
				case 'connection':
				default:
					return setError('Could not connect to your MCP server');
			}
		}

		this.logger.debug('McpClientTool: Successfully connected to MCP Server');

		const mode = this.getNodeParameter('include', itemIndex) as McpToolIncludeMode;
		const includeTools = this.getNodeParameter('includeTools', itemIndex, []) as string[];
		const excludeTools = this.getNodeParameter('excludeTools', itemIndex, []) as string[];

		let allTools: McpTool[];
		try {
			allTools = await getAllTools(client.result);
		} catch (error) {
			await client.result.close();
			throw error;
		}

		const mcpTools = getSelectedTools({ tools: allTools, mode, includeTools, excludeTools });

		if (!mcpTools.length) {
			await client.result.close();
			return setError(
				'MCP Server returned no tools',
				'Connected successfully to your MCP server but it returned an empty list of tools.',
			);
		}

		try {
			const tools = mcpTools.map((tool) => {
				const prefixedName = buildMcpToolName(node.name, tool.name);
				return logWrapper(
					mcpToolToDynamicTool(
						{ ...tool, name: prefixedName },
						createCallTool(
							tool.name,
							client.result,
							timeout,
							// Log tool errors but do NOT call addOutputData from an async
							// callback — that runs outside n8n's execution context and causes
							// "Skipping execution data push: unable to resolve user for redaction"
							(errorMessage) => {
								this.logger.error(`McpClientTool: Tool "${tool.name}" failed — ${errorMessage}`);
							},
							() => this.getExecutionCancelSignal?.(),
						),
					),
					this,
				);
			});

			this.logger.debug(`McpClientTool: Supplying ${tools.length} tools to AI Agent`);

			return { response: tools, closeFunction: async () => await client.result.close() };
		} catch (error) {
			await client.result.close();
			throw error;
		}
	}
}
