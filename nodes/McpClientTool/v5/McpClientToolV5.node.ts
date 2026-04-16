import type {
	IExecuteFunctions,
	INodeExecutionData,
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
	connectMcpClient,
	createCallTool,
	getAllTools,
	getSelectedTools,
	mcpToolToDynamicTool,
	resolveOriginalToolName,
} from './utils';

// Lazily resolves to n8n's own Toolkit class so `instanceof` passes in getConnectedTools.
//
// The problem: our community node resolves @langchain/classic/agents to its own local
// node_modules copy (a different JS object), so `new OurToolkit() instanceof n8nToolkit`
// is always false. Without passing that check, getConnectedTools sets isFromToolkit=false
// on every tool, causing createEngineRequests to omit `tool` from item.json, and
// execute() never learns which tool to call → the agent loops until maxIterations.
//
// The fix: n8n loads @langchain/classic/agents before any workflow runs. Its module is
// cached in require.cache under an absolute path. We search the cache for the entry
// that contains a Toolkit export — this gives us n8n's exact Toolkit class, and
// `instanceof` passes correctly.
//
// Lazy (called from supplyData) rather than module-level so the search always runs
// AFTER n8n has finished loading its own packages and the cache is fully populated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMcpToolkitClass(): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let N8nToolkit: any = null;
	for (const key of Object.keys(require.cache as Record<string, unknown>)) {
		if (key.includes('@langchain/classic') && (key.includes('agents.js') || key.includes('agents/index'))) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const mod = (require.cache as Record<string, any>)[key];
			if (mod?.exports?.Toolkit) {
				N8nToolkit = mod.exports.Toolkit;
				break;
			}
		}
	}
	if (!N8nToolkit) return null;
	return class McpToolkit extends N8nToolkit {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		constructor(public tools: any[]) {
			super();
		}
	};
}

// Module-level helper — does NOT use `this` so it works from both execute()
// and supplyData() regardless of how n8n rebinds `this`.
async function getDokuHeaders(
	ctx: ISupplyDataFunctions | IExecuteFunctions,
	itemIndex: number,
): Promise<{ headers: Record<string, string>; endpointUrl: string; serverTransport: McpServerTransport }> {
	const credentials = await ctx.getCredentials('dokuMcpServerApi', itemIndex);
	const serverTransport = credentials.serverTransport as McpServerTransport;
	const endpointUrl = credentials.endpointUrl as string;
	const clientId = credentials.clientId as string;
	const apiKey = credentials.apiKey as string;

	const base64ApiKey = Buffer.from(`${apiKey}:`).toString('base64');
	const headers = {
		Authorization: `Basic ${base64ApiKey}`,
		'Client-Id': clientId,
	};

	return { headers, endpointUrl, serverTransport };
}

// Module-level helper — connect to MCP and return selected tools + helpers.
// Must be a free function so execute() can call it without a class instance.
async function connectAndGetTools(
	ctx: ISupplyDataFunctions | IExecuteFunctions,
	itemIndex: number,
): Promise<{
	tools: McpTool[];
	closeClient: () => Promise<void>;
	callTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}> {
	const node = ctx.getNode();
	const timeout =
		((ctx as ISupplyDataFunctions).getNodeParameter?.('options.timeout', itemIndex, 60000) as number) ??
		60000;

	const { headers, endpointUrl, serverTransport } = await getDokuHeaders(ctx, itemIndex);

	const client = await connectMcpClient({
		serverTransport,
		endpointUrl,
		headers,
		name: node.type,
		version: node.typeVersion,
	});

	if (!client.ok) {
		switch (client.error.type) {
			case 'invalid_url':
				throw new NodeOperationError(
					node,
					'Could not connect to your MCP server. The provided URL is invalid.',
					{ itemIndex },
				);
			case 'connection':
			default:
				throw new NodeOperationError(node, 'Could not connect to your MCP server', { itemIndex });
		}
	}

	const mode =
		((ctx as ISupplyDataFunctions).getNodeParameter?.('include', itemIndex, 'all') as McpToolIncludeMode) ??
		'all';
	const includeTools =
		((ctx as ISupplyDataFunctions).getNodeParameter?.('includeTools', itemIndex, []) as string[]) ?? [];
	const excludeTools =
		((ctx as ISupplyDataFunctions).getNodeParameter?.('excludeTools', itemIndex, []) as string[]) ?? [];

	let allTools: McpTool[];
	try {
		allTools = await getAllTools(client.result);
	} catch (error) {
		await client.result.close();
		throw error;
	}

	const selectedTools = getSelectedTools({ tools: allTools, mode, includeTools, excludeTools });

	const callToolFn = async (toolName: string, args: Record<string, unknown>) => {
		const call = createCallTool(
			toolName,
			client.result,
			timeout,
			(errorMessage) => {
				ctx.logger.error(`McpClientTool: Tool "${toolName}" failed — ${errorMessage}`);
			},
		);
		return await call(args as import('n8n-workflow').IDataObject);
	};

	return {
		tools: selectedTools,
		closeClient: async () => await client.result.close(),
		callTool: callToolFn,
	};
}

