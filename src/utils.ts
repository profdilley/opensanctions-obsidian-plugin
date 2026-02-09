/**
 * Utility functions for the OpenSanctions plugin
 */

// Country code to name mapping for common countries
export const COUNTRY_NAMES: Record<string, string> = {
	'ru': 'Russia',
	'us': 'United States',
	'gb': 'United Kingdom',
	'de': 'Germany',
	'fr': 'France',
	'cn': 'China',
	'jp': 'Japan',
	'ua': 'Ukraine',
	'by': 'Belarus',
	'kz': 'Kazakhstan',
	'ch': 'Switzerland',
	'ca': 'Canada',
	'au': 'Australia',
	'nz': 'New Zealand',
	'in': 'India',
	'br': 'Brazil',
	'mx': 'Mexico',
	'ar': 'Argentina',
	'za': 'South Africa',
	'eg': 'Egypt',
	'tr': 'Turkey',
	'it': 'Italy',
	'es': 'Spain',
	'pt': 'Portugal',
	'pl': 'Poland',
	'se': 'Sweden',
	'no': 'Norway',
	'dk': 'Denmark',
	'fi': 'Finland',
	'nl': 'Netherlands',
	'be': 'Belgium',
	'at': 'Austria',
	'cz': 'Czech Republic',
	'hu': 'Hungary',
	'gr': 'Greece',
	'il': 'Israel',
	'sa': 'Saudi Arabia',
	'ae': 'United Arab Emirates',
	'sg': 'Singapore',
	'my': 'Malaysia',
	'th': 'Thailand',
	'id': 'Indonesia',
	'ph': 'Philippines',
	'vn': 'Vietnam',
	'kr': 'South Korea',
	'kp': 'North Korea',
	'pk': 'Pakistan',
	'bd': 'Bangladesh',
	'lk': 'Sri Lanka',
	'mm': 'Myanmar',
	'kh': 'Cambodia',
	'la': 'Laos',
	'np': 'Nepal',
	'bt': 'Bhutan',
	'mv': 'Maldives',
	'af': 'Afghanistan',
	'ir': 'Iran',
	'iq': 'Iraq',
	'sy': 'Syria',
	'lb': 'Lebanon',
	'jo': 'Jordan',
	'ps': 'Palestine',
	'ye': 'Yemen',
	'om': 'Oman',
	'kw': 'Kuwait',
	'bh': 'Bahrain',
	'qa': 'Qatar',
	'am': 'Armenia',
	'az': 'Azerbaijan',
	'ge': 'Georgia',
	'kg': 'Kyrgyzstan',
	'tj': 'Tajikistan',
	'tm': 'Turkmenistan',
	'uz': 'Uzbekistan',
	'md': 'Moldova',
	'ro': 'Romania',
	'bg': 'Bulgaria',
	'rs': 'Serbia',
	'hr': 'Croatia',
	'si': 'Slovenia',
	'sk': 'Slovakia',
	'ba': 'Bosnia and Herzegovina',
	'mk': 'North Macedonia',
	'al': 'Albania',
	'me': 'Montenegro',
	'xk': 'Kosovo',
	'cy': 'Cyprus',
	'mt': 'Malta',
	'is': 'Iceland',
	'ie': 'Ireland',
	'lu': 'Luxembourg',
	'li': 'Liechtenstein',
	'mc': 'Monaco',
	'sm': 'San Marino',
	'va': 'Vatican City',
	'ad': 'Andorra'
};

/**
 * Convert a country code to a human-readable name
 */
export function getCountryName(countryCode: string | undefined): string {
	if (!countryCode) return '';
	return COUNTRY_NAMES[countryCode.toLowerCase()] || countryCode.toUpperCase();
}

/**
 * Sanitize a string for use as a filename
 */
export function sanitizeFilename(filename: string): string {
	return filename
		.replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
		.replace(/\s+/g, ' ')         // Normalize whitespace
		.trim()
		.substring(0, 200);           // Reasonable length limit
}

/**
 * Sanitize a string for use in wikilinks
 */
