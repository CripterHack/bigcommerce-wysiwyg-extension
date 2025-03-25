// Check if we're in Page Builder
function isPageBuilder() {
    // Look for Page Builder-specific elements
    return window.location.href.includes('manage/page-builder') || 
    document.querySelector('.page-builder') !== null;
}

// Load TinyMCE from CDN
function loadTinyMCE() {
    if (document.getElementById('tinymce-script')) {
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'tinymce-script';
        // TODO: For production use, replace 'no-api-key' with a valid TinyMCE API key
        // Register at https://www.tiny.cloud/ to get a free API key
        script.src = 'https://cdn.tiny.cloud/1/no-api-key/tinymce/6/tinymce.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Main injection function
function injectWysiwygEditor() {
    // Wait for the DOM to be fully loaded
    if (!isPageBuilder()) return;
    
    // Function to initialize editors
    function initializeEditors() {
        console.log('Initializing WYSIWYG editors in Page Builder');
        
        // Find all text field inputs for Read More widget
        const targetSelectors = [
            '[data-field-id="preview-body"]', 
            '[data-field-id="readmore-body"]'
        ];
        
        // Target both field containers and input elements
        const fieldContainers = [];
        targetSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                fieldContainers.push(el);
            });
        });
        
        console.log(`Found ${fieldContainers.length} target fields`);
        
        // Process each field container
        fieldContainers.forEach((container, index) => {
            // Find the input or textarea element within the container
            const originalInput = container.querySelector('input[type="text"], textarea');
            if (!originalInput) {
                console.log('No input found in container', container);
                return;
            }
            
            // Skip if we've already processed this input
            if (container.querySelector('.tox-tinymce')) {
                console.log('Editor already exists for this input, skipping');
                return;
            }
            
            console.log('Setting up editor for', originalInput);
            
            // Create editor container
            const editorId = `wysiwyg-editor-${Date.now()}-${index}`;
            const editorContainer = document.createElement('div');
            editorContainer.id = editorId;
            editorContainer.style.marginTop = '10px';
            editorContainer.style.minHeight = '200px';
            
            // Insert editor after the original input
            originalInput.parentNode.insertBefore(editorContainer, originalInput.nextSibling);
            
            // Initialize TinyMCE
            tinymce.init({
                selector: `#${editorId}`,
                height: 300,
                menubar: false,
                plugins: 'lists link image code',
                toolbar: 'undo redo | formatselect | bold italic | alignleft aligncenter alignright | bullist numlist | link | code',
                branding: false,
                setup: function(editor) {
                    // Set initial content
                    editor.on('init', function() {
                        editor.setContent(originalInput.value || '');
                    });
                    
                    // Update original input when content changes
                    editor.on('change input', function() {
                        originalInput.value = editor.getContent();
                        // Dispatch change and input events to ensure BigCommerce detects the change
                        originalInput.dispatchEvent(new Event('change', { bubbles: true }));
                        originalInput.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                }
            });
        });
    }
    
    // Function to clean up resources when navigating away
    function cleanup() {
        if (window.pageBuilderObserver) {
            window.pageBuilderObserver.disconnect();
            window.pageBuilderObserver = null;
            console.log('Disconnected mutation observer');
        }
        
        if (window.pageBuilderClickListener) {
            document.removeEventListener('click', window.pageBuilderClickListener);
            window.pageBuilderClickListener = null;
            console.log('Removed click event listener');
        }
    }
    
    // Clean up existing observers first
    cleanup();
    
    // Load TinyMCE and initialize
    loadTinyMCE().then(() => {
        // Initial attempt to find and enhance fields
        setTimeout(initializeEditors, 2000);
        
        // Set up a mutation observer to detect when new fields are added
        window.pageBuilderObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    // Wait a moment for components to fully initialize
                    setTimeout(initializeEditors, 500);
                }
            });
        });
        
        // Start observing the page for added nodes
        window.pageBuilderObserver.observe(document.body, { 
            childList: true, 
            subtree: true 
        });
        
        // Also watch for clicks that might open widget settings
        window.pageBuilderClickListener = () => {
            setTimeout(initializeEditors, 500);
        };
        document.addEventListener('click', window.pageBuilderClickListener);
        
        // Add listener for page navigation
        window.addEventListener('beforeunload', cleanup);
    }).catch(error => {
        console.error('Error loading TinyMCE:', error);
    });
}

// Check periodically if we've navigated to Page Builder
let checkInterval = setInterval(() => {
    if (isPageBuilder()) {
        injectWysiwygEditor();
        clearInterval(checkInterval);
    }
}, 1000);

// Also run on initial load
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectWysiwygEditor();
} else {
    document.addEventListener('DOMContentLoaded', injectWysiwygEditor);
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'refresh-editors') {
        console.log('Received refresh command from popup');
        if (isPageBuilder()) {
            injectWysiwygEditor();
        }
    }
    return true;
});