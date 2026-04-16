export type McpToolIncludeMode = 'all' | 'selected' | 'except';

export type McpTool = {
	name: string;
	description?: string;
	inputSchema: Record<string, unknown>;
};

export type McpServerTransport = 'sse' | 'httpStreamable';
