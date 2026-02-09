import { Notice, requestUrl } from 'obsidian';
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
			const response = await requestUrl({
				url: url.toString(),
				method: 'GET',
				headers
			});

			return response.json;
		} catch (error) {
			// Handle HTTP errors from requestUrl
			if (error.status) {
				await this.handleHttpErrorFromRequestUrl(error);
			} else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
				throw new Error('Network error: Could not connect to OpenSanctions. Check your internet connection.');
			} else {
				throw error;
			}
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

	private async handleHttpErrorFromRequestUrl(error: any) {
		const status = error.status;
		let errorMessage = '';

		try {
			// requestUrl error object may contain response data
			if (error.json) {
				errorMessage = error.json.message || error.json.detail || 'Unknown error';
			} else if (error.text) {
				errorMessage = error.text;
			} else {
				errorMessage = 'Unknown error';
			}
		} catch {
			errorMessage = 'Unknown error';
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

		// Build a caption lookup map from all adjacent entities
		// The adjacent response includes both relationship entities and connected entities
		const captionMap = new Map<string, string>();
		captionMap.set(entityId, entity.caption);
		for (const adj of adjacent) {
			if (adj.caption && adj.id) {
				captionMap.set(adj.id, adj.caption);
			}
		}

		// Collect entity IDs that need caption resolution
		const unresolvedIds = new Set<string>();

		// Process relationships into structured format
		const relationships = {
			directorOf: [] as string[],
			ownerOf: [] as string[],
			ownedBy: [] as string[],
			employeeOf: [] as string[],
			memberOf: [] as string[],
			relatedTo: [] as string[],
			family: [] as string[],
			coConspirator: [] as string[]
		};

		// First pass: collect target IDs from relationship entities
		const relationshipEntries: { type: string; targetId: string }[] = [];

		for (const rel of adjacent) {
			switch (rel.schema) {
				case 'Directorship':
					if (rel.properties.director?.includes(entityId)) {
						const org = rel.properties.organization?.[0];
						if (org) {
							relationshipEntries.push({ type: 'directorOf', targetId: org });
							if (!captionMap.has(org)) unresolvedIds.add(org);
						}
					}
					break;

				case 'Ownership':
					if (rel.properties.owner?.includes(entityId)) {
						const asset = rel.properties.asset?.[0];
						if (asset) {
							relationshipEntries.push({ type: 'ownerOf', targetId: asset });
							if (!captionMap.has(asset)) unresolvedIds.add(asset);
						}
					} else if (rel.properties.asset?.includes(entityId)) {
						const owner = rel.properties.owner?.[0];
						if (owner) {
							relationshipEntries.push({ type: 'ownedBy', targetId: owner });
							if (!captionMap.has(owner)) unresolvedIds.add(owner);
						}
					}
					break;

				case 'Employment':
					if (rel.properties.employee?.includes(entityId)) {
						const employer = rel.properties.employer?.[0];
						if (employer) {
							relationshipEntries.push({ type: 'employeeOf', targetId: employer });
							if (!captionMap.has(employer)) unresolvedIds.add(employer);
						}
					}
					break;

				case 'Membership':
					if (rel.properties.member?.includes(entityId)) {
						const org = rel.properties.organization?.[0];
						if (org) {
							relationshipEntries.push({ type: 'memberOf', targetId: org });
							if (!captionMap.has(org)) unresolvedIds.add(org);
						}
					}
					break;

				case 'Family': {
					const personIds = rel.properties.person || [];
					const relativeIds = rel.properties.relative || [];
					// Find the target (the entity that isn't us)
					const targetId = personIds.includes(entityId)
						? relativeIds[0]
						: relativeIds.includes(entityId)
							? personIds[0]
							: null;
					if (targetId && targetId !== entityId) {
						relationshipEntries.push({ type: 'family', targetId });
						if (!captionMap.has(targetId)) unresolvedIds.add(targetId);
					}
					break;
				}

				case 'Associate': {
					const assocPersonIds = rel.properties.person || [];
					const associateIds = rel.properties.associate || [];
					const assocTargetId = assocPersonIds.includes(entityId)
						? associateIds[0]
						: associateIds.includes(entityId)
							? assocPersonIds[0]
							: null;
					if (assocTargetId && assocTargetId !== entityId) {
						relationshipEntries.push({ type: 'coConspirator', targetId: assocTargetId });
						if (!captionMap.has(assocTargetId)) unresolvedIds.add(assocTargetId);
					}
					break;
				}

				case 'UnknownLink':
				case 'Succession':
				case 'Representation': {
					const subject = rel.properties.subject?.[0];
					const object = rel.properties.object?.[0];
					if (subject === entityId && object) {
						relationshipEntries.push({ type: 'relatedTo', targetId: object });
						if (!captionMap.has(object)) unresolvedIds.add(object);
					} else if (object === entityId && subject) {
						relationshipEntries.push({ type: 'relatedTo', targetId: subject });
						if (!captionMap.has(subject)) unresolvedIds.add(subject);
					}
					break;
				}
			}
		}

		// Resolve any unresolved entity IDs to captions
		for (const targetId of unresolvedIds) {
			try {
				const targetEntity = await this.getEntity(targetId);
				if (targetEntity?.caption) {
					captionMap.set(targetId, targetEntity.caption);
				}
			} catch {
				// Use ID as fallback if entity can't be fetched
			}
		}

		// Second pass: populate relationships with resolved captions
		for (const entry of relationshipEntries) {
			const displayName = captionMap.get(entry.targetId) || entry.targetId;
			const arr = relationships[entry.type as keyof typeof relationships];
			if (arr && !arr.includes(displayName)) {
				arr.push(displayName);
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