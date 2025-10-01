import type { INodeProperties, NodeConnectionType } from 'n8n-workflow';

export function getConnectionHintNoticeField(targets?: NodeConnectionType[]): INodeProperties {
	// targets parameter reserved for future use
	void targets;
	return {
		displayName: 'DOKU MCP Client',
		name: 'connectionHint',
		type: 'notice',
		default: '',
		description: 'DOKU MCP Client: exposes tools to downstream AI nodes',
	};
}
