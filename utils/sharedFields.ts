import type { INodeProperties } from 'n8n-workflow';

export function getConnectionHintNoticeField(): INodeProperties {
	return {
		displayName: '',
		name: 'notice',
		type: 'notice',
		default: '',
	};
}