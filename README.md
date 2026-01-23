# OpenSanctions Obsidian Plugin

Import entities from the OpenSanctions API into Obsidian notes with automatic wikilinks and graph connections for sanctions compliance research. Features both detailed configuration workflows and streamlined Quick Import for power users.

## Features

- **Direct API Integration**: Search and import entities directly from OpenSanctions
- **Dual Import Workflows**:
  - **Standard Mode**: Search → Filter → Preview → Configure → Import (full control)
  - **Quick Import Mode**: Search → Filter → Import (streamlined for power users)
- **Smart Configuration Memory**: Quick Import remembers your last-used field settings per entity type
- **Automatic Graph Connections**: Creates `[[wikilinks]]` for geographic and relationship fields
- **Configurable Field Mapping**: Customize which fields to include and how they map to YAML frontmatter
- **Template Support**: Optional Handlebars templates for note body customization
- **Relationship Processing**: Fetches and includes entity relationships (ownership, directorships, family)
- **Multiple Entity Types**: Supports Person, Company, Vessel, and other entity schemas

## Setup

1. Get an API key from [OpenSanctions](https://opensanctions.org/)
2. Install the plugin in Obsidian
3. Enter your API key in the plugin settings
4. Configure field mappings for different entity types
5. Enable Quick Import and configure memory preferences (optional)

## Usage

### Standard Mode (Full Control)

1. Click the **search icon** (🔍) in the ribbon or use the "Search OpenSanctions" command
2. Enter search terms and apply filters
3. Select entities from the results
4. Click "Preview Note" to review before importing (optional)
5. Click "Import Selected" to create notes

### Quick Import Mode (Streamlined)

1. Click the **lightning bolt icon** (⚡) in the ribbon or use the "Quick Import OpenSanctions" command
2. Enter search terms and apply filters
3. Select entities from the results
4. Click "Quick Import Selected" to create notes immediately

**Quick Import Benefits:**
- Skips the preview step for faster workflow
- Automatically uses your last-configured field settings for each entity type
- Perfect for bulk imports when you've already established preferred configurations

## Field Configuration

The plugin allows you to configure which fields from the OpenSanctions API are included in your notes and whether they should be formatted as wikilinks. Default configurations are provided for:

- **Person**: birthPlace, nationality, relationships → wikilinks
- **Company**: country, jurisdiction, ownership → wikilinks
- **Legal Entity**: country, jurisdiction → wikilinks

## Quick Import Configuration

### Settings

Access Quick Import settings in the plugin configuration panel:

- **Enable Quick Import**: Toggle the Quick Import functionality on/off
- **Remember Field Configurations**: Controls whether Quick Import uses your last-used field settings

### How Configuration Memory Works

1. **First Time**: Quick Import uses your current field configuration settings
2. **After Standard Mode**: When you import using Standard Mode, those field settings are automatically saved as "last-used" for each entity type
3. **Quick Import Usage**: Quick Import automatically applies your last-used field settings for each entity type
4. **Per-Schema Memory**: Each entity type (Person, Company, etc.) remembers its own field configuration independently

This system ensures that once you've configured your preferred settings for each entity type, Quick Import will consistently use those preferences without requiring manual reconfiguration.

## Development

```bash
# Install dependencies
npm install

# Development build with watch
npm run dev

# Production build
npm run build
```

## License

MIT