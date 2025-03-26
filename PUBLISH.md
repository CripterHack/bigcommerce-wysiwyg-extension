# Publication Guide - BigCommerce WYSIWYG Editor v2.2

This document provides detailed instructions for publishing the extension in the Chrome Web Store.

## Prerequisites

1. Have a Google Chrome Web Store developer account (one-time $5 USD fee)
2. Have executed the `package.ps1` script to generate the extension ZIP file

## Resource Preparation

Before starting the publication process, make sure you have these resources ready:

### Screenshots (required)
- At least 1 screenshot of 1280x800 pixels showing the extension in action
- Suggestions for screenshots:
  - Editor working in BigCommerce Page Builder
  - Toolbar with all options visible
  - Example of text formatted with the editor

### Promotional Images (recommended)
- Small promotional image: 440x280 pixels
- Large promotional image: 920x680 pixels
- High resolution icon: 128x128 pixels (already included in the extension)

## Publication Process

1. **Sign In**
   - Visit [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - Sign in with your Google account

2. **Create New Publication**
   - Click on "New Item"
   - Choose "Upload a package"
   - Select the previously generated `bigcommerce-wysiwyg-editor-v4.1.zip` file

3. **Extension Information**
   - **Store Name**: BigCommerce WYSIWYG Editor
   - **Short Description** (maximum 132 characters):
     ```
     Enhances HTML field editing in BigCommerce with a simple and lightweight WYSIWYG visual editor.
     ```
   - **Detailed Description**:
     ```
     The WYSIWYG Editor for BigCommerce enhances the text editing experience in BigCommerce Page Builder by adding a formatting toolbar to HTML fields.

     FEATURES:
     • Basic text formatting (bold, italic, underline)
     • Ordered and unordered lists
     • Text alignment (left, center, right)
     • Link, image, and table insertion
     • Headers and blockquotes
     • Text and background colors
     • Clear formatting button
     
     The extension works automatically on BigCommerce HTML fields and requires no configuration. It does not store any personal data or communicate with external servers.

     For any issues or suggestions, please contact via GitHub.
     ```

4. **Category and Details**
   - **Category**: Developer Tools
   - **Languages**: Spanish, English
   - **Website**: GitHub project URL

5. **Privacy Policy**
   - In the "Privacy" section, upload or link to `PRIVACY_POLICY.md`
   - Alternatively, copy and paste the file contents

6. **Images and Screenshots**
   - Upload at least 1 screenshot (1280x800)
   - If available, upload promotional images

7. **Distribution and Visibility**
   - **Visibility**: Public (for everyone) or Private (only for users with the direct link)
   - **Users**: Determine if the extension will be available to all users or only to those in specific domains

8. **Verification and Submission**
   - Review all provided information
   - Click "Submit for Review"

## After Submission

- The review process typically takes 2-3 business days
- Google may request changes or additional information
- Once approved, the extension will appear in the Chrome Web Store

## Future Updates

To publish new versions:
1. Update the version number in `manifest.json` and `popup.html`
2. Run `package.ps1` to generate a new ZIP file
3. In the Developer Dashboard, select the existing extension
4. Click "Package" and upload the new version
5. Update the description if necessary to reflect changes
6. Submit the update for review

## Useful Resources

- [Official Chrome Web Store documentation](https://developer.chrome.com/docs/webstore/)
- [Best practices for Chrome Web Store listings](https://developer.chrome.com/docs/webstore/best_practices/)
- [Developer Program Policies](https://developer.chrome.com/docs/webstore/program_policies/) 