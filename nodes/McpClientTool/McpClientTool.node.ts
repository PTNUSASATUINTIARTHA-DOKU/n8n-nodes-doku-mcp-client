import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';

import { McpClientToolV2 } from './v2/McpClientToolV2.node';
import { McpClientToolV3 } from './v3/McpClientToolV3.node';
import { McpClientToolV4 } from './v4/McpClientToolV4.node';
import { McpClientToolV5 } from './v5/McpClientToolV5.node';

export class McpClientTool extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'DOKU MCP Client Tool',
			name: 'mcpClientTool',
			icon: {
				light: 'file:doku.svg',
				dark: 'file:doku.svg',
			},
			group: ['output'],
			defaultVersion: 5,
			description: 'Connect tools to DOKU MCP Server',
			codex: {
				categories: ['AI'],
				subcategories: {
					AI: ['Model Context Protocol', 'Tools'],
				},
				alias: ['Model Context Protocol', 'MCP Client'],
				resources: {
					primaryDocumentation: [
						{
							url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolmcp/',
						},
					],
				},
			},
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			2: new McpClientToolV2(baseDescription),
			3: new McpClientToolV3(baseDescription),
			4: new McpClientToolV4(baseDescription),
			5: new McpClientToolV5(baseDescription),
		};

		super(nodeVersions, baseDescription);
	}
}