// eslint-disable-next-line @n8n/community-nodes/icon-validation
export class McpClientToolV5 implements INodeType {
	description: INodeTypeDescription;

	constructor(baseDescription: INodeTypeBaseDescription) {
		this.description = {
			...baseDescription,
			version: 5,
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

	// execute() is called by AI Agent ToolsAgent V3 when it dispatches tool calls
	// directly to connected tool nodes. Each input item has:
	//   item.json.tool      — the original MCP tool name (e.g. "create_checkout")
	//   item.json.toolInput — the arguments object
	//
	// IMPORTANT: n8n rebinds `this` to its own ExecuteContext when calling execute(),
	// so class instance methods are NOT available. Use only module-level helpers.
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const node = this.getNode();
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const item = items[i];

			// Log the full item.json so we can see exactly what n8n sends
			this.logger.debug(
				`McpClientTool execute() item[${i}].json = ${JSON.stringify(item.json)}`,
			);

			// item.json.tool is the MCP tool name the LLM invoked (e.g. "create_checkout")
			const prefixedToolName = item.json.tool as string | undefined;

			// n8n's ToolsAgent may put args in different places depending on version:
			//   - item.json.toolInput  (object or JSON string) — most common
			//   - item.json.input      (some older versions)
			//   - item.json.query      (simple/react agents)
			//   - top-level fields in item.json (minus "tool")
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let toolInput: Record<string, any>;

			const parseIfString = (val: unknown): Record<string, unknown> => {
				if (typeof val === 'string') {
					try {
						const parsed = JSON.parse(val);
						if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
					} catch {
						// invalid JSON — fall through to object/empty handling
					}
				}
				if (val && typeof val === 'object' && !Array.isArray(val)) {
					return val as Record<string, unknown>;
				}
				return {};
			};

			if (item.json.toolInput !== undefined && item.json.toolInput !== null) {
				toolInput = parseIfString(item.json.toolInput);
			} else if (item.json.input !== undefined && item.json.input !== null) {
				toolInput = parseIfString(item.json.input);
			} else if (item.json.query !== undefined && item.json.query !== null) {
				toolInput = parseIfString(item.json.query);
			} else {
				// Last resort: everything in item.json except "tool" itself
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { tool: _ignored, ...rest } = item.json;
				toolInput = rest as Record<string, unknown>;
			}

			this.logger.debug(
				`McpClientTool execute() resolved toolInput = ${JSON.stringify(toolInput)}`,
			);

			if (!prefixedToolName) {
				returnData.push({ json: { error: 'No tool name provided in item.json.tool' }, pairedItem: { item: i } });
				continue;
			}

			try {
				const { tools, callTool, closeClient } = await connectAndGetTools(this, i);
				let response: unknown;
				try {
					// Resolve from prefixed LLM name → original MCP tool name before calling the server
					const originalName = resolveOriginalToolName(node.name, prefixedToolName, tools);
					response = await callTool(originalName, toolInput);
				} finally {
					await closeClient();
				}
				returnData.push({
					json: { response: response as import('n8n-workflow').IDataObject },
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message ?? String(error) }, pairedItem: { item: i } });
				} else {
					throw error;
				}
			}
		}

		return [returnData];
	}

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const node = this.getNode();
		const timeout = this.getNodeParameter('options.timeout', itemIndex, 60000) as number;

		const setError = (message: string, description?: string): never => {
			throw new NodeOperationError(node, message, { itemIndex, description });
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
				return logWrapper(
					mcpToolToDynamicTool(
						tool,
						createCallTool(
							tool.name,
							client.result,
							timeout,
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

			// Wrap in a Toolkit subclass so n8n's getConnectedTools instanceof check passes.
			// When it passes, getConnectedTools sets isFromToolkit=true on every tool, which
			// causes ToolsAgent V3's createEngineRequests to include { tool: toolName } in
			// item.json. Without this, item.json.tool is undefined in execute() and the agent
			// loops forever hitting the maxIterations cap.
			const McpToolkitClass = buildMcpToolkitClass();
			if (McpToolkitClass) {
				this.logger.debug('McpClientTool: Wrapping tools in McpToolkit (isFromToolkit=true path)');
				const toolkit = new McpToolkitClass(tools);
				return { response: toolkit, closeFunction: async () => await client.result.close() };
			}
			this.logger.warn('McpClientTool: Could not find n8n Toolkit class — falling back to plain array (isFromToolkit=false, tool dispatch may not work)');

			return { response: tools, closeFunction: async () => await client.result.close() };
		} catch (error) {
			await client.result.close();
			throw error;
		}
	}
}
