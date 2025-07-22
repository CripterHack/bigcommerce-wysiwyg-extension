# BigCommerce WYSIWYG Editor Chrome Extension

This Chrome extension adds a native WYSIWYG editor to BigCommerce Page Builder, making it easier to edit rich text formatted content.

## Features

- Automatically detects the BigCommerce Page Builder environment
- Adds a native WYSIWYG editor to HTML text fields
- Supports complete text formatting: bold, italic, underline, lists, alignment
- Advanced tools: table insertion, images, color selection
- Updates in real-time while you edit content
- Efficient resource management to improve performance
- Intuitive visual interface
- Native HTML editor (no external library dependencies)
- Compatible with Chrome extension security policies

## Installation

### From the Chrome Web Store (recommended)

1. Visit the [extension page on Chrome Web Store](https://chrome.google.com/webstore/detail/bigcommerce-wysiwyg-editor/ID)
2. Click "Add to Chrome"
3. Confirm installation

### From source code

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The extension should now be installed and active

## About the WYSIWYG editor in this extension

This extension includes a native WYSIWYG editor implemented directly with browser APIs instead of using external libraries like TinyMCE or Quill. This avoids Content Security Policy (CSP) restrictions in Chrome extensions and ensures that the editor works reliably.

Features of the built-in editor:
- Complete formatting tools (bold, italic, underline)
- Text alignment options (left, center, right)
- Link creation and image insertion
- Table creation and editing
- Color picker for text and backgrounds
- Ordered and unordered lists
- Headings and blockquotes
- Compatible with BigCommerce fields

## Usage

1. Log in to your BigCommerce admin panel
2. Navigate to Page Builder
3. Edit an HTML text field, and a WYSIWYG editor will automatically appear
4. Use the editor toolbar to format text, add links, etc.
5. Your changes will be automatically saved to the BigCommerce page

## Troubleshooting

If the editor does not appear:
1. Click on the extension icon in the Chrome toolbar
2. Click "Refresh Editors" to manually activate the editors
3. Make sure you are in Page Builder and editing a compatible text field
4. Check the browser console for error messages

## Technical Notes

- The extension uses MutationObserver to detect new fields added to the DOM
- Resources are properly cleaned up when leaving the page
- Error handling is implemented to improve stability
- The extension only activates on BigCommerce domains
- Compliance with Chrome extension Content Security Policy (CSP)
- Basic HTML and URL sanitization for improved security

## Privacy

This extension does not collect or transmit any personal data. It operates completely in the local browser and does not communicate with external servers.

For more details, see our [Privacy Policy](PRIVACY_POLICY.md).

## Project Website & Landing Page

A public landing page for this extension is available at:

- [Landing Page](https://cripterhack.github.io/bigcommerce-wysiwyg-extension/)
- [Privacy Policy](https://cripterhack.github.io/bigcommerce-wysiwyg-extension/privacy.html)

This site is automatically generated and deployed via GitHub Actions from the `/docs` directory. It presents the extension, features, and privacy policy for public and open-source access.

## License

This project is open source and available for your use and modification. 