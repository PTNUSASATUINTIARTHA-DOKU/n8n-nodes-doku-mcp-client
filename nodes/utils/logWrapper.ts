import type { ISupplyDataFunctions } from 'n8n-workflow';

// Wrap a dynamic tool so we log before/after execution.
export function logWrapper<T extends { name: string; func?: (...args: any[]) => any }>(
	tool: T,
	ctx?: Pick<ISupplyDataFunctions, 'logger'>,
): T {
	const original = (tool as any).func;
	if (typeof original !== 'function') return tool;
	(tool as any).func = async (...args: any[]) => {
		try {
			ctx?.logger?.debug?.(`MCP tool ${tool.name} start`);
			const res = await original(...args);
			ctx?.logger?.debug?.(`MCP tool ${tool.name} end`);
			return res;
		} catch (error) {
			ctx?.logger?.error?.(`MCP tool ${tool.name} error`, { error });
			throw error;
		}
	};
	return tool;
}
