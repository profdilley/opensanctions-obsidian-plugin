// OpenSanctions API Types
export interface OpenSanctionsEntity {
	id: string;
	caption: string;
	schema: string; // "Person", "Company", "Vessel", etc.
	properties: Record<string, string[]>;
	datasets: string[];
	referents: string[];
	target: boolean;
	first_seen: string;
	last_seen: string;
	last_change?: string;
}

export interface SearchResponse {
	total: {
		value: number;
		relation: string;
	};
	limit: number;
	offset: number;
	results: OpenSanctionsEntity[];
	facets?: {
		countries: Facet;
		topics: Facet;
		datasets: Facet;
	};
}

export interface Facet {
	label: string;
	values: {
		name: string;
		label: string;
		count: number;
	}[];
}

export interface SearchParams {
	query: string;
	schema?: string;
	dataset?: string;
	countries?: string[];
	topics?: string[];
	limit?: number;
	offset?: number;
}

export interface FieldConfigItem {
	include: boolean;
	wikilink: boolean;
	yamlKey: string;
}

export interface FieldConfig {
	[apiField: string]: FieldConfigItem;
}

// Import mode enum
export enum ImportMode {
	STANDARD = 'standard',
	QUICK = 'quick'
}

export interface PluginSettings {
	apiKey: string;
	defaultFolder: string;
	overwriteExisting: boolean;
	includeSourceUrl: boolean;
	includeImportDate: boolean;
	fieldConfigs: Record<string, FieldConfig>; // Keyed by schema
	lastUsedFieldConfigs: Record<string, FieldConfig>; // NEW: Last used configs for Quick Import
	quickImportSettings: {                              // NEW: Quick Import preferences
		enabled: boolean;
		rememberLastConfig: boolean;
	};
	templates: Record<string, string>; // Keyed by schema
}

export interface EnrichedEntity extends OpenSanctionsEntity {
	relationships?: {
		directorOf: string[];
		ownerOf: string[];
		ownedBy: string[];
		relatedTo: string[];
		family: string[];
		coConspirator: string[];
	};
}

// Default field configurations for each schema
export const DEFAULT_FIELD_CONFIGS: Record<string, FieldConfig> = {
	Person: {
		name: { include: true, wikilink: false, yamlKey: 'aliases' },
		birthDate: { include: true, wikilink: false, yamlKey: 'date of birth' },
		birthPlace: { include: true, wikilink: true, yamlKey: 'place of birth' },
		nationality: { include: true, wikilink: true, yamlKey: 'country_citizenship' },
		position: { include: true, wikilink: false, yamlKey: 'description' },
		innCode: { include: true, wikilink: false, yamlKey: 'INN' },
		address: { include: true, wikilink: false, yamlKey: 'address' },
		email: { include: true, wikilink: false, yamlKey: 'email' },
		topics: { include: true, wikilink: false, yamlKey: 'sanctioned' },
		sourceUrl: { include: true, wikilink: false, yamlKey: 'source url' }
	},
	Company: {
		name: { include: true, wikilink: false, yamlKey: 'aliases' },
		country: { include: true, wikilink: true, yamlKey: 'country' },
		jurisdiction: { include: true, wikilink: true, yamlKey: 'jurisdiction' },
		registrationNumber: { include: true, wikilink: false, yamlKey: 'registration number' },
		taxNumber: { include: true, wikilink: false, yamlKey: 'TIN' },
		innCode: { include: true, wikilink: false, yamlKey: 'INN' },
		ogrnCode: { include: true, wikilink: false, yamlKey: 'OGRN' },
		kppCode: { include: true, wikilink: false, yamlKey: 'KPP' },
		okpoCode: { include: true, wikilink: false, yamlKey: 'OKPO' },
		incorporationDate: { include: true, wikilink: false, yamlKey: 'Incorporated' },
		dissolutionDate: { include: true, wikilink: false, yamlKey: 'Dissolution date' },
		status: { include: true, wikilink: false, yamlKey: 'Active' },
		legalForm: { include: true, wikilink: false, yamlKey: 'instance of' },
		address: { include: true, wikilink: false, yamlKey: 'address' },
		phone: { include: true, wikilink: false, yamlKey: 'phone number' },
		website: { include: true, wikilink: false, yamlKey: 'website' },
		topics: { include: true, wikilink: false, yamlKey: 'sanctioned' }
	},
	LegalEntity: {
		name: { include: true, wikilink: false, yamlKey: 'aliases' },
		country: { include: true, wikilink: true, yamlKey: 'country' },
		jurisdiction: { include: true, wikilink: true, yamlKey: 'jurisdiction' },
		registrationNumber: { include: true, wikilink: false, yamlKey: 'registration number' },
		innCode: { include: true, wikilink: false, yamlKey: 'INN' },
		ogrnCode: { include: true, wikilink: false, yamlKey: 'OGRN' },
		address: { include: true, wikilink: false, yamlKey: 'address' },
		topics: { include: true, wikilink: false, yamlKey: 'sanctioned' }
	}
};

export const DEFAULT_SETTINGS: PluginSettings = {
	apiKey: '',
	defaultFolder: 'OpenSanctions',
	overwriteExisting: false,
	includeSourceUrl: true,
	includeImportDate: true,
	fieldConfigs: DEFAULT_FIELD_CONFIGS,
	lastUsedFieldConfigs: {},
	quickImportSettings: {
		enabled: true,
		rememberLastConfig: true
	},
	templates: {}
};