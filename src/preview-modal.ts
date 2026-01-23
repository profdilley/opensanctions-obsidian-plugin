import { App, Modal, Notice } from 'obsidian';
import { OpenSanctionsEntity, PluginSettings } from './types';
import { NoteGenerator } from './note-generator';

export class PreviewModal extends Modal {
	private entity: OpenSanctionsEntity;
	private settings: PluginSettings;
	private noteGenerator: NoteGenerator;
	private previewContent: string = '';

	constructor(app: App, entity: OpenSanctionsEntity, settings: PluginSettings) {
		super(app);
		this.entity = entity;
		this.settings = settings;
		this.noteGenerator = new NoteGenerator(app, settings);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Generate filename for display
		const filename = this.noteGenerator.generateFilename(this.entity);
		contentEl.createEl('h2', { text: `Preview: ${filename}` });

		// Generate preview content
		await this.generatePreview();

		// Create preview container
		const previewContainer = contentEl.createDiv('preview-container');

		// Create scrollable content area
		const contentArea = previewContainer.createEl('pre', {
			cls: 'preview-content'
		});
		contentArea.textContent = this.previewContent;

		// Action buttons
		const buttonContainer = contentEl.createDiv('preview-buttons');

		const editButton = buttonContainer.createEl('button', {
			text: 'Edit Before Import'
		});
		editButton.addEventListener('click', () => {
			this.editBeforeImport();
		});

		const importButton = buttonContainer.createEl('button', {
			text: 'Import Note',
			cls: 'mod-cta'
		});
		importButton.addEventListener('click', () => {
			this.importNote();
		});

		this.addStyles();
	}

	private async generatePreview() {
		try {
			// Generate the full note content as it would appear
			this.previewContent = await this.noteGenerator.generateNoteContent(this.entity);
		} catch (error) {
			console.error('Error generating preview:', error);
			this.previewContent = `Error generating preview: ${error.message}\n\nPlease check your field configuration and try again.`;
		}
	}

	private editBeforeImport() {
		// Create an editable version of the content
		this.close();

		const editModal = new EditPreviewModal(
			this.app,
			this.entity,
			this.settings,
			this.previewContent,
			async (editedContent: string) => {
				await this.noteGenerator.createNoteWithContent(this.entity, editedContent);
				new Notice(`Created note: ${this.noteGenerator.generateFilename(this.entity)}`);
			}
		);
		editModal.open();
	}

	private async importNote() {
		try {
			await this.noteGenerator.generateNote(this.entity);
			new Notice(`Created note: ${this.noteGenerator.generateFilename(this.entity)}`);
			this.close();
		} catch (error) {
			console.error('Error importing note:', error);
			new Notice(`Error importing note: ${error.message}`);
		}
	}

	private addStyles() {
		const styleEl = document.createElement('style');
		styleEl.textContent = `
			.preview-container {
				margin: 20px 0;
				max-height: 400px;
				overflow-y: auto;
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
			}

			.preview-content {
				padding: 20px;
				margin: 0;
				white-space: pre-wrap;
				font-family: var(--font-monospace);
				font-size: 0.9em;
				line-height: 1.5;
				background: var(--background-secondary);
				border-radius: 6px;
			}

			.preview-buttons {
				display: flex;
				justify-content: flex-end;
				gap: 10px;
				margin-top: 20px;
				padding-top: 15px;
				border-top: 1px solid var(--background-modifier-border);
			}

			.preview-buttons button {
				padding: 10px 20px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				cursor: pointer;
			}

			.preview-buttons button.mod-cta {
				background: var(--interactive-accent);
				color: white;
				border-color: var(--interactive-accent);
			}

			.preview-buttons button:hover {
				background: var(--background-modifier-hover);
			}

			.preview-buttons button.mod-cta:hover {
				background: var(--interactive-accent-hover);
			}
		`;
		document.head.appendChild(styleEl);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class EditPreviewModal extends Modal {
	private entity: OpenSanctionsEntity;
	private settings: PluginSettings;
	private initialContent: string;
	private onSave: (content: string) => void;
	private textArea: HTMLTextAreaElement;

	constructor(
		app: App,
		entity: OpenSanctionsEntity,
		settings: PluginSettings,
		initialContent: string,
		onSave: (content: string) => void
	) {
		super(app);
		this.entity = entity;
		this.settings = settings;
		this.initialContent = initialContent;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		const filename = this.entity.caption || this.entity.id;
		contentEl.createEl('h2', { text: `Edit: ${filename}.md` });

		// Create editable text area
		this.textArea = contentEl.createEl('textarea', {
			cls: 'edit-content'
		});
		this.textArea.value = this.initialContent;

		// Action buttons
		const buttonContainer = contentEl.createDiv('edit-buttons');

		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel'
		});
		cancelButton.addEventListener('click', () => {
			this.close();
		});

		const saveButton = buttonContainer.createEl('button', {
			text: 'Import Note',
			cls: 'mod-cta'
		});
		saveButton.addEventListener('click', () => {
			this.saveAndImport();
		});

		this.addStyles();

		// Focus the text area
		setTimeout(() => this.textArea.focus(), 100);
	}

	private async saveAndImport() {
		const content = this.textArea.value;
		if (content.trim()) {
			await this.onSave(content);
			this.close();
		}
	}

	private addStyles() {
		const styleEl = document.createElement('style');
		styleEl.textContent = `
			.edit-content {
				width: 100%;
				height: 400px;
				padding: 15px;
				margin: 20px 0;
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				background: var(--background-primary);
				font-family: var(--font-monospace);
				font-size: 0.9em;
				line-height: 1.5;
				resize: vertical;
			}

			.edit-buttons {
				display: flex;
				justify-content: flex-end;
				gap: 10px;
				margin-top: 15px;
				padding-top: 15px;
				border-top: 1px solid var(--background-modifier-border);
			}

			.edit-buttons button {
				padding: 10px 20px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-primary);
				cursor: pointer;
			}

			.edit-buttons button.mod-cta {
				background: var(--interactive-accent);
				color: white;
				border-color: var(--interactive-accent);
			}

			.edit-buttons button:hover {
				background: var(--background-modifier-hover);
			}

			.edit-buttons button.mod-cta:hover {
				background: var(--interactive-accent-hover);
			}
		`;
		document.head.appendChild(styleEl);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}