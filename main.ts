import { App, Plugin, PluginSettingTab, Setting, Notice, Modal, Component } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS, OpenSanctionsEntity, SearchParams, SearchResponse, EnrichedEntity } from './src/types';
import { OpenSanctionsApiClient } from './src/api-client';
import { SearchModal } from './src/search-modal';
import { FieldConfigModal } from './src/field-config-modal';
import { NoteGenerator } from './src/note-generator';

export default class OpenSanctionsPlugin extends Plugin {
	settings: PluginSettings;
	apiClient: OpenSanctionsApiClient;

	async onload() {
		await this.loadSettings();

		// Initialize API client
		this.apiClient = new OpenSanctionsApiClient(this.settings.apiKey);

		// Add ribbon icon
		const ribbonIconEl = this.addRibbonIcon('search', 'Search OpenSanctions', (evt: MouseEvent) => {
			this.openSearchModal();
		});
		ribbonIconEl.addClass('opensanctions-ribbon-class');

		// Add command
		this.addCommand({
			id: 'search-opensanctions',
			name: 'Search OpenSanctions',
			callback: () => {
				this.openSearchModal();
			}
		});

		// Add settings tab
		this.addSettingTab(new OpenSanctionsSettingTab(this.app, this));

		// Status notice
		if (!this.settings.apiKey) {
			new Notice('OpenSanctions: Please set your API key in plugin settings');
		}
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update API client key if changed
		if (this.apiClient) {
			this.apiClient.updateApiKey(this.settings.apiKey);
		}
	}

	openSearchModal() {
		if (!this.settings.apiKey) {
			new Notice('Please set your OpenSanctions API key in plugin settings first');
			return;
		}

		const modal = new SearchModal(this.app, this.apiClient, this.settings);
		modal.setHandler(this, this.handleEntitySelection);
		modal.open();
	}

	async handleEntitySelection(selectedEntities: OpenSanctionsEntity[]) {
		const noteGenerator = new NoteGenerator(this.app, this.settings);

		for (const entity of selectedEntities) {
			try {
				// Fetch full entity details with relationships
				const enrichedEntity = await this.apiClient.fetchWithRelationships(entity.id);

				// Generate note
				await noteGenerator.generateNote(enrichedEntity);

				new Notice(`Created note: ${entity.caption}`);
			} catch (error) {
				console.error('Error creating note for entity:', entity.caption, error);
				new Notice(`Error creating note for ${entity.caption}: ${error.message}`);
			}
		}
	}
}

class OpenSanctionsSettingTab extends PluginSettingTab {
	plugin: OpenSanctionsPlugin;

	constructor(app: App, plugin: OpenSanctionsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'OpenSanctions Importer Settings' });

		// API Configuration
		containerEl.createEl('h3', { text: 'API Configuration' });

		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Your OpenSanctions API key (get one at opensanctions.org)')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('Test Connection')
				.setCta()
				.onClick(async () => {
					await this.testApiConnection();
				}));

		// Default Import Settings
		containerEl.createEl('h3', { text: 'Default Import Settings' });

		new Setting(containerEl)
			.setName('Destination Folder')
			.setDesc('Default folder for imported notes')
			.addText(text => text
				.setPlaceholder('OpenSanctions')
				.setValue(this.plugin.settings.defaultFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Overwrite Existing Notes')
			.setDesc('Overwrite existing notes with the same name')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.overwriteExisting)
				.onChange(async (value) => {
					this.plugin.settings.overwriteExisting = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Include Source URL')
			.setDesc('Add source URL to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeSourceUrl)
				.onChange(async (value) => {
					this.plugin.settings.includeSourceUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add Import Date')
			.setDesc('Add import date to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.includeImportDate)
				.onChange(async (value) => {
					this.plugin.settings.includeImportDate = value;
					await this.plugin.saveSettings();
				}));

		// Field Configuration
		containerEl.createEl('h3', { text: 'Field Configuration' });

		const fieldConfigContainer = containerEl.createDiv();
		this.addFieldConfigSettings(fieldConfigContainer);
	}

	addFieldConfigSettings(container: HTMLElement) {
		const schemas = ['Person', 'Company', 'LegalEntity', 'Vessel', 'Airplane'];

		schemas.forEach(schema => {
			new Setting(container)
				.setName(`Configure ${schema} Fields`)
				.setDesc(`Configure field mapping for ${schema} entities`)
				.addButton(button => button
					.setButtonText('Configure')
					.onClick(() => {
						this.openFieldConfigModal(schema);
					}));
		});
	}

	async testApiConnection() {
		if (!this.plugin.settings.apiKey) {
			new Notice('Please enter an API key first');
			return;
		}

		try {
			new Notice('Testing API connection...');

			// Simple test search
			const result = await this.plugin.apiClient.search({
				query: 'test',
				limit: 1
			});

			new Notice(`✓ Connected! Found ${result.total.value} entities available`);
		} catch (error) {
			console.error('API connection test failed:', error);
			new Notice(`✗ Connection failed: ${error.message}`);
		}
	}

	openFieldConfigModal(schema: string) {
		const modal = new FieldConfigModal(
			this.app,
			schema,
			this.plugin.settings.fieldConfigs[schema] || {},
			(updatedConfig) => {
				this.plugin.settings.fieldConfigs[schema] = updatedConfig;
				this.plugin.saveSettings();
			}
		);
		modal.open();
	}
}