export function sanitizeWikilink(value: string): string {
	return value
		.replace(/[\[\]]/g, '') // Remove existing brackets
		.replace(/[|#]/g, '')   // Remove pipe and hash characters
		.trim();
}

/**
 * Format a date string for display
 */
export function formatDate(dateString: string | undefined): string {
	if (!dateString) return '';

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return dateString; // Return original if invalid

		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	} catch {
		return dateString; // Return original if parsing fails
	}
}

/**
 * Get human-readable labels for entity topics
 */
export function getTopicLabels(topics: string[]): string[] {
	const topicMap: Record<string, string> = {
		'sanction': 'Sanctioned',
		'role.pep': 'PEP (Politically Exposed Person)',
		'role.rca': 'Close Associate',
		'role.oligarch': 'Oligarch',
		'wanted': 'Wanted',
		'debarment': 'Debarred',
		'export.control': 'Export Controlled',
		'corp.disqual': 'Disqualified',
		'mil': 'Military',
		'role.diplo': 'Diplomat',
		'role.judge': 'Judge',
		'poi': 'Person of Interest',
		'crime': 'Criminal',
		'crime.war': 'War Crimes',
		'asset.frozen': 'Frozen Assets',
		'reg.action': 'Regulatory Action'
	};

	return topics
		.map(topic => topicMap[topic] || topic)
		.filter(Boolean);
}

/**
 * Get simplified dataset names for display
 */
export function getDatasetLabel(dataset: string): string {
	const datasetMap: Record<string, string> = {
		'us_ofac_sdn': 'US OFAC SDN',
		'eu_fsf': 'EU Financial Sanctions',
		'gb_hmt_sanctions': 'UK HMT Sanctions (Discontinued)',
		'gb_icdo_sanctions': 'UK Consolidated Sanctions',
		'ca_dfatd_sema_sanctions': 'Canada SEMA',
		'au_dfat_sanctions': 'Australia DFAT',
		'un_sc_sanctions': 'UN Security Council',
		'ch_seco_sanctions': 'Swiss SECO',
		'jp_mof_sanctions': 'Japan MOF',
		'ua_nsdc_sanctions': 'Ukraine NSDC',
		'ru_acf_bribetakers': 'ACF War Enablers',
		'wikidata': 'Wikidata',
		'us_cia_world_leaders': 'CIA World Leaders',
		'everypolitician': 'EveryPolitician',
		'ext_icij_offshoreleaks': 'ICIJ Offshore Leaks'
	};

	return datasetMap[dataset] || dataset.replace(/_/g, ' ').toUpperCase();
}

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return text.substring(0, maxLength - 3) + '...';
}

/**
 * Debounce function for search input
 */
export function debounce<T extends (...args: any[]) => void>(
	func: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: NodeJS.Timeout;

	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => func(...args), delay);
	};
}

/**
 * Check if a string appears to be a valid API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
	// OpenSanctions API keys are typically 40-character alphanumeric strings
	return /^[a-zA-Z0-9]{32,64}$/.test(apiKey.trim());
}

/**
 * Extract entity IDs from relationship properties
 */
export function extractEntityIds(properties: Record<string, string[]>): string[] {
	const entityFields = ['director', 'organization', 'owner', 'asset', 'relative', 'associate', 'subject', 'object'];
	const ids: string[] = [];

	for (const field of entityFields) {
		if (properties[field]) {
			ids.push(...properties[field]);
		}
	}

	return ids.filter(Boolean);
}

/**
 * Group entities by schema type
 */
export function groupEntitiesBySchema(entities: any[]): Record<string, any[]> {
	const groups: Record<string, any[]> = {};

	for (const entity of entities) {
		const schema = entity.schema || 'Unknown';
		if (!groups[schema]) {
			groups[schema] = [];
		}
		groups[schema].push(entity);
	}

	return groups;
}

/**
 * Calculate relevance score for search results
 */
export function calculateRelevanceScore(entity: any, searchTerms: string[]): number {
	let score = 0;
	const searchTermsLower = searchTerms.map(t => t.toLowerCase());

	// Check caption/title (highest weight)
	if (entity.caption) {
		for (const term of searchTermsLower) {
			if (entity.caption.toLowerCase().includes(term)) {
				score += 10;
			}
		}
	}

	// Check names and aliases (high weight)
	const names = [...(entity.properties.name || []), ...(entity.properties.alias || [])];
	for (const name of names) {
		for (const term of searchTermsLower) {
			if (name.toLowerCase().includes(term)) {
				score += 5;
			}
		}
	}

	// Check other properties (lower weight)
	for (const [key, values] of Object.entries(entity.properties)) {
		if (key !== 'name' && key !== 'alias' && Array.isArray(values)) {
			for (const value of values) {
				for (const term of searchTermsLower) {
					if (String(value).toLowerCase().includes(term)) {
						score += 1;
					}
				}
			}
		}
	}

	return score;
}

/**
 * Validate that required properties exist for a schema
 */
export function validateEntityForSchema(entity: any, schema: string): string[] {
	const errors: string[] = [];

	switch (schema) {
		case 'Person':
			if (!entity.caption && !entity.properties.name?.[0]) {
				errors.push('Missing name or caption');
			}
			break;
		case 'Company':
		case 'LegalEntity':
			if (!entity.caption && !entity.properties.name?.[0]) {
				errors.push('Missing company name or caption');
			}
			break;
	}

	return errors;
}