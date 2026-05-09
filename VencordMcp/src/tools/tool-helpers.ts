import { DomainError } from '../errors/domain-error.js';
import { makeError, makeSuccess } from '../types/envelope.js';

export type McpToolResponse = {
	content: { type: 'text'; text: string }[];
	structuredContent: ReturnType<typeof makeSuccess> | ReturnType<typeof makeError>;
};

export function returnSuccess<T>(
	data: T,
	provenance: Record<string, unknown>,
	humanText: string,
): McpToolResponse {
	return {
		content: [{ type: 'text' as const, text: humanText }],
		structuredContent: makeSuccess(data, { provenance }),
	};
}

export function returnError(
	code: string,
	message: string,
	tried: string[],
	suggestions?: string[],
): McpToolResponse {
	return {
		content: [{ type: 'text' as const, text: `Error [${code}]: ${message}` }],
		structuredContent: makeError(code, message, tried, suggestions),
	};
}

export function returnDomainError(error: DomainError): McpToolResponse {
	return returnError(error.code, error.message, error.tried, error.suggestions);
}
