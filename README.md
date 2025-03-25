# BigCommerce WYSIWYG Editor Chrome Extension

This Chrome extension adds TinyMCE WYSIWYG editor functionality to BigCommerce Page Builder, making it easier to edit content with rich text formatting.

## Features

- Automatically detects BigCommerce Page Builder environment
- Adds TinyMCE WYSIWYG editor to text fields
- Supports rich text formatting, links, and basic HTML
- Updates in real-time as you edit content
- Resource management to improve performance
- Visual feedback in popup UI

## Installation

### From Source Code

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The extension should now be installed and active

## API Key for TinyMCE (for Production Use)

This extension uses TinyMCE's free CDN with a "no-api-key" parameter for demonstration purposes. For production use:

1. Register for a free API key at [TinyMCE Cloud](https://www.tiny.cloud/)
2. Replace `no-api-key` in the `content.js` file with your actual API key
3. This will remove the "This domain is not registered with Tiny Cloud" message and enable additional features

## Usage

1. Log in to your BigCommerce admin panel
2. Navigate to Page Builder
3. Edit a text field, and a WYSIWYG editor will automatically appear
4. Use the editor's toolbar to format text, add links, etc.
5. Your changes will be saved automatically to the BigCommerce page

## Troubleshooting

If the editor doesn't appear:
1. Click the extension icon in the Chrome toolbar
2. Click "Refresh Editors" to manually trigger the editors
3. Make sure you're in Page Builder and editing a supported text field
4. Check the browser console for any error messages

## Technical Notes

- The extension uses a MutationObserver to detect new fields added to the DOM
- Resources are properly cleaned up when navigating away from the page
- Error handling is implemented for improved stability
- The extension only activates on BigCommerce domains

## License

This project is open-source and available for your use and modification. 