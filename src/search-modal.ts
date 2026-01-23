import { App, Modal, Setting, Notice } from 'obsidian';
import { OpenSanctionsApiClient } from './api-client';
import { PluginSettings, OpenSanctionsEntity, SearchParams, ImportMode } from './types';
import { PreviewModal } from './preview-modal';

export class SearchModal extends Modal {
	private apiClient: OpenSanctionsApiClient;
	private settings: PluginSettings;
	private mode: ImportMode;
	private onSelect: (entities: OpenSanctionsEntity[]) => void;
	private searchResults: OpenSanctionsEntity[] = [];
	private selectedEntities: Set<string> = new Set();
	private currentSearchParams: SearchParams = { query: '' };
	private totalResults = 0;
	private currentOffset = 0;
	private isLoading = false;

	constructor(app: App, apiClient: OpenSanctionsApiClient, settings: PluginSettings, mode: ImportMode = ImportMode.STANDARD) {
		super(app);
		this.apiClient = apiClient;
		this.settings = settings;
		this.mode = mode;
	}

	setHandler(caller: any, handler: (entities: OpenSanctionsEntity[]) => void) {
		this.onSelect = handler;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const title = this.mode === ImportMode.QUICK ? 'Quick Import - OpenSanctions' : 'Search OpenSanctions';
		contentEl.createEl('h2', { text: title });

		this.createSearchForm(contentEl);
		this.createResultsSection(contentEl);
		this.createActionButtons(contentEl);

		this.addStyles();
	}

