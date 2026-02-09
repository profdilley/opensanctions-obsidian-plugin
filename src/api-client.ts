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
			// Request with high limit to get as many relationships as possible
			const response = await this.makeRequest(
				`/entities/${encodeURIComponent(entityId)}/adjacent`,
				{ limit: '500' }
			);

			// The adjacent endpoint returns: { entity: {...}, adjacent: { propName: { results: [...] } } }
			if (response.adjacent && typeof response.adjacent === 'object') {
				const allEntities: OpenSanctionsEntity[] = [];
				for (const propResults of Object.values(response.adjacent)) {
					const results = (propResults as any)?.results;
					if (Array.isArray(results)) {
						allEntities.push(...results);
					}
				}
				return allEntities;
			}

			// Fallback for unexpected formats
			return Array.isArray(response) ? response : (response.results || []);
		} catch (error) {
			// Adjacent entities endpoint might not exist or have different format
			console.warn('Could not fetch adjacent entities:', error);
			return [];
		}
	}

	/**
	 * Extract entity ID from a property value that may be a string ID or a nested EntityResponse object.
	 */
	private extractEntityId(value: any): string | null {
		if (typeof value === 'string') {
			return value;
		} else if (value && typeof value === 'object' && value.id) {
			return value.id;
		}
		return null;
	}

	/**
	 * Extract all entity IDs from a property value array (handles both string[] and EntityResponse[]).
	 */
	private extractEntityIds(values: any[]): string[] {
		return values.map(v => this.extractEntityId(v)).filter((id): id is string => id !== null);
	}

	/**
	 * Check if a property value array contains a given entity ID (handles both string[] and EntityResponse[]).
	 */
	private propertyContainsId(values: any[] | undefined, entityId: string): boolean {
		if (!values) return false;
		return values.some(v => {
			if (typeof v === 'string') return v === entityId;
			if (v && typeof v === 'object' && v.id) return v.id === entityId;
			return false;
		});
	}

	/**
	 * Extract the first target entity ID and optional caption from a property value array,
	 * populating the caption map if a nested EntityResponse is found.
	 */
	private extractFirstTarget(values: any[] | undefined, captionMap: Map<string, string>): string | null {
		if (!values || values.length === 0) return null;
		const first = values[0];
		if (typeof first === 'string') {
			return first;
		} else if (first && typeof first === 'object' && first.id) {
			if (first.caption) {
				captionMap.set(first.id, first.caption);
			}
			return first.id;
		}
		return null;
	}

	/**
	 * Extract nested EntityResponse objects from an entity's properties.
	 * The /entities/{id} endpoint with nested=true (default) embeds relationship entities
	 * directly in properties like ownershipOwner, directorshipDirector, membershipMember, etc.
	 */
	private extractNestedEntities(entity: OpenSanctionsEntity): OpenSanctionsEntity[] {
		const nested: OpenSanctionsEntity[] = [];
		if (!entity.properties) return nested;

		// Properties are typed as string[] but at runtime can contain nested EntityResponse objects
		for (const values of Object.values(entity.properties)) {
			if (Array.isArray(values)) {
				for (const v of values as any[]) {
					if (v && typeof v === 'object' && v.id && v.schema) {
						nested.push(v as OpenSanctionsEntity);
					}
				}
			}
		}
		return nested;
	}

	async fetchWithRelationships(entityId: string): Promise<EnrichedEntity> {
		// Fetch primary entity (nested=true is the default, which embeds relationship entities)
		const entity = await this.getEntity(entityId);

		// Try to fetch adjacent entities (relationships) from dedicated endpoint
		let adjacent: OpenSanctionsEntity[] = [];
		try {
			adjacent = await this.getAdjacent(entityId);
		} catch (error) {
			console.warn('Failed to fetch relationships for entity:', entityId, error);
		}

		// Also extract any relationship entities nested in the main entity's properties
		// (the /entities/{id} endpoint with nested=true embeds these in properties like
		// ownershipOwner, directorshipDirector, membershipMember, etc.)
		const nestedFromEntity = this.extractNestedEntities(entity);
		if (nestedFromEntity.length > 0) {
			// Merge nested entities, avoiding duplicates by ID
			const existingIds = new Set(adjacent.map(a => a.id));
			for (const nested of nestedFromEntity) {
				if (!existingIds.has(nested.id)) {
					adjacent.push(nested);
					existingIds.add(nested.id);
				}
			}
		}

		// Build a caption lookup map from all adjacent entities
		const captionMap = new Map<string, string>();
		captionMap.set(entityId, entity.caption);
		for (const adj of adjacent) {
			if (adj.caption && adj.id) {
				captionMap.set(adj.id, adj.caption);
			}
			// Also extract captions from nested entity objects within properties
			if (adj.properties) {
				for (const values of Object.values(adj.properties)) {
					if (Array.isArray(values)) {
						for (const v of values as any[]) {
							if (v && typeof v === 'object' && v.id && v.caption) {
								captionMap.set(v.id, v.caption);
							}
						}
					}
				}
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
					if (this.propertyContainsId(rel.properties.director, entityId)) {
						const org = this.extractFirstTarget(rel.properties.organization, captionMap);
						if (org) {
							relationshipEntries.push({ type: 'directorOf', targetId: org });
							if (!captionMap.has(org)) unresolvedIds.add(org);
						}
					}
					break;

				case 'Ownership':
					if (this.propertyContainsId(rel.properties.owner, entityId)) {
						const asset = this.extractFirstTarget(rel.properties.asset, captionMap);
						if (asset) {
							relationshipEntries.push({ type: 'ownerOf', targetId: asset });
							if (!captionMap.has(asset)) unresolvedIds.add(asset);
						}
					} else if (this.propertyContainsId(rel.properties.asset, entityId)) {
						const owner = this.extractFirstTarget(rel.properties.owner, captionMap);
						if (owner) {
							relationshipEntries.push({ type: 'ownedBy', targetId: owner });
							if (!captionMap.has(owner)) unresolvedIds.add(owner);
						}
					}
					break;

				case 'Employment':
					if (this.propertyContainsId(rel.properties.employee, entityId)) {
						const employer = this.extractFirstTarget(rel.properties.employer, captionMap);
						if (employer) {
							relationshipEntries.push({ type: 'employeeOf', targetId: employer });
							if (!captionMap.has(employer)) unresolvedIds.add(employer);
						}
					}
					break;

				case 'Membership':
					if (this.propertyContainsId(rel.properties.member, entityId)) {
						const org = this.extractFirstTarget(rel.properties.organization, captionMap);
						if (org) {
							relationshipEntries.push({ type: 'memberOf', targetId: org });
							if (!captionMap.has(org)) unresolvedIds.add(org);
						}
					}
					break;

				case 'Family': {
					const personVals = rel.properties.person || [];
					const relativeVals = rel.properties.relative || [];
					let targetId: string | null = null;
					if (this.propertyContainsId(personVals, entityId)) {
						targetId = this.extractFirstTarget(relativeVals, captionMap);
					} else if (this.propertyContainsId(relativeVals, entityId)) {
						targetId = this.extractFirstTarget(personVals, captionMap);
					}
					if (targetId && targetId !== entityId) {
						relationshipEntries.push({ type: 'family', targetId });
						if (!captionMap.has(targetId)) unresolvedIds.add(targetId);
					}
					break;
				}

				case 'Associate': {
					const assocPersonVals = rel.properties.person || [];
					const associateVals = rel.properties.associate || [];
					let assocTargetId: string | null = null;
					if (this.propertyContainsId(assocPersonVals, entityId)) {
						assocTargetId = this.extractFirstTarget(associateVals, captionMap);
					} else if (this.propertyContainsId(associateVals, entityId)) {
						assocTargetId = this.extractFirstTarget(assocPersonVals, captionMap);
					}
					if (assocTargetId && assocTargetId !== entityId) {
						relationshipEntries.push({ type: 'coConspirator', targetId: assocTargetId });
						if (!captionMap.has(assocTargetId)) unresolvedIds.add(assocTargetId);
					}
					break;
				}

				case 'UnknownLink':
				case 'Succession':
				case 'Representation': {
					const subjectVals = rel.properties.subject || [];
					const objectVals = rel.properties.object || [];
					const subjectId = this.extractFirstTarget(subjectVals, captionMap);
					const objectId = this.extractFirstTarget(objectVals, captionMap);
					if (subjectId === entityId && objectId) {
						relationshipEntries.push({ type: 'relatedTo', targetId: objectId });
						if (!captionMap.has(objectId)) unresolvedIds.add(objectId);
					} else if (objectId === entityId && subjectId) {
						relationshipEntries.push({ type: 'relatedTo', targetId: subjectId });
						if (!captionMap.has(subjectId)) unresolvedIds.add(subjectId);
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