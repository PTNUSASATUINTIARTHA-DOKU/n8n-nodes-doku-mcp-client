import { DynamicStructuredTool, type DynamicStructuredToolInput } from '@langchain/core/tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CompatibilityCallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { createResultError, createResultOk, type IDataObject, type Result } from 'n8n-workflow';

import type { McpServerTransport, McpTool, McpToolIncludeMode } from './types';

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
		onError: (error: string) => void,
		getAbortSignal?: () => AbortSignal | undefined,
	) =>
	async (args: IDataObject) => {
		const signal = getAbortSignal?.();
		if (signal?.aborted) {
			return 'Execution was cancelled';
		}

		let result: Awaited<ReturnType<Client['callTool']>>;

		function handleError(error: unknown) {
			const errorDescription =
				getErrorDescriptionFromToolCall(error) ?? `Failed to execute tool "${name}"`;
			onError(errorDescription);
			return errorDescription;
		}

		try {
			result = await client.callTool(
				{ name, arguments: args },
				CompatibilityCallToolResultSchema,
				{ timeout, signal: getAbortSignal?.() },
			);
		} catch (error) {
			if (getAbortSignal?.()?.aborted) {
				return 'Execution was cancelled';
			}
			return handleError(error);
		}

		if (result.isError) {
			return handleError(result);
		}

		if (result.toolResult !== undefined) return result.toolResult;
		if (result.content !== undefined) return result.content;
		return result;
	};

const MAX_MCP_TOOL_NAME_LENGTH = 64;

export function buildMcpToolName(serverName: string, toolName: string): string {
	const sanitizedServerName = serverName.replace(/[^a-zA-Z0-9]/g, '_');
	const fullName = `${sanitizedServerName}_${toolName}`;
	if (fullName.length <= MAX_MCP_TOOL_NAME_LENGTH) {
		return fullName;
	}
	const maxPrefixLen = MAX_MCP_TOOL_NAME_LENGTH - toolName.length - 1;
	return maxPrefixLen > 0 ? `${sanitizedServerName.slice(0, maxPrefixLen)}_${toolName}` : toolName;
}

export function mcpToolToDynamicTool(
	tool: McpTool,
	onCallTool: DynamicStructuredToolInput['func'],
): DynamicStructuredTool {
	// Pass raw JSON Schema so n8n's normalizeToolSchema converts it using its own
	// zod instance — avoids instanceof mismatches when two zod copies are loaded.
	// Destructure `type` out before spreading so a Python-serialized "None" from
	// the server cannot overwrite our explicit `type: "object"`.
	const { type: _type, ...rest } = (
		tool.inputSchema && typeof tool.inputSchema === 'object' && !Array.isArray(tool.inputSchema)
			? tool.inputSchema
			: {}
	) as Record<string, unknown>;

	const schema: Record<string, unknown> = {
		type: 'object',
		properties: {},
		...rest,
	};

	return new DynamicStructuredTool({
		name: tool.name,
		description: tool.description ?? '',
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		schema: schema as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		func: onCallTool as any,
	});
}

type ConnectMcpClientError =
	| { type: 'invalid_url'; error: Error }
	| { type: 'connection'; error: Error };

function safeCreateUrl(url: string): Result<URL, Error> {
	try {
		return createResultOk(new URL(url));
	} catch (error) {
		return createResultError(error);
	}
}

function normalizeAndValidateUrl(input: string): Result<URL, Error> {
	const withProtocol = !/^https?:\/\//i.test(input) ? `https://${input}` : input;
	return safeCreateUrl(withProtocol);
}

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
}): Promise<Result<Client, ConnectMcpClientError>> {
	const endpoint = normalizeAndValidateUrl(endpointUrl);

	if (!endpoint.ok) {
		return createResultError({ type: 'invalid_url', error: endpoint.error });
	}

	const client = new Client({ name, version: version.toString() }, { capabilities: {} });

	if (serverTransport === 'httpStreamable') {
		try {
			const transport = new StreamableHTTPClientTransport(endpoint.result, {
				requestInit: { headers },
			});
			await client.connect(transport);
			return createResultOk(client);
		} catch (error) {
			return createResultError({ type: 'connection', error: error as Error });
		}
	}

	try {
		const sseTransport = new SSEClientTransport(endpoint.result, {
			eventSourceInit: {
				fetch: async (url, init) =>
					await fetch(url, {
						...init,
						headers: {
							...(init?.headers as Record<string, string>),
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
		return createResultError({ type: 'connection', error: error as Error });
	}
}