	private createSearchForm(container: HTMLElement) {
		const formContainer = container.createDiv('search-form-container');

		// Search input
		const searchSetting = new Setting(formContainer)
			.setName('Search Query')
			.setDesc('Enter search terms (name, company, etc.)');

		const searchInput = searchSetting.controlEl.createEl('input', {
			type: 'text',
			placeholder: 'Enter search terms...'
		});
		searchInput.style.width = '300px';
		searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				this.performSearch();
			}
		});

		const searchButton = searchSetting.controlEl.createEl('button', {
			text: 'Search',
			cls: 'mod-cta'
		});
		searchButton.style.marginLeft = '10px';
		searchButton.addEventListener('click', () => {
			this.performSearch();
		});

		// Filters section
		const filtersContainer = formContainer.createDiv('search-filters');
		this.createFilters(filtersContainer);

		// Store references for easy access
		this.searchInput = searchInput;
	}

	private createFilters(container: HTMLElement) {
		const filtersRow = container.createDiv('filters-row');

		// Entity Type filter
		new Setting(filtersRow)
			.setName('Entity Type')
			.addDropdown(dropdown => {
				dropdown.addOption('', 'All Types');
				dropdown.addOption('Person', 'Person');
				dropdown.addOption('Company', 'Company');
				dropdown.addOption('LegalEntity', 'Legal Entity');
				dropdown.addOption('Vessel', 'Vessel');
				dropdown.addOption('Airplane', 'Airplane');
				dropdown.addOption('CryptoWallet', 'Crypto Wallet');
				dropdown.onChange((value) => {
					this.currentSearchParams.schema = value || undefined;
				});
			});

		// Topics filter
		new Setting(filtersRow)
			.setName('Topics')
			.addDropdown(dropdown => {
				dropdown.addOption('', 'Any Topic');
				dropdown.addOption('sanction', 'Sanctioned');
				dropdown.addOption('role.pep', 'Politicians (PEP)');
				dropdown.addOption('role.rca', 'Close Associates');
				dropdown.addOption('role.oligarch', 'Oligarchs');
				dropdown.addOption('wanted', 'Wanted');
				dropdown.addOption('debarment', 'Debarred');
				dropdown.onChange((value) => {
					this.currentSearchParams.topics = value ? [value] : undefined;
				});
			});

		// Dataset filter
		new Setting(filtersRow)
			.setName('Dataset')
			.addDropdown(dropdown => {
				dropdown.addOption('', 'All Datasets');
				dropdown.addOption('us_ofac_sdn', 'US OFAC SDN');
				dropdown.addOption('eu_fsf', 'EU Financial Sanctions');
				dropdown.addOption('gb_hmt_sanctions', 'UK HMT Sanctions');
				dropdown.addOption('ca_dfatd_sema_sanctions', 'Canada SEMA');
				dropdown.addOption('au_dfat_sanctions', 'Australia DFAT');
				dropdown.addOption('un_sc_sanctions', 'UN Security Council');
				dropdown.onChange((value) => {
					this.currentSearchParams.dataset = value || undefined;
				});
			});
	}

	private createResultsSection(container: HTMLElement) {
		this.resultsContainer = container.createDiv('search-results-container');
		this.createResultsHeader();
	}

	private createResultsHeader() {
		this.resultsHeader = this.resultsContainer.createDiv('results-header');
		this.updateResultsHeader();
	}

	private updateResultsHeader() {
		this.resultsHeader.empty();

		if (this.totalResults > 0) {
			this.resultsHeader.createEl('h3', {
				text: `Results (showing ${this.searchResults.length} of ${this.totalResults})`
			});
		} else if (this.searchResults.length === 0 && this.currentSearchParams.query) {
			this.resultsHeader.createEl('p', {
				text: 'No results found. Try adjusting your search terms or filters.',
				cls: 'no-results'
			});
		}
	}

	private createResultsList() {
		// Remove existing results list
		const existingList = this.resultsContainer.querySelector('.results-list');
		if (existingList) {
			existingList.remove();
		}

		if (this.searchResults.length === 0) {
			return;
		}

		const resultsList = this.resultsContainer.createDiv('results-list');

		for (const entity of this.searchResults) {
			this.createEntityRow(resultsList, entity);
		}

		// Load more button
		if (this.searchResults.length < this.totalResults) {
			const loadMoreButton = resultsList.createEl('button', {
				text: 'Load More...',
				cls: 'load-more-button'
			});
			loadMoreButton.addEventListener('click', () => {
				this.loadMore();
			});
		}
	}

	private createEntityRow(container: HTMLElement, entity: OpenSanctionsEntity) {
		const row = container.createDiv('entity-row');
		if (this.selectedEntities.has(entity.id)) {
			row.addClass('selected');
		}

		// Checkbox
		const checkbox = row.createEl('input', {
			type: 'checkbox'
		});
		checkbox.checked = this.selectedEntities.has(entity.id);
		checkbox.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			if (target.checked) {
				this.selectedEntities.add(entity.id);
				row.addClass('selected');
			} else {
				this.selectedEntities.delete(entity.id);
				row.removeClass('selected');
			}
			this.updateActionButtons();
		});

		// Entity info
		const infoContainer = row.createDiv('entity-info');

		// Title
		const title = infoContainer.createEl('div', {
			text: entity.caption,
			cls: 'entity-title'
		});

		// Metadata
		const metadata = infoContainer.createEl('div', { cls: 'entity-metadata' });

		// Schema and country
		const schemaText = entity.schema;
		const countryText = this.getCountryName(entity.properties.country?.[0] || entity.properties.nationality?.[0]);
		const locationText = countryText ? ` | ${countryText}` : '';

		// Topics (simplified)
		const topics = entity.properties.topics || [];
		const topicLabels: string[] = [];
		if (topics.includes('sanction')) topicLabels.push('Sanctioned');
		if (topics.includes('role.pep')) topicLabels.push('PEP');
		if (topics.includes('role.oligarch')) topicLabels.push('Oligarch');
		if (topics.includes('wanted')) topicLabels.push('Wanted');

		const topicsText = topicLabels.length > 0 ? ` | ${topicLabels.join(', ')}` : '';

		metadata.createEl('span', {
			text: `${schemaText}${locationText}${topicsText}`
		});

		// Datasets
		if (entity.datasets && entity.datasets.length > 0) {
			const datasetsText = entity.datasets.slice(0, 3).join(', ');
			const moreText = entity.datasets.length > 3 ? ` +${entity.datasets.length - 3} more` : '';
			metadata.createEl('div', {
				text: `Sources: ${datasetsText}${moreText}`,
				cls: 'entity-datasets'
			});
		}

		// Click to select
		row.addEventListener('click', (e) => {
			if (e.target !== checkbox) {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
			}
		});
	}

	private createActionButtons(container: HTMLElement) {
		this.actionContainer = container.createDiv('action-buttons');
		this.updateActionButtons();
	}

	private updateActionButtons() {
		this.actionContainer.empty();

		const selectedCount = this.selectedEntities.size;
		const buttonContainer = this.actionContainer.createDiv('button-container');

		if (selectedCount > 0) {
			// Mode indicator
			const modeIndicator = buttonContainer.createEl('span', {
				text: this.mode === ImportMode.QUICK ? 'Quick Import Mode' : 'Standard Mode',
				cls: 'mode-indicator'
			});

			const selectionInfo = buttonContainer.createEl('span', {
				text: `Selected: ${selectedCount} entit${selectedCount === 1 ? 'y' : 'ies'}`,
				cls: 'selection-info'
			});

			if (this.mode === ImportMode.STANDARD) {
				// Standard mode: Preview + Import buttons
				const previewButton = buttonContainer.createEl('button', {
					text: 'Preview Note'
				});
				previewButton.addEventListener('click', () => {
					this.previewSelected();
				});

				const importButton = buttonContainer.createEl('button', {
					text: 'Import Selected',
					cls: 'mod-cta'
				});
				importButton.addEventListener('click', () => {
					this.importSelected();
				});
			} else {
				// Quick mode: Direct import only
				const quickImportButton = buttonContainer.createEl('button', {
					text: 'Quick Import Selected',
					cls: 'mod-cta quick-import-btn'
				});
				quickImportButton.addEventListener('click', () => {
					this.quickImportSelected();
				});
			}
		}
	}

	private async performSearch() {
		if (this.isLoading) return;

		const query = this.searchInput.value.trim();
		if (!query) {
			new Notice('Please enter search terms');
			return;
		}

		this.isLoading = true;
		this.currentSearchParams.query = query;
		this.currentSearchParams.limit = 20;
		this.currentSearchParams.offset = 0;
		this.currentOffset = 0;

		try {
			this.showLoadingState();

			const response = await this.apiClient.search(this.currentSearchParams);

			this.searchResults = response.results || [];
			this.totalResults = response.total?.value || 0;
			this.selectedEntities.clear();

			this.updateResultsHeader();
			this.createResultsList();
			this.updateActionButtons();

		} catch (error) {
			console.error('Search failed:', error);
			new Notice(`Search failed: ${error.message}`);
		} finally {
			this.hideLoadingState();
			this.isLoading = false;
		}
	}

	private async loadMore() {
		if (this.isLoading || this.searchResults.length >= this.totalResults) return;

		this.isLoading = true;
		this.currentOffset += 20;
		this.currentSearchParams.offset = this.currentOffset;

		try {
			const response = await this.apiClient.search(this.currentSearchParams);
			this.searchResults.push(...(response.results || []));

			this.updateResultsHeader();
			this.createResultsList();

		} catch (error) {
			console.error('Load more failed:', error);
			new Notice(`Failed to load more results: ${error.message}`);
		} finally {
			this.isLoading = false;
		}
	}

	private showLoadingState() {
		const loadingEl = this.resultsContainer.createDiv('loading-state');
		loadingEl.createEl('p', { text: 'Searching...' });
	}

	private hideLoadingState() {
		const loadingEl = this.resultsContainer.querySelector('.loading-state');
		if (loadingEl) {
			loadingEl.remove();
		}
	}

	private previewSelected() {
		if (this.selectedEntities.size === 0) return;

		// Preview the first selected entity
		const firstSelectedId = Array.from(this.selectedEntities)[0];
		const entity = this.searchResults.find(e => e.id === firstSelectedId);

		if (entity) {
			const previewModal = new PreviewModal(this.app, entity, this.settings);
			previewModal.open();
		}
	}

	private importSelected() {
		const selectedResults = this.searchResults.filter(e => this.selectedEntities.has(e.id));

		if (selectedResults.length === 0) {
			new Notice('No entities selected');
			return;
		}

		// Track usage for each schema
		this.trackConfigUsage(selectedResults);

		if (this.onSelect) {
			this.onSelect(selectedResults);
		}

		this.close();
	}

	private quickImportSelected() {
		const selectedResults = this.searchResults.filter(e => this.selectedEntities.has(e.id));

		if (selectedResults.length === 0) {
			new Notice('No entities selected');
			return;
		}

		// For Quick Import mode, temporarily use last-used field configurations
		const originalFieldConfigs = { ...this.settings.fieldConfigs };

		if (this.settings.quickImportSettings.rememberLastConfig) {
			// Apply last-used configs for the schemas being imported
			const schemas = [...new Set(selectedResults.map(e => e.schema))];
			schemas.forEach(schema => {
				if (this.settings.lastUsedFieldConfigs[schema]) {
					this.settings.fieldConfigs[schema] = { ...this.settings.lastUsedFieldConfigs[schema] };
				}
			});
		}

		try {
			if (this.onSelect) {
				this.onSelect(selectedResults);
			}
		} finally {
			// Restore original field configs
			this.settings.fieldConfigs = originalFieldConfigs;
		}

		this.close();
	}

	private trackConfigUsage(entities: OpenSanctionsEntity[]) {
		if (this.mode === ImportMode.STANDARD) {
			// Save current configs as last-used for each schema encountered
			const schemas = [...new Set(entities.map(e => e.schema))];
			schemas.forEach(schema => {
				if (this.settings.fieldConfigs[schema]) {
					this.settings.lastUsedFieldConfigs[schema] = { ...this.settings.fieldConfigs[schema] };
				}
			});
			// Note: settings will be saved by parent after import completes
		}
	}

	private getCountryName(countryCode: string): string {
		// Simple country code to name mapping for common codes
		const countryMap: Record<string, string> = {
			'ru': 'Russia',
			'us': 'United States',
			'gb': 'United Kingdom',
			'de': 'Germany',
			'fr': 'France',
			'cn': 'China',
			'ua': 'Ukraine',
			'by': 'Belarus',
			'kz': 'Kazakhstan',
			'ch': 'Switzerland',
			'ca': 'Canada',
			'au': 'Australia',
			'jp': 'Japan'
		};

		return countryMap[countryCode] || countryCode;
	}

	private addStyles() {
		const styleEl = document.createElement('style');
		styleEl.textContent = `
			.search-form-container {
				margin-bottom: 20px;
			}

			.search-filters {
				margin-top: 15px;
			}

			.filters-row {
				display: flex;
				flex-wrap: wrap;
				gap: 15px;
			}

			.filters-row .setting-item {
				border: none;
				padding: 0;
				margin: 0;
			}

			.search-results-container {
				max-height: 400px;
				overflow-y: auto;
			}

			.results-header h3 {
				margin: 10px 0;
				color: var(--text-normal);
			}

			.no-results {
				color: var(--text-muted);
				font-style: italic;
				margin: 20px 0;
			}

			.results-list {
				margin: 10px 0;
			}

			.entity-row {
				display: flex;
				align-items: flex-start;
				padding: 12px;
				margin: 8px 0;
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				cursor: pointer;
				transition: background-color 0.2s;
			}

			.entity-row:hover {
				background-color: var(--background-modifier-hover);
			}

			.entity-row.selected {
				background-color: var(--background-modifier-active-hover);
				border-color: var(--interactive-accent);
			}

			.entity-row input[type="checkbox"] {
				margin-right: 12px;
				margin-top: 2px;
			}

			.entity-info {
				flex: 1;
			}

			.entity-title {
				font-weight: 600;
				color: var(--text-normal);
				margin-bottom: 4px;
			}

			.entity-metadata {
				font-size: 0.9em;
				color: var(--text-muted);
			}

			.entity-datasets {
				margin-top: 2px;
				font-size: 0.85em;
			}

			.load-more-button {
				width: 100%;
				padding: 10px;
				margin: 15px 0;
				background: var(--background-secondary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				cursor: pointer;
			}

			.load-more-button:hover {
				background: var(--background-modifier-hover);
			}

			.action-buttons {
				margin-top: 20px;
				padding-top: 15px;
				border-top: 1px solid var(--background-modifier-border);
			}

			.button-container {
				display: flex;
				align-items: center;
				justify-content: space-between;
				flex-wrap: wrap;
				gap: 10px;
			}

			.mode-indicator {
				color: var(--text-accent);
				font-size: 0.85em;
				font-weight: 600;
				padding: 2px 6px;
				background: var(--background-secondary);
				border-radius: 4px;
				border: 1px solid var(--interactive-accent);
			}

			.selection-info {
				color: var(--text-muted);
				font-size: 0.9em;
			}

			.button-container button {
				margin-left: 10px;
				padding: 8px 16px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				cursor: pointer;
			}

			.button-container button.mod-cta {
				background: var(--interactive-accent);
				color: white;
				border-color: var(--interactive-accent);
			}

			.button-container button.quick-import-btn {
				background: var(--color-green);
				border-color: var(--color-green);
				font-weight: 600;
			}

			.loading-state {
				text-align: center;
				padding: 20px;
				color: var(--text-muted);
			}
		`;
		document.head.appendChild(styleEl);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	// Properties to store DOM references
	private searchInput: HTMLInputElement;
	private resultsContainer: HTMLDivElement;
	private resultsHeader: HTMLDivElement;
	private actionContainer: HTMLDivElement;
}