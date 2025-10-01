import { z } from 'zod';

// Minimal JSON Schema -> Zod converter supporting basic MCP tool schemas.
export function convertJsonSchemaToZod(schema: any): z.ZodTypeAny {
	if (!schema || typeof schema !== 'object') return z.any();
	const type = schema.type;
	if (schema.enum && Array.isArray(schema.enum)) {
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
					objectSchema = objectSchema.partial({ [key]: true } as any);
				}
			}
			return objectSchema;
		}
		default:
			return z.any();
	}
}
