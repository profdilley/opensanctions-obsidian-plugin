import { App, Modal, Setting } from 'obsidian';
import { FieldConfig, FieldConfigItem, DEFAULT_FIELD_CONFIGS } from './types';

export class FieldConfigModal extends Modal {
	private schema: string;
	private fieldConfig: FieldConfig;
	private onSave: (config: FieldConfig) => void;
	private tempConfig: FieldConfig;

	constructor(
		app: App,
		schema: string,
		fieldConfig: FieldConfig,
		onSave: (config: FieldConfig) => void
	) {
		super(app);
		this.schema = schema;
		this.fieldConfig = fieldConfig;
		this.onSave = onSave;

		// Create a working copy
		this.tempConfig = JSON.parse(JSON.stringify(this.fieldConfig));

		// Ensure we have default config for this schema
		if (Object.keys(this.tempConfig).length === 0 && DEFAULT_FIELD_CONFIGS[schema]) {
			this.tempConfig = JSON.parse(JSON.stringify(DEFAULT_FIELD_CONFIGS[schema]));
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: `Configure ${this.schema} Fields` });

		// Instructions
		const instructionsEl = contentEl.createEl('p', {
			text: 'Configure which fields to include in notes and whether they should be formatted as wikilinks.'
		});
		instructionsEl.addClass('setting-item-description');

		// Create table-like structure
		const tableContainer = contentEl.createDiv('field-config-table');

		// Header
		const headerRow = tableContainer.createDiv('field-config-row field-config-header');
		headerRow.createEl('div', { text: 'API Field', cls: 'field-config-cell' });
		headerRow.createEl('div', { text: 'YAML Key', cls: 'field-config-cell' });
		headerRow.createEl('div', { text: 'Include', cls: 'field-config-cell' });
		headerRow.createEl('div', { text: 'Wikilink', cls: 'field-config-cell' });

		// Field rows
		for (const [apiField, config] of Object.entries(this.tempConfig)) {
			this.createFieldRow(tableContainer, apiField, config);
		}

		// Add new field section
		this.createAddFieldSection(contentEl);

		// Action buttons
		const buttonContainer = contentEl.createDiv('modal-button-container');

		const resetButton = buttonContainer.createEl('button', { text: 'Reset to Defaults' });
		resetButton.addEventListener('click', () => {
			this.resetToDefaults();
		});

		const saveButton = buttonContainer.createEl('button', {
			text: 'Save Configuration',
			cls: 'mod-cta'
		});
		saveButton.addEventListener('click', () => {
			this.saveConfiguration();
		});

