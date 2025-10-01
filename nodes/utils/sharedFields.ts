import type { INodeProperties, NodeConnectionType } from 'n8n-workflow';

export function getConnectionHintNoticeField(_targets?: NodeConnectionType[]): INodeProperties {
	return {
		displayName: 'Info',
		name: 'connectionHint',
		type: 'notice',
		default: '',
		description: 'MCP Client: exposes tools to downstream AI nodes.',
	};
}
