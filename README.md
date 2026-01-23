# OpenSanctions Obsidian Plugin

Import entities from the OpenSanctions API into Obsidian notes with automatic wikilinks and graph connections for sanctions compliance research.

## Features

- **Direct API Integration**: Search and import entities directly from OpenSanctions
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

## Usage

1. Click the search icon in the ribbon or use the "Search OpenSanctions" command
2. Enter search terms and apply filters
3. Select entities from the results
4. Click "Import Selected" to create notes

## Field Configuration

The plugin allows you to configure which fields from the OpenSanctions API are included in your notes and whether they should be formatted as wikilinks. Default configurations are provided for:

- **Person**: birthPlace, nationality, relationships → wikilinks
- **Company**: country, jurisdiction, ownership → wikilinks
- **Legal Entity**: country, jurisdiction → wikilinks

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