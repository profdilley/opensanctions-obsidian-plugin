import { App, TFile, Notice } from 'obsidian';
import { OpenSanctionsEntity, PluginSettings, FieldConfig, EnrichedEntity } from './types';
import * as Handlebars from 'handlebars';

export class NoteGenerator {
	private app: App;
	private settings: PluginSettings;

	constructor(app: App, settings: PluginSettings) {
		this.app = app;
		this.settings = settings;
	}

	generateFilename(entity: OpenSanctionsEntity): string {
		// Use caption as primary filename
		let filename = entity.caption || entity.properties.name?.[0] || entity.id;

		// Sanitize for filesystem
		filename = filename
			.replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
			.replace(/\s+/g, ' ')         // Normalize whitespace
			.trim()
			.substring(0, 200);           // Reasonable length limit

		return `${filename}.md`;
	}

	async generateNote(entity: OpenSanctionsEntity): Promise<TFile> {
		const content = await this.generateNoteContent(entity);
		return await this.createNoteWithContent(entity, content);
	}

	async generateNoteContent(entity: OpenSanctionsEntity): Promise<string> {
		const parts: string[] = [];

		// Generate YAML frontmatter
		const yamlContent = this.generateYamlFrontmatter(entity);
		parts.push(yamlContent);

		// Empty line after frontmatter
		parts.push('');

		// Generate note body
		const bodyContent = await this.generateNoteBody(entity);
		parts.push(bodyContent);

		return parts.join('\n');
	}

	generateYamlFrontmatter(entity: OpenSanctionsEntity): string {
		const lines: string[] = ['---'];

		// Always include OpenSanctions ID
		lines.push(`opensanctions_id: "${entity.id}"`);

		// Get field configuration for this entity schema
		const fieldConfig = this.settings.fieldConfigs[entity.schema] || {};

		// Process each configured field
		for (const [apiField, config] of Object.entries(fieldConfig)) {
			if (!config.include) continue;

			let values = entity.properties[apiField] || [];

			// Special handling for certain fields
			if (apiField === 'topics') {
				// Convert topics to sanctioned boolean
				if (config.yamlKey === 'sanctioned') {
					const isSanctioned = values.includes('sanction');
					lines.push(`sanctioned: ${isSanctioned}`);
					continue;
				}
			}

			// Skip empty values
			if (values.length === 0) continue;

			const yamlKey = config.yamlKey || apiField;

			// Process and format values
			const formatted = values.map(v => this.formatValue(v, config.wikilink));

			// Add to YAML with proper formatting
			if (formatted.length === 1) {
				lines.push(`${yamlKey}: ${formatted[0]}`);
			} else if (formatted.length > 1) {
				// Use inline array format for better wikilink compatibility
				const arrayContent = formatted.join(', ');
				lines.push(`${yamlKey}: [${arrayContent}]`);
			}
		}

		// Add relationship fields if entity is enriched
		if ('relationships' in entity) {
			this.addRelationshipFields(lines, entity as EnrichedEntity);
		}

		// Add metadata fields
		if (this.settings.includeSourceUrl) {
			lines.push(`source url: "https://opensanctions.org/entities/${entity.id}"`);
		}

		if (this.settings.includeImportDate) {
			const today = new Date().toISOString().split('T')[0];
			lines.push(`imported: "${today}"`);
		}

		lines.push('---');
		return lines.join('\n');
	}

	private addRelationshipFields(lines: string[], entity: EnrichedEntity) {
		const relationships = entity.relationships;
		if (!relationships) return;

		const relationshipMappings = {
			directorOf: 'director of',
			ownerOf: 'owner of',
			ownedBy: 'owned by',
			relatedTo: 'related to',
			family: 'family',
			coConspirator: 'co-conspirator'
		};

		for (const [key, yamlKey] of Object.entries(relationshipMappings)) {
			const values = relationships[key as keyof typeof relationships];
			if (values && values.length > 0) {
				const formatted = values.map(v => `"[[${this.sanitizeWikilink(v)}]]"`);

				if (formatted.length === 1) {
					lines.push(`${yamlKey}: ${formatted[0]}`);
				} else {
					lines.push(`${yamlKey}:`);
					formatted.forEach(f => lines.push(`  - ${f}`));
				}
			}
		}
	}

	private formatValue(value: string, wikilink: boolean): string {
		const sanitized = String(value).replace(/"/g, "'");

		if (wikilink) {
			// Wikilinks should always be quoted in YAML for proper parsing
			return `"[[${this.sanitizeWikilink(sanitized)}]]"`;
		} else {
			return `"${sanitized}"`;
		}
	}

	private sanitizeWikilink(value: string): string {
		// Clean up value for use in wikilinks
		return value
			.replace(/[\[\]]/g, '') // Remove existing brackets
			.trim();
	}

	private async generateNoteBody(entity: OpenSanctionsEntity): Promise<string> {
		// Check if there's a template for this schema
		const templatePath = this.settings.templates[entity.schema];

		if (templatePath) {
			return await this.generateTemplatedBody(entity, templatePath);
		} else {
			return this.generateDefaultBody(entity);
		}
	}

	private async generateTemplatedBody(entity: OpenSanctionsEntity, templatePath: string): Promise<string> {
		try {
			const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
			if (!templateFile || !(templateFile instanceof TFile)) {
				throw new Error(`Template file not found: ${templatePath}`);
			}

			const templateContent = await this.app.vault.read(templateFile);

			// Compile template with Handlebars
			const template = Handlebars.compile(templateContent, {
				noEscape: true
			});

			// Create context for template
			const context = {
				...entity,
				// Add helper data
				hasSanctions: entity.properties.topics?.includes('sanction'),
				isPep: entity.properties.topics?.includes('role.pep'),
				isOligarch: entity.properties.topics?.includes('role.oligarch'),
				datasets: entity.datasets || [],
				// First values for easy access
				name: entity.properties.name?.[0] || entity.caption,
				birthDate: entity.properties.birthDate?.[0],
				birthPlace: entity.properties.birthPlace?.[0],
				nationality: entity.properties.nationality?.[0],
				position: entity.properties.position?.[0],
				country: entity.properties.country?.[0],
				description: entity.properties.description?.[0]
			};

			return template(context);

		} catch (error) {
			console.error('Error generating templated body:', error);
			return this.generateDefaultBody(entity);
		}
	}

	private generateDefaultBody(entity: OpenSanctionsEntity): string {
		const lines: string[] = [];

		lines.push('## BLUF');
		lines.push('');
		lines.push('> [!NOTE] Notes of Interest');

		// Add sanction status
		if (entity.properties.topics?.includes('sanction')) {
			const datasets = entity.datasets?.slice(0, 3).join(', ') || 'Unknown sources';
			const moreText = entity.datasets && entity.datasets.length > 3 ? ` +${entity.datasets.length - 3} more` : '';
			lines.push(`> - Sanctioned: ${datasets}${moreText}`);
		}

		if (entity.properties.topics?.includes('role.pep')) {
			lines.push('> - PEP Status: Yes');
		}

		if (entity.properties.topics?.includes('role.oligarch')) {
			lines.push('> - Category: Oligarch');
		}

		if (entity.properties.topics?.includes('wanted')) {
			lines.push('> - Status: Wanted');
		}

		// Add aliases section if available
		const aliases = entity.properties.name || entity.properties.alias;
		if (aliases && aliases.length > 1) {
			lines.push('');
			lines.push('> [!IDEA] Also Known As:');
			aliases.slice(0, 5).forEach(alias => {
				if (alias !== entity.caption) {
					lines.push(`> - ${alias}`);
				}
			});
		}

		lines.push('');
		lines.push('## Description');
		lines.push('');

		// Add description
		if (entity.properties.description && entity.properties.description[0]) {
			lines.push(entity.properties.description[0]);
		} else if (entity.properties.position && entity.properties.position[0]) {
			lines.push(entity.properties.position[0]);
		} else {
			lines.push(`${entity.schema} entity from OpenSanctions database.`);
		}

		// Add basic information section
		if (entity.schema === 'Person') {
			this.addPersonInfo(lines, entity);
		} else if (entity.schema === 'Company' || entity.schema === 'LegalEntity') {
			this.addCompanyInfo(lines, entity);
		}

		lines.push('');
		lines.push('#### See Also');
		lines.push('');
		lines.push(`*Imported from [OpenSanctions](https://opensanctions.org/entities/${entity.id})*`);

		return lines.join('\n');
	}

	private addPersonInfo(lines: string[], entity: OpenSanctionsEntity) {
		const info = [];

		if (entity.properties.birthDate?.[0]) {
			info.push(`**Born:** ${entity.properties.birthDate[0]}`);
		}

		if (entity.properties.birthPlace?.[0]) {
			info.push(`**Birth Place:** ${entity.properties.birthPlace[0]}`);
		}

		if (entity.properties.nationality?.[0]) {
			const nationality = entity.properties.nationality[0];
			info.push(`**Nationality:** ${nationality}`);
		}

		if (info.length > 0) {
			lines.push('');
			lines.push('### Personal Information');
			lines.push('');
			info.forEach(item => lines.push(item));
		}
	}

	private addCompanyInfo(lines: string[], entity: OpenSanctionsEntity) {
		const info = [];

		if (entity.properties.country?.[0]) {
			info.push(`**Country:** ${entity.properties.country[0]}`);
		}

		if (entity.properties.jurisdiction?.[0]) {
			info.push(`**Jurisdiction:** ${entity.properties.jurisdiction[0]}`);
		}

		if (entity.properties.incorporationDate?.[0]) {
			info.push(`**Incorporated:** ${entity.properties.incorporationDate[0]}`);
		}

		if (entity.properties.registrationNumber?.[0]) {
			info.push(`**Registration Number:** ${entity.properties.registrationNumber[0]}`);
		}

		if (info.length > 0) {
			lines.push('');
			lines.push('### Company Information');
			lines.push('');
			info.forEach(item => lines.push(item));
		}
	}

	async createNoteWithContent(entity: OpenSanctionsEntity, content: string): Promise<TFile> {
		const filename = this.generateFilename(entity);
		const folder = this.settings.defaultFolder || 'OpenSanctions';

		// Ensure folder exists
		await this.ensureFolderExists(folder);

		// Full path for the note
		const fullPath = folder ? `${folder}/${filename}` : filename;

		// Check if file already exists
		const existingFile = this.app.vault.getAbstractFileByPath(fullPath);

		if (existingFile && existingFile instanceof TFile) {
			if (this.settings.overwriteExisting) {
				// Overwrite existing file
				await this.app.vault.modify(existingFile, content);
				return existingFile;
			} else {
				// Create numbered copy
				const numberedPath = await this.findUniqueFilename(fullPath);
				return await this.app.vault.create(numberedPath, content);
			}
		} else {
			// Create new file
			return await this.app.vault.create(fullPath, content);
		}
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		if (!folderPath) return;

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	private async findUniqueFilename(basePath: string): Promise<string> {
		const pathParts = basePath.split('.');
		const extension = pathParts.pop();
		const basePathWithoutExt = pathParts.join('.');

		let counter = 1;
		let newPath = `${basePathWithoutExt} (${counter}).${extension}`;

		while (this.app.vault.getAbstractFileByPath(newPath)) {
			counter++;
			newPath = `${basePathWithoutExt} (${counter}).${extension}`;
		}

		return newPath;
	}
}