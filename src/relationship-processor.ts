import { OpenSanctionsEntity, EnrichedEntity } from './types';
import { OpenSanctionsApiClient } from './api-client';

export interface ProcessedRelationship {
	type: string;
	targetEntity: string;
	targetCaption?: string;
	relationshipId: string;
	properties: Record<string, string[]>;
}

export class RelationshipProcessor {
	private apiClient: OpenSanctionsApiClient;
	private entityCache: Map<string, OpenSanctionsEntity> = new Map();

	constructor(apiClient: OpenSanctionsApiClient) {
		this.apiClient = apiClient;
	}

	async processEntityRelationships(entityId: string): Promise<ProcessedRelationship[]> {
		try {
			const adjacentEntities = await this.apiClient.getAdjacent(entityId);
			const relationships: ProcessedRelationship[] = [];

			for (const rel of adjacentEntities) {
				const processed = await this.processRelationshipEntity(rel, entityId);
				if (processed) {
					relationships.push(processed);
				}
			}

			return relationships;
		} catch (error) {
			console.warn('Failed to process relationships for entity:', entityId, error);
			return [];
		}
	}

	private async processRelationshipEntity(
		rel: OpenSanctionsEntity,
		sourceEntityId: string
	): Promise<ProcessedRelationship | null> {
		try {
			const relType = this.getRelationshipType(rel.schema);
			if (!relType) return null;

			const targetEntityId = this.extractTargetEntity(rel, sourceEntityId);
			if (!targetEntityId) return null;

			// Try to get the target entity's caption for better display
			let targetCaption: string | undefined;
			try {
				const targetEntity = await this.getEntityWithCache(targetEntityId);
				targetCaption = targetEntity?.caption;
			} catch {
				// Ignore errors when fetching target entity
			}

			return {
				type: relType,
				targetEntity: targetEntityId,
				targetCaption,
				relationshipId: rel.id,
				properties: rel.properties
			};
		} catch (error) {
			console.warn('Error processing relationship entity:', rel.id, error);
			return null;
		}
	}

	private getRelationshipType(schema: string): string | null {
		const relationshipTypes: Record<string, string> = {
			'Directorship': 'directorship',
			'Ownership': 'ownership',
			'Family': 'family',
			'Associate': 'associate',
			'Succession': 'succession',
			'UnknownLink': 'unknown_link',
			'Representation': 'representation',
			'Membership': 'membership',
			'Employment': 'employment'
		};

		return relationshipTypes[schema] || null;
	}

	private extractTargetEntity(rel: OpenSanctionsEntity, sourceEntityId: string): string | null {
		const props = rel.properties;

		// For each relationship type, determine the target entity
		switch (rel.schema) {
			case 'Directorship':
				if (props.director?.includes(sourceEntityId)) {
					return props.organization?.[0] || null;
				} else if (props.organization?.includes(sourceEntityId)) {
					return props.director?.[0] || null;
				}
				break;

			case 'Ownership':
				if (props.owner?.includes(sourceEntityId)) {
					return props.asset?.[0] || null;
				} else if (props.asset?.includes(sourceEntityId)) {
					return props.owner?.[0] || null;
				}
				break;

			case 'Family':
				if (props.person?.includes(sourceEntityId)) {
					return props.relative?.[0] || null;
				} else if (props.relative?.includes(sourceEntityId)) {
					return props.person?.[0] || null;
				}
				break;

			case 'Associate':
				if (props.person?.includes(sourceEntityId)) {
					return props.associate?.[0] || null;
				} else if (props.associate?.includes(sourceEntityId)) {
					return props.person?.[0] || null;
				}
				break;

			case 'Succession':
			case 'UnknownLink':
				if (props.subject?.includes(sourceEntityId)) {
					return props.object?.[0] || null;
				} else if (props.object?.includes(sourceEntityId)) {
					return props.subject?.[0] || null;
				}
				break;

			case 'Membership':
				if (props.member?.includes(sourceEntityId)) {
					return props.organization?.[0] || null;
				} else if (props.organization?.includes(sourceEntityId)) {
					return props.member?.[0] || null;
				}
				break;

			case 'Employment':
				if (props.employee?.includes(sourceEntityId)) {
					return props.employer?.[0] || null;
				} else if (props.employer?.includes(sourceEntityId)) {
					return props.employee?.[0] || null;
				}
				break;
		}

		return null;
	}

	private async getEntityWithCache(entityId: string): Promise<OpenSanctionsEntity | null> {
		// Check cache first
		if (this.entityCache.has(entityId)) {
			return this.entityCache.get(entityId) || null;
		}

		try {
			const entity = await this.apiClient.getEntity(entityId);
			this.entityCache.set(entityId, entity);
			return entity;
		} catch {
			// Cache negative results too to avoid repeated requests
			this.entityCache.set(entityId, null as any);
			return null;
		}
	}

	/**
	 * Convert processed relationships to the structured format expected by the note generator
	 */
	convertToStructuredRelationships(
		relationships: ProcessedRelationship[],
		sourceEntityId: string
	): EnrichedEntity['relationships'] {
		const structured = {
			directorOf: [] as string[],
			ownerOf: [] as string[],
			ownedBy: [] as string[],
			employeeOf: [] as string[],
			memberOf: [] as string[],
			relatedTo: [] as string[],
			family: [] as string[],
			coConspirator: [] as string[]
		};

		for (const rel of relationships) {
			const displayName = rel.targetCaption || rel.targetEntity;

			switch (rel.type) {
				case 'directorship':
					// Determine direction based on relationship properties
					if (rel.properties.director?.includes(sourceEntityId)) {
						structured.directorOf.push(displayName);
					}
					break;

				case 'ownership':
					if (rel.properties.owner?.includes(sourceEntityId)) {
						structured.ownerOf.push(displayName);
					} else if (rel.properties.asset?.includes(sourceEntityId)) {
						structured.ownedBy.push(displayName);
					}
					break;

				case 'employment':
					if (rel.properties.employee?.includes(sourceEntityId)) {
						structured.employeeOf.push(displayName);
					}
					break;

				case 'membership':
					if (rel.properties.member?.includes(sourceEntityId)) {
						structured.memberOf.push(displayName);
					}
					break;

				case 'family':
					structured.family.push(displayName);
					break;

				case 'associate':
					structured.coConspirator.push(displayName);
					break;

				default:
					// Generic relationships
					structured.relatedTo.push(displayName);
					break;
			}
		}

		// Remove duplicates
		Object.keys(structured).forEach(key => {
			const arr = structured[key as keyof typeof structured];
			structured[key as keyof typeof structured] = [...new Set(arr)];
		});

		return structured;
	}

	/**
	 * Clear the entity cache
	 */
	clearCache() {
		this.entityCache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		return {
			size: this.entityCache.size,
			keys: Array.from(this.entityCache.keys())
		};
	}
}