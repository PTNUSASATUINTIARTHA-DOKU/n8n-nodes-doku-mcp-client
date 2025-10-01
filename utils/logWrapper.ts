import type { DynamicStructuredTool } from '@langchain/core/tools';

export function logWrapper(tool: DynamicStructuredTool): DynamicStructuredTool {
	// Wrap tool to add logging
	return tool;
}