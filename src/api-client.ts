import { Notice } from 'obsidian';
import { OpenSanctionsEntity, SearchParams, SearchResponse, EnrichedEntity } from './types';

export class OpenSanctionsApiClient {
	private apiKey: string;
	private baseUrl = 'https://api.opensanctions.org';
	private lastRequestTime = 0;
	private minRequestInterval = 100; // Rate limiting: 10 requests per second max

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	updateApiKey(apiKey: string) {
		this.apiKey = apiKey;
	}

	private async rateLimit() {
		const now = Date.now();
		const timeSinceLastRequest = now - this.lastRequestTime;

		if (timeSinceLastRequest < this.minRequestInterval) {
			const delay = this.minRequestInterval - timeSinceLastRequest;
			await new Promise(resolve => setTimeout(resolve, delay));
		}

		this.lastRequestTime = Date.now();
	}

	private async makeRequest(endpoint: string, params?: Record<string, string>): Promise<any> {
		await this.rateLimit();

		const url = new URL(`${this.baseUrl}${endpoint}`);

		// Add query parameters
		if (params) {
			Object.entries(params).forEach(([key, value]) => {
				if (value !== undefined && value !== null && value !== '') {
					url.searchParams.append(key, value);
				}
			});
		}

		const headers: Record<string, string> = {
			'Accept': 'application/json'
		};

		// Add authorization header if API key is provided
		if (this.apiKey) {
			headers['Authorization'] = `ApiKey ${this.apiKey}`;
		}

		try {
			const response = await fetch(url.toString(), {
				method: 'GET',
				headers
			});

			if (!response.ok) {
				await this.handleHttpError(response);
			}

			return await response.json();
		} catch (error) {
			if (error.message.includes('Failed to fetch')) {
				throw new Error('Network error: Could not connect to OpenSanctions. Check your internet connection.');
			}
			throw error;
		}
	}

	private async handleHttpError(response: Response) {
		const status = response.status;
		let errorMessage = '';

		try {
			const errorData = await response.json();
			errorMessage = errorData.message || errorData.detail || response.statusText;
		} catch {
			errorMessage = response.statusText;
		}

		switch (status) {
			case 400:
				throw new Error(`Invalid request: ${errorMessage}`);
			case 401:
				throw new Error('API key is invalid. Please check your settings.');
			case 403:
				throw new Error('Access denied. Please check your API key permissions.');
			case 404:
				throw new Error('Entity not found in OpenSanctions database.');
			case 429:
				throw new Error('Rate limit exceeded. Please wait and try again.');
			case 500:
				throw new Error('OpenSanctions server error. Please try again later.');
			default:
				throw new Error(`Request failed (${status}): ${errorMessage}`);
		}
	}

	async search(params: SearchParams): Promise<SearchResponse> {
		const queryParams: Record<string, string> = {
			q: params.query || '',
			limit: (params.limit || 20).toString(),
			offset: (params.offset || 0).toString()
		};

		// Add optional filters
		if (params.schema) {
			queryParams.schema = params.schema;
		}
		if (params.dataset) {
			queryParams.dataset = params.dataset;
		}
		if (params.topics && params.topics.length > 0) {
			queryParams.topics = params.topics.join(',');
		}
		if (params.countries && params.countries.length > 0) {
			queryParams.countries = params.countries.join(',');
		}

		const response = await this.makeRequest('/search/default', queryParams);
		return response as SearchResponse;
	}

	async getEntity(entityId: string): Promise<OpenSanctionsEntity> {
		const response = await this.makeRequest(`/entities/${encodeURIComponent(entityId)}`);
		return response as OpenSanctionsEntity;
	}

	async getAdjacent(entityId: string): Promise<OpenSanctionsEntity[]> {
		try {
			const response = await this.makeRequest(`/entities/${encodeURIComponent(entityId)}/adjacent`);
			return Array.isArray(response) ? response : (response.results || []);
		} catch (error) {
			// Adjacent entities endpoint might not exist or have different format
			console.warn('Could not fetch adjacent entities:', error);
			return [];
		}
	}

	async fetchWithRelationships(entityId: string): Promise<EnrichedEntity> {
		// Fetch primary entity
		const entity = await this.getEntity(entityId);

		// Try to fetch adjacent entities (relationships)
		let adjacent: OpenSanctionsEntity[] = [];
		try {
			adjacent = await this.getAdjacent(entityId);
		} catch (error) {
			console.warn('Failed to fetch relationships for entity:', entityId, error);
		}

		// Process relationships into structured format
		const relationships = {
			directorOf: [] as string[],
			ownerOf: [] as string[],
			ownedBy: [] as string[],
			relatedTo: [] as string[],
			family: [] as string[],
			coConspirator: [] as string[]
		};

		for (const rel of adjacent) {
			switch (rel.schema) {
				case 'Directorship':
					if (rel.properties.director?.includes(entityId)) {
						const org = rel.properties.organization?.[0];
						if (org) relationships.directorOf.push(org);
					}
					break;

				case 'Ownership':
					if (rel.properties.owner?.includes(entityId)) {
						const asset = rel.properties.asset?.[0];
						if (asset) relationships.ownerOf.push(asset);
					} else if (rel.properties.asset?.includes(entityId)) {
						const owner = rel.properties.owner?.[0];
						if (owner) relationships.ownedBy.push(owner);
					}
					break;

				case 'Family':
					const relative = rel.properties.relative?.[0];
					if (relative && relative !== entityId) {
						relationships.family.push(relative);
					}
					break;

				case 'Associate':
					const associate = rel.properties.associate?.[0];
					if (associate && associate !== entityId) {
						relationships.coConspirator.push(associate);
					}
					break;

				case 'UnknownLink':
				case 'Succession':
					// Generic relationships
					const subject = rel.properties.subject?.[0];
					const object = rel.properties.object?.[0];
					if (subject === entityId && object) {
						relationships.relatedTo.push(object);
					} else if (object === entityId && subject) {
						relationships.relatedTo.push(subject);
					}
					break;
			}
		}

		return { ...entity, relationships };
	}

	async getCatalog(): Promise<any> {
		return await this.makeRequest('/catalog');
	}

	async testConnection(): Promise<{ success: boolean; totalEntities?: number; error?: string }> {
		try {
			const result = await this.search({ query: 'test', limit: 1 });
			return {
				success: true,
				totalEntities: result.total.value
			};
		} catch (error) {
			return {
				success: false,
				error: error.message
			};
		}
	}
}