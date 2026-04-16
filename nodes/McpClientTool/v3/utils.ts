import { DynamicStructuredTool, type DynamicStructuredToolInput } from '@langchain/core/tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import {
	createResultError,
	createResultOk,
	type IDataObject,
	type Logger,
	type Result,
} from 'n8n-workflow';

import type {
	McpServerTransport,
	McpTool,
	McpToolIncludeMode,
} from './types';

export async function getAllTools(client: Client, cursor?: string): Promise<McpTool[]> {
	const { tools, nextCursor } = await client.listTools({ cursor });

	if (nextCursor) {
		return (tools as McpTool[]).concat(await getAllTools(client, nextCursor));
	}

	return tools as McpTool[];
}

export function getSelectedTools({
	mode,
	includeTools,
	excludeTools,
	tools,
}: {
	mode: McpToolIncludeMode;
	includeTools?: string[];
	excludeTools?: string[];
	tools: McpTool[];
}) {
	switch (mode) {
		case 'selected': {
			if (!includeTools?.length) return tools;
			const include = new Set(includeTools);
			return tools.filter((tool) => include.has(tool.name));
		}
		case 'except': {
			const except = new Set(excludeTools ?? []);
			return tools.filter((tool) => !except.has(tool.name));
		}
		case 'all':
		default:
			return tools;
	}
}

export const getErrorDescriptionFromToolCall = (result: unknown): string | undefined => {
	if (result && typeof result === 'object') {
		if ('content' in result && Array.isArray(result.content)) {
			const errorMessage = (result.content as Array<{ type: 'text'; text: string }>).find(
				(content) => content && typeof content === 'object' && typeof content.text === 'string',
			)?.text;
			return errorMessage;
		} else if ('toolResult' in result && typeof result.toolResult === 'string') {
			return result.toolResult;
		}
		if ('message' in result && typeof result.message === 'string') {
			return result.message;
		}
	}

	return undefined;
};

export const createCallTool =
	(
		name: string,
		client: Client,
		timeout: number,
		maxRetries: number = 2,
		backoffMultiplier: number = 1.5,
		onError: (error: string) => void,
		logger?: Logger,
	) =>
	async (args: IDataObject) => {
		let lastError: unknown;

		function handleError(error: unknown) {
			const errorDescription =
				getErrorDescriptionFromToolCall(error) ?? `Failed to execute tool "${name}"`;
			logger?.error?.(`DOKU MCP Server Error: Tool "${name}" failed`, { error, args });
			onError(errorDescription);
			return errorDescription;
		}

		logger?.info?.(`DOKU MCP Server Request: Calling tool "${name}"`, { tool: name, arguments: args });

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			let result: Awaited<ReturnType<Client['callTool']>>;

			try {
				result = await client.callTool({ name, arguments: args }, CompatibilityCallToolResultSchema, {
					timeout,
				});
			} catch (error) {
				lastError = error;
				if (attempt < maxRetries) {
					const delay = Math.pow(backoffMultiplier, attempt) * 1000;
					logger?.warn?.(`Tool "${name}" attempt ${attempt + 1} threw error, retrying in ${delay}ms...`);
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}
				return handleError(error);
			}

			if (result.isError) {
				lastError = result;
				if (attempt < maxRetries) {
					const delay = Math.pow(backoffMultiplier, attempt) * 1000;
					logger?.warn?.(`Tool "${name}" attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}
				return handleError(lastError);
			}

			logger?.info?.(`DOKU MCP Server Response: Tool "${name}" succeeded`, { tool: name });

			if (result.toolResult !== undefined) return result.toolResult;
			if (result.content !== undefined) return result.content;
			return result;
		}

		return handleError(lastError);
	};

export function mcpToolToDynamicTool(
	tool: McpTool,
	onCallTool: DynamicStructuredToolInput['func'],
): DynamicStructuredTool {
	if (!tool || !tool.name) {
		throw new Error('Invalid MCP tool: missing name');
	}

	// Ensure tool name is valid (no special characters that could confuse LLM)
	const toolName = tool.name.trim();
	if (!toolName) {
		throw new Error('Invalid MCP tool: empty name');
	}

	// Ensure tool has a meaningful description
	const description = tool.description?.trim() || `Execute ${toolName} tool`;

	// Pass the raw MCP inputSchema (plain JSON object) directly.
	// n8n's normalizeToolSchema will convert it to Zod using its own zod instance,
	// which avoids instanceof failures caused by two different zod module instances
	// being loaded side-by-side (our package vs n8n's package).
	// MCP spec mandates inputSchema is always type "object"; default to empty object
	// if the server omits the type or returns nothing.
	const schema: Record<string, unknown> =
		tool.inputSchema &&
		typeof tool.inputSchema === 'object' &&
		!Array.isArray(tool.inputSchema)
			? { type: 'object', properties: {}, ...(tool.inputSchema as Record<string, unknown>) }
			: { type: 'object', properties: {} };

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new DynamicStructuredTool({
		name: toolName,
		description,
		schema: schema as any,
		func: onCallTool as any,
	});
}

type ConnectMcpClientError =
	| { type: 'invalid_url'; error: Error }
	| { type: 'connection'; error: Error };

function safeCreateUrl(url: string, baseUrl?: string | URL): Result<URL, Error> {
	try {
		return createResultOk(new URL(url, baseUrl));
	} catch (error) {
		return createResultError(error);
	}
}

function normalizeAndValidateUrl(input: string): Result<URL, Error> {
	const withProtocol = !/^https?:\/\//i.test(input) ? `https://${input}` : input;
	const parsedUrl = safeCreateUrl(withProtocol);

	if (!parsedUrl.ok) {
		return createResultError(parsedUrl.error);
	}

	return parsedUrl;
}

/**
 * v3: Enhanced connectMcpClient with MCP v1.2 client capabilities
 */
export async function connectMcpClient({
	headers,
	serverTransport,
	endpointUrl,
	name,
	version,
}: {
	serverTransport: McpServerTransport;
	endpointUrl: string;
	headers?: Record<string, string>;
	name: string;
	version: number;
	clientCapabilities?: Record<string, unknown>;
}): Promise<Result<Client, ConnectMcpClientError>> {
	const endpoint = normalizeAndValidateUrl(endpointUrl);

	if (!endpoint.ok) {
		return createResultError({ type: 'invalid_url', error: endpoint.error });
	}

	// v1.2+: Enhanced client initialization (MCP SDK 1.25+)
	const client = new Client(
		{ name, version: version.toString() },
		{ capabilities: {} }
	);

	if (serverTransport === 'httpStreamable') {
		try {
			const transport = new StreamableHTTPClientTransport(endpoint.result, {
				requestInit: { headers },
			});
			await client.connect(transport);
			return createResultOk(client);
		} catch (error) {
			return createResultError({ type: 'connection', error });
		}
	}

	try {
		const sseTransport = new SSEClientTransport(endpoint.result, {
			eventSourceInit: {
				fetch: async (url, init) =>
					await fetch(url, {
						...init,
						headers: {
							...headers,
							Accept: 'text/event-stream',
						},
					}),
			},
			requestInit: { headers },
		});
		await client.connect(sseTransport);
		return createResultOk(client);
	} catch (error) {
		return createResultError({ type: 'connection', error });
	}
}
