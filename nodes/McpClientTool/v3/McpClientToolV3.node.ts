import type {
	INodeTypeBaseDescription,
	INodeType,
	INodeTypeDescription,
	ISupplyDataFunctions,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { logWrapper } from '../../utils/logWrapper';
import { getConnectionHintNoticeField } from '../../utils/sharedFields';

import { getTools } from './loadOptions';
import type { McpServerTransport, McpToolIncludeMode } from './types';
import {
	connectMcpClient,
	createCallTool,
	getAllTools,
	getSelectedTools,
	mcpToolToDynamicTool,
} from './utils';

export class McpClientToolV3 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 3,
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
					description: 'How to select the tools you want to be exposed to the AI Agent. Important: Most LLMs can handle up to 16 tools maximum. For best performance, use 5-10 focused tools via "Selected" mode.',
					default: 'selected',
					options: [
						{
							name: 'All',
							value: 'all',
							description: 'Include all tools from server (not recommended if server has 17+ tools)',
						},
						{
							name: 'Selected',
							value: 'selected',
							description: 'Include only specific tools (recommended - best AI Agent performance)',
						},
						{
							name: 'All Except',
							value: 'except',
							description: 'Include all except specific tools (useful to stay under 17 tool limit)',
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
							description: 'Maximum time in milliseconds to wait for tool execution',
							typeOptions: {
								minValue: 1000,
								maxValue: 300000,
							},
						},
						{
							displayName: 'Max Retries',
							name: 'maxRetries',
							type: 'number',
							default: 2,
							description: 'Maximum number of retry attempts for failed tool calls (MCP v1.2)',
							typeOptions: {
								minValue: 0,
								maxValue: 5,
							},
						},
						{
							displayName: 'Retry Backoff Multiplier',
							name: 'backoffMultiplier',
							type: 'number',
							default: 1.5,
							description: 'Multiplier for exponential backoff between retries (MCP v1.2)',
							typeOptions: {
								minValue: 1.0,
								maxValue: 3.0,
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
		const maxRetries = this.getNodeParameter('options.maxRetries', itemIndex, 2) as number;
		const backoffMultiplier = this.getNodeParameter('options.backoffMultiplier', itemIndex, 1.5) as number;

		// Get credentials
		const credentials = await this.getCredentials('dokuMcpServerApi', itemIndex);
		const serverTransport = credentials.serverTransport as McpServerTransport;
		const endpointUrl = credentials.endpointUrl as string;
		const clientId = credentials.clientId as string;
		const apiKey = credentials.apiKey as string;

		const domain = new URL(endpointUrl).hostname;
		if (domain.includes('{') && domain.includes('}')) {
			throw new NodeOperationError(
				this.getNode(),
				"Can't use a placeholder for the domain when using authentication",
				{
					itemIndex,
					description:
						'This is for security reasons, to prevent the model accidentally sending your credentials to an unauthorized domain',
				},
			);
		}

		// Create Basic Auth header with API Key and Client-Id header
		const base64ApiKey = Buffer.from(`${apiKey}:`).toString('base64');
		const headers = {
			'Authorization': `Basic ${base64ApiKey}`,
			'Client-Id': clientId,
		};

		// v3: Enhanced client connection with MCP v1.2+ (SDK 1.25+)
		const client = await connectMcpClient({
			serverTransport,
			endpointUrl,
			headers,
			name: node.type,
			version: node.typeVersion,
		});

		const setError = (message: string, description?: string): SupplyData => {
			const error = new NodeOperationError(node, message, { itemIndex, description });
			this.addOutputData(NodeConnectionTypes.AiTool, itemIndex, error);
			throw error;
		};

		if (!client.ok) {
			this.logger.error('McpClientTool v3: Failed to connect to MCP Server', {
				error: client.error,
			});

			switch (client.error.type) {
				case 'invalid_url':
					return setError('Could not connect to your MCP server. The provided URL is invalid.');
				case 'connection':
				default:
					return setError('Could not connect to your MCP server');
			}
		}

		this.logger.debug('McpClientTool v3: Successfully connected to MCP Server');

		const mode = this.getNodeParameter('include', itemIndex) as McpToolIncludeMode;
		const includeTools = this.getNodeParameter('includeTools', itemIndex, []) as string[];
		const excludeTools = this.getNodeParameter('excludeTools', itemIndex, []) as string[];

		this.logger.debug(`Tool selection mode: ${mode}`);

		const allTools = await getAllTools(client.result);
		this.logger.debug(`Retrieved ${allTools.length} tools from MCP Server`);

		const mcpTools = getSelectedTools({
			tools: allTools,
			mode,
			includeTools,
			excludeTools,
		});

		this.logger.debug(`Selected ${mcpTools.length} tools after filtering`);

		// Warn if too many tools are being exposed
		if (mcpTools.length >= 17) {
			this.logger.warn(
				`⚠️  ${mcpTools.length} tools are being exposed to the AI Agent. ` +
				`This exceeds the recommended limit and may cause the AI Agent to fail. ` +
				`Most LLMs can only handle up to 16 tools effectively. ` +
				`Please use "Selected" or "All Except" mode to reduce the tool count.`,
			);
		} else if (mcpTools.length > 12) {
			this.logger.warn(
				`⚠️  ${mcpTools.length} tools are being exposed to the AI Agent. ` +
				`While this may work, AI Agents perform best with 5-10 focused tools. ` +
				`Consider using "Selected" mode for optimal reliability.`,
			);
		}

		if (!mcpTools.length) {
			return setError(
				'MCP Server returned no tools',
				'Connected successfully to your MCP server but it returned an empty list of tools.',
			);
		}

		const tools = mcpTools.map((tool) =>
			logWrapper(
				mcpToolToDynamicTool(
					tool,
					createCallTool(
						tool.name,
						client.result,
						timeout,
						maxRetries,
						backoffMultiplier,
						(errorMessage) => {
							this.logger.error(`McpClientTool: Tool execution failed — ${errorMessage}`);
						},
						this.logger,
					),
				),
				this,
			),
		);

		this.logger.info(`McpClientTool: Connected to MCP Server with ${tools.length} tools`);

		return { response: tools, closeFunction: async () => await client.result.close() };
	}
}
