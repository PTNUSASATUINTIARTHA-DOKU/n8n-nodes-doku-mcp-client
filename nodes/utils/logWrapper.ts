import type { DynamicStructuredTool } from '@langchain/core/tools';
import type { ISupplyDataFunctions } from 'n8n-workflow';

// Wrap a dynamic tool so we log before/after execution.
export function logWrapper(
	tool: DynamicStructuredTool,
	ctx?: Pick<ISupplyDataFunctions, 'logger'>,
): DynamicStructuredTool {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const original = (tool as any).func;
	if (typeof original !== 'function') return tool;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(tool as any).func = async (...args: unknown[]) => {
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
