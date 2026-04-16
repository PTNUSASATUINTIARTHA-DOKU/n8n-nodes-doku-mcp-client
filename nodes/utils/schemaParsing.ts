import { z } from 'zod';

const VALID_JSON_SCHEMA_TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];

/**
 * Recursively sanitize a raw JSON Schema object so that:
 *  - Any `type` that is not a valid JSON Schema type (e.g. Python-serialized "None")
 *    is replaced with "object" at the root / with "string" inside properties.
 *  - Nested properties and array items are sanitized recursively.
 *
 * This must be called on the raw MCP inputSchema BEFORE passing it to either
 * convertJsonSchemaToZod or DynamicStructuredTool, so that no invalid type
 * value can ever reach the LLM API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizeJsonSchema(schema: any, isRoot = true): Record<string, unknown> {
	if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
		return { type: 'object', properties: {} };
	}

	const result: Record<string, unknown> = { ...schema };

	// Normalize the type field
	const rawType = result.type;
	if (rawType === undefined || rawType === null || !VALID_JSON_SCHEMA_TYPES.includes(rawType as string)) {
		result.type = isRoot ? 'object' : 'string';
	}

	// Recursively sanitize properties
	if (result.properties && typeof result.properties === 'object' && !Array.isArray(result.properties)) {
		const sanitizedProps: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
			sanitizedProps[key] = sanitizeJsonSchema(value, false);
		}
		result.properties = sanitizedProps;
	}

	// Recursively sanitize array items
	if (result.items) {
		result.items = sanitizeJsonSchema(result.items, false);
	}

	return result;
}

// Minimal JSON Schema -> Zod converter supporting basic MCP tool schemas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertJsonSchemaToZod(schema: any): z.ZodTypeAny {
	if (!schema || typeof schema !== 'object') return z.object({});
	// MCP spec mandates inputSchema is always type "object".
	// Treat missing/null/non-string type as an empty object (no required params).
	// Also normalize Python-serialized null ("None") and any other non-standard values.
	const VALID_TYPES = ['string', 'integer', 'number', 'boolean', 'array', 'object'];
	const rawType = schema.type ?? 'object';
	const type = VALID_TYPES.includes(rawType) ? rawType : 'object';
	if (schema.enum && Array.isArray(schema.enum)) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return z.enum([...schema.enum.map((e: any) => String(e))] as [string, ...string[]]);
	}
	switch (type) {
		case 'string':
			return z.string();
		case 'integer':
		case 'number':
			return z.number();
		case 'boolean':
			return z.boolean();
		case 'array':
			return z.array(convertJsonSchemaToZod(schema.items));
		case 'object': {
			const properties = schema.properties || {};
			const shape: Record<string, z.ZodTypeAny> = {};
			for (const key of Object.keys(properties)) {
				shape[key] = convertJsonSchemaToZod(properties[key]);
			}
			let objectSchema = z.object(shape);
			const required: string[] = Array.isArray(schema.required) ? schema.required : [];
			for (const key of Object.keys(shape)) {
				if (!required.includes(key)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					objectSchema = objectSchema.partial({ [key]: true } as any);
				}
			}
			return objectSchema;
		}
		default:
			return z.any();
	}
}