		// Add CSS styles
		this.addStyles();
	}

	private createFieldRow(container: HTMLElement, apiField: string, config: FieldConfigItem) {
		const row = container.createDiv('field-config-row');

		// API Field (read-only)
		const fieldCell = row.createDiv('field-config-cell');
		fieldCell.createEl('span', { text: apiField });

		// YAML Key (editable)
		const yamlCell = row.createDiv('field-config-cell');
		const yamlInput = yamlCell.createEl('input', {
			type: 'text',
			value: config.yamlKey || apiField
		});
		yamlInput.addEventListener('input', (e) => {
			const target = e.target as HTMLInputElement;
			this.tempConfig[apiField].yamlKey = target.value;
		});

		// Include checkbox
		const includeCell = row.createDiv('field-config-cell');
		const includeCheckbox = includeCell.createEl('input', {
			type: 'checkbox'
		});
		includeCheckbox.checked = config.include;
		includeCheckbox.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			this.tempConfig[apiField].include = target.checked;

			// If unchecked, also uncheck wikilink
			if (!target.checked) {
				this.tempConfig[apiField].wikilink = false;
				wikilinkCheckbox.checked = false;
			}
		});

		// Wikilink checkbox
		const wikilinkCell = row.createDiv('field-config-cell');
		const wikilinkCheckbox = wikilinkCell.createEl('input', {
			type: 'checkbox'
		});
		wikilinkCheckbox.checked = config.wikilink;
		wikilinkCheckbox.addEventListener('change', (e) => {
			const target = e.target as HTMLInputElement;
			this.tempConfig[apiField].wikilink = target.checked;

			// If checked, also check include
			if (target.checked) {
				this.tempConfig[apiField].include = true;
				includeCheckbox.checked = true;
			}
		});

		// Delete button
		const deleteCell = row.createDiv('field-config-cell');
		const deleteButton = deleteCell.createEl('button', {
			text: '×',
			cls: 'field-config-delete'
		});
		deleteButton.addEventListener('click', () => {
			delete this.tempConfig[apiField];
			row.remove();
		});
	}

	private createAddFieldSection(container: HTMLElement) {
		const addSection = container.createDiv('add-field-section');
		addSection.createEl('h3', { text: 'Add Custom Field' });

		const addContainer = addSection.createDiv('add-field-container');

		const apiFieldInput = addContainer.createEl('input', {
			type: 'text',
			placeholder: 'API field name'
		});

		const yamlKeyInput = addContainer.createEl('input', {
			type: 'text',
			placeholder: 'YAML key (optional)'
		});

		const addButton = addContainer.createEl('button', { text: 'Add Field' });
		addButton.addEventListener('click', () => {
			const apiField = apiFieldInput.value.trim();
			const yamlKey = yamlKeyInput.value.trim() || apiField;

			if (apiField && !this.tempConfig[apiField]) {
				this.tempConfig[apiField] = {
					include: true,
					wikilink: false,
					yamlKey: yamlKey
				};

				// Re-render the modal to show the new field
				this.onOpen();
			}
		});

		// Add on Enter key
		const handleEnter = (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				addButton.click();
			}
		};
		apiFieldInput.addEventListener('keydown', handleEnter);
		yamlKeyInput.addEventListener('keydown', handleEnter);
	}

	private resetToDefaults() {
		if (DEFAULT_FIELD_CONFIGS[this.schema]) {
			this.tempConfig = JSON.parse(JSON.stringify(DEFAULT_FIELD_CONFIGS[this.schema]));
			this.onOpen(); // Re-render
		}
	}

	private saveConfiguration() {
		this.onSave(this.tempConfig);
		this.close();
	}

	private addStyles() {
		const styleEl = document.createElement('style');
		styleEl.textContent = `
			.field-config-table {
				margin: 20px 0;
			}

			.field-config-row {
				display: flex;
				align-items: center;
				padding: 8px 0;
				border-bottom: 1px solid var(--background-modifier-border);
			}

			.field-config-header {
				font-weight: bold;
				background: var(--background-secondary);
				padding: 12px 0;
				border-radius: 4px;
			}

			.field-config-cell {
				flex: 1;
				padding: 0 8px;
			}

			.field-config-cell input[type="text"] {
				width: 100%;
				padding: 4px 8px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 3px;
				background: var(--background-primary);
			}

			.field-config-cell input[type="checkbox"] {
				margin: 0;
			}

			.field-config-delete {
				background: var(--background-modifier-error);
				color: white;
				border: none;
				width: 24px;
				height: 24px;
				border-radius: 50%;
				cursor: pointer;
				font-weight: bold;
			}

			.field-config-delete:hover {
				background: var(--background-modifier-error-hover);
			}

			.add-field-section {
				margin-top: 30px;
				padding-top: 20px;
				border-top: 2px solid var(--background-modifier-border);
			}

			.add-field-container {
				display: flex;
				gap: 10px;
				margin-top: 10px;
			}

			.add-field-container input {
				flex: 1;
				padding: 8px 12px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
			}

			.add-field-container button {
				padding: 8px 16px;
				background: var(--interactive-accent);
				color: white;
				border: none;
				border-radius: 4px;
				cursor: pointer;
			}

			.modal-button-container {
				display: flex;
				justify-content: flex-end;
				gap: 10px;
				margin-top: 30px;
				padding-top: 20px;
				border-top: 1px solid var(--background-modifier-border);
			}

			.modal-button-container button {
				padding: 10px 20px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				cursor: pointer;
			}

			.modal-button-container button.mod-cta {
				background: var(--interactive-accent);
				color: white;
				border-color: var(--interactive-accent);
			}
		`;
		document.head.appendChild(styleEl);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}