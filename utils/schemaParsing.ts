import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertJsonSchemaToZod(schema: any): z.ZodSchema<unknown> {
	// Return a default schema if input is invalid
	if (!schema || typeof schema !== 'object') {
		return z.any();
	}

	// Simplified conversion - handle basic types
	if (schema.type === 'object') {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const shape: Record<string, z.ZodSchema<any>> = {};
		if (schema.properties && typeof schema.properties === 'object') {
			for (const [key, value] of Object.entries(schema.properties)) {
				shape[key] = convertJsonSchemaToZod(value);
			}
		}
		return z.object(shape);
	}

	if (schema.type === 'string') {
		return z.string();
	}

	if (schema.type === 'number') {
		return z.number();
	}

	if (schema.type === 'boolean') {
		return z.boolean();
	}

	if (schema.type === 'array') {
		return z.array(schema.items ? convertJsonSchemaToZod(schema.items) : z.any());
	}

	return z.any();
}