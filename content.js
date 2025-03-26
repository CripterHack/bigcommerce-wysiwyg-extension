/**
 * BigCommerce WYSIWYG Editor - Content Script
 * 
 * DEBUGGING:
 * To enable debug logging, change the DEBUG_MODE constant below to true.
 * All console.log statements are wrapped in a debug() function for easy toggling.
 */

// Set to true to enable debug logging, false to disable
const DEBUG_MODE = false;

// Global tracking to prevent duplicate editors
const PROCESSED_EDITOR_IDS = new Set();

// Debug logging function - use this instead of console.log directly
function debug(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}

/**
 * Cross-browser compatibility layer
 * Provides a unified API for Chrome and Firefox extensions
 */
const browserAPI = (function() {
    // Check if browser APIs are available
    function isExtensionContextValid() {
        return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
    }
    
    // Safe wrapper for browser API functions
    function trySafe(fn, fallback) {
        return function(...args) {
            try {
                if (!isExtensionContextValid()) {
                    debug('Extension context invalid, operating in fallback mode');
                    return (typeof fallback === 'function') ? fallback(...args) : fallback;
                }
                return fn(...args);
            } catch (e) {
                debug('Browser API error:', e);
                return (typeof fallback === 'function') ? fallback(...args) : fallback;
            }
        };
    }
    
    // Determine if we're in Firefox (browser namespace exists) or Chrome
    const api = typeof browser !== 'undefined' ? browser : chrome;
    
    return {
        // Check if extension context is valid
        isValid: isExtensionContextValid,
        
        // Runtime API
        runtime: {
            sendMessage: trySafe(function(message, callback) {
                if (typeof browser !== 'undefined') {
                    // Firefox uses promises
                    return browser.runtime.sendMessage(message)
                        .then(callback)
                        .catch(error => {
                            debug('Error sending message:', error);
                            if (callback) callback(null);
                        });
                } else {
                    // Chrome uses callbacks
                    return chrome.runtime.sendMessage(message, callback);
                }
            }, null),
            onMessage: {
                addListener: trySafe(function(callback) {
                    return api.runtime.onMessage.addListener(callback);
                }, false),
                removeListener: trySafe(function(callback) {
                    return api.runtime.onMessage.removeListener(callback);
                }, false)
            }
        },
        
        // Storage API
        storage: {
            local: {
                get: trySafe(function(keys, callback) {
                    if (typeof browser !== 'undefined') {
                        return browser.storage.local.get(keys)
                            .then(callback)
                            .catch(error => {
                                debug('Error getting from storage:', error);
                                if (callback) callback({});
                            });
                    } else {
                        return chrome.storage.local.get(keys, callback);
                    }
                }, (keys, callback) => { if (callback) callback({}); }),
                set: trySafe(function(items, callback) {
                    if (typeof browser !== 'undefined') {
                        return browser.storage.local.set(items)
                            .then(() => {
                                if (callback) callback();
                            })
                            .catch(error => {
                                debug('Error setting storage:', error);
                                if (callback) callback();
                            });
                    } else {
                        return chrome.storage.local.set(items, callback);
                    }
                }, (items, callback) => { if (callback) callback(); })
            },
            // Add session support if available
            session: api.storage && api.storage.session ? {
                get: trySafe(function(keys, callback) {
                    if (typeof browser !== 'undefined' && browser.storage.session) {
                        return browser.storage.session.get(keys)
                            .then(callback)
                            .catch(error => {
                                debug('Error getting from session storage:', error);
                                if (callback) callback({});
                            });
                    } else if (chrome.storage.session) {
                        return chrome.storage.session.get(keys, callback);
                    } else {
                        // Fallback to local storage
                        return this.local.get(keys, callback);
                    }
                }, (keys, callback) => { if (callback) callback({}); }),
                set: trySafe(function(items, callback) {
                    if (typeof browser !== 'undefined' && browser.storage.session) {
                        return browser.storage.session.set(items)
                            .then(() => {
                                if (callback) callback();
                            })
                            .catch(error => {
                                debug('Error setting session storage:', error);
                                if (callback) callback();
                            });
                    } else if (chrome.storage.session) {
                        return chrome.storage.session.set(items, callback);
                    } else {
                        // Fallback to local storage
                        return this.local.set(items, callback);
                    }
                }, (items, callback) => { if (callback) callback(); })
            } : null
        },
        
        // i18n API for localization
        i18n: api.i18n ? {
            getMessage: trySafe(function(messageName, substitutions) {
                return api.i18n.getMessage(messageName, substitutions);
            }, (messageName) => messageName)
        } : {
            // Fallback if i18n API is not available
            getMessage: function(messageName) {
                return messageName;
            }
        }
    };
})();

// Variable para controlar el modo fallback de la extensión
let EXTENSION_FALLBACK_MODE = false;

/**
 * Error tracking system for production debugging
 * Categorizes and logs errors with additional context
 */
const ErrorTracker = {
    // Error categories for better organization
    CATEGORIES: {
        INITIALIZATION: 'initialization',
        DOM_MANIPULATION: 'dom_manipulation',
        USER_INTERACTION: 'user_interaction',
        API_ERROR: 'api_error',
        STORAGE: 'storage',
        PERMISSION: 'permission',
        UNKNOWN: 'unknown',
        EDITOR_COMMAND: 'editor_command'
    },
    
    // Error severity levels
    SEVERITY: {
        LOW: 'low',       // Non-critical issues that don't impact functionality
        MEDIUM: 'medium', // Issues that impact some functionality but don't break the extension
        HIGH: 'high',     // Critical issues that break core functionality
        FATAL: 'fatal'    // Complete extension failure
    },
    
    // Local error cache in case storage is not available
    _errorCache: [],
    
    // Track error with context
    trackError: function(error, category, severity, context = {}) {
        try {
            const errorInfo = {
                message: error.message || String(error),
                stack: error.stack,
                category: category || this.CATEGORIES.UNKNOWN,
                severity: severity || this.SEVERITY.MEDIUM,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                context: context
            };
            
            // Always log to console in production for critical errors
            if (severity === this.SEVERITY.HIGH || severity === this.SEVERITY.FATAL || DEBUG_MODE) {
                console.error('BigCommerce WYSIWYG Editor Error:', errorInfo);
            }
            
            // Cache the error locally first
            this._errorCache.push(errorInfo);
            if (this._errorCache.length > 50) {
                this._errorCache.shift(); // Remove oldest error
            }
            
            // Only try to store in browser storage if we're not in a special state
            if (document.visibilityState !== 'hidden' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
                // Safe checking for browser API availability
                try {
                    browserAPI.storage.local.get('errorLog', (result) => {
                        try {
                            const errorLog = result.errorLog || [];
                            
                            // Add new error, limit to 50 most recent errors
                            errorLog.push(errorInfo);
                            if (errorLog.length > 50) {
                                errorLog.shift(); // Remove oldest error
                            }
                            
                            // Store updated error log
                            browserAPI.storage.local.set({ errorLog });
                        } catch (storageError) {
                            // Just log to console if we can't store
                            if (DEBUG_MODE) {
                                console.warn('Failed to update error log:', storageError.message);
                            }
                        }
                    });
                } catch (apiError) {
                    // API not available, silent fail - we already logged to console
                    if (DEBUG_MODE) {
                        console.warn('Browser storage API not available:', apiError.message);
                    }
                }
            }
            
            return errorInfo;
        } catch (metaError) {
            // Last resort - if even error tracking fails
            console.error('Critical error in error tracking system:', metaError);
            return { message: error.message || String(error) };
        }
    },
    
    // Clear error log
    clearErrors: function() {
        try {
            this._errorCache = [];
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
                browserAPI.storage.local.set({ errorLog: [] });
            }
        } catch (e) {
            console.warn('Failed to clear error log:', e);
        }
    },
    
    // Get cached errors (doesn't require storage API)
    getCachedErrors: function() {
        return this._errorCache;
    }
};

// Feature detection helper
const FeatureDetection = {
    // Check if a specific browser feature is available
    isSupported: function(feature) {
        switch(feature) {
            case 'storage.session':
                return typeof chrome !== 'undefined' && 
                       chrome.storage && 
                       typeof chrome.storage.session !== 'undefined';
            case 'execCommand':
                return typeof document.execCommand === 'function';
            case 'mutationObserver':
                return typeof MutationObserver === 'function';
            case 'serviceWorker':
                return 'serviceWorker' in navigator;
            default:
                return false;
        }
    }
};

// Ajustar la función isBigCommerceAdmin para ser más robusta
function isBigCommerceAdmin() {
    try {
        // Verificación específica del Page Builder (prioridad alta)
        if (window.location.href.includes('mybigcommerce.com/manage/page-builder')) {
            debug('BigCommerce Page Builder detected via direct URL match');
            return true;
        }
        
        // URLs de BigCommerce
        if (window.location.href.includes('mybigcommerce.com') ||
            window.location.href.includes('login.bigcommerce.com') ||
            window.location.href.includes('store.mybigcommerce.com') ||
            window.location.href.includes('admin.mybigcommerce.com') ||
            window.location.href.includes('store-') && window.location.href.includes('.mybigcommerce.com')) {
            debug('BigCommerce detected via URL pattern');
            return true;
        }
        
        // Elementos DOM específicos de BigCommerce
        const bcElements = [
            // Navegación y header
            'nav.hqhCwM',
            '[data-test-id="pageBuilderContainer"]',
            '.Polaris-Frame',
            '.bcapp-iframe',
            '#header-logo-bigcommerce',
            
            // Elementos del Page Builder
            '.bcapp-decorator',
            '[data-stencil-editor]',
            
            // Elementos de la interfaz de administración
            '#content-container-bc',
            '.page-content-bc',
            '#react-footer.bc-footer',
            '.bc-dashboard'
        ];
        
        for (const selector of bcElements) {
            if (document.querySelector(selector)) {
                debug('BigCommerce detected via DOM element:', selector);
                return true;
            }
        }
        
        // Verificar por variables específicas de BigCommerce en window
        const bcVars = [
            'BCData',
            'BCApp',
            'BCJSAPICDN',
            'BigCommerce',
            'Bigcommerce'
        ];
        
        for (const varName of bcVars) {
            if (typeof window[varName] !== 'undefined') {
                debug('BigCommerce detected via global variable:', varName);
                return true;
            }
        }
        
        // Verificar meta tags y otros elementos indirectos
        if (document.querySelector('meta[name="generator"][content*="BigCommerce"]') ||
            document.querySelector('link[href*="mybigcommerce.com"]') ||
            document.querySelector('script[src*="mybigcommerce.com"]')) {
            debug('BigCommerce detected via metadata');
            return true;
        }
        
        // Última comprobación: Si hay textareas con ciertas clases
        const bcTextareaSelectors = [
            'textarea.wysiwyg',
            'textarea.bc-product-description',
            'textarea.bc-category-description',
            'textarea.form-control[name*="description"]',
            'textarea.form-control[name*="content"]'
        ];
        
        for (const selector of bcTextareaSelectors) {
            if (document.querySelector(selector)) {
                debug('BigCommerce detected via textarea pattern:', selector);
                return true;
            }
        }
        
        // No parece ser BigCommerce
        return false;
    } catch (error) {
        console.error('Error in isBigCommerceAdmin:', error);
        return false; // Por defecto, no es BigCommerce si hay un error
    }
}

function loadEditorStyles() {
    return new Promise((resolve, reject) => {
        try {
            if (!document.getElementById('bc-editor-styles')) {
                const style = document.createElement('style');
                style.id = 'bc-editor-styles';
                style.textContent = `
                    .bc-editor-wrapper {
                        margin-top: 10px;
                        border: 1px solid #ccc;
                        border-radius: 3px;
                        overflow: visible;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        display: flex;
                        flex-direction: column;
                        min-height: 300px; /* Asegura altura mínima */
                        width: 100%; /* Asegurar que no exceda el ancho del contenedor */
                        box-sizing: border-box; /* Incluir bordes en el cálculo del ancho */
                        max-width: 100%; /* Prevenir desbordamiento */
                        z-index: 1; /* Asegurar que esté por encima de otros elementos */
                    }
                    .bc-editor-toolbar {
                        display: flex;
                        flex-wrap: wrap;
                        padding: 8px;
                        background: #f8f9fa;
                        border-bottom: 1px solid #ccc;
                        gap: 2px;
                        z-index: 2;
                        position: relative; /* Ayuda con los problemas de z-index */
                    }
                    .bc-editor-button {
                        margin: 1px;
                        padding: 5px 8px;
                        background: white;
                        border: 1px solid #ddd;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 14px;
                        color: #333;
                        min-width: 28px;
                        text-align: center;
                        transition: all 0.2s ease;
                        position: relative;
                    }
                    .bc-editor-button:hover {
                        background: #f0f0f0;
                        border-color: #999;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    }
                    .bc-editor-button.active {
                        background: #e6e6e6;
                        box-shadow: inset 0 3px 5px rgba(0,0,0,.125);
                    }
                    .bc-editor-button:focus {
                        outline: 2px solid #4a90e2;
                        outline-offset: 1px;
                    }
                    .bc-editor-button[data-tooltip]:hover::after {
                        content: attr(data-tooltip);
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0,0,0,0.8);
                        color: white;
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        white-space: nowrap;
                        z-index: 10;
                        margin-bottom: 5px;
                    }
                    .bc-editor-button[data-tooltip]:hover::before {
                        content: '';
                        position: absolute;
                        bottom: 100%;
                        left: 50%;
                        transform: translateX(-50%);
                        border: 5px solid transparent;
                        border-top-color: rgba(0,0,0,0.8);
                        margin-bottom: -5px;
                    }
                    .bc-editor-content {
                        min-height: 250px;
                        height: auto !important;
                        flex-grow: 1;
                        padding: 12px;
                        overflow-y: auto;
                        line-height: 1.5;
                        font-size: 14px;
                        background-color: white;
                        z-index: 1;
                        position: relative;
                        border: none;
                        display: block !important; /* Forzar visualización */
                        visibility: visible !important; /* Asegurar visibilidad */
                        opacity: 1 !important; /* Asegurar opacidad */
                        width: 100% !important; /* Ancho completo */
                        box-sizing: border-box !important; /* Incluir padding en el ancho */
                        color: #333 !important; /* Color de texto visible */
                    }
                    .bc-editor-content:focus {
                        outline: none;
                        box-shadow: inset 0 0 0 2px #4a90e2;
                    }
                    .bc-editor-content table {
                        border-collapse: collapse;
                        width: 100%;
                        margin-bottom: 10px;
                    }
                    .bc-editor-content table td {
                        border: 1px solid #ccc;
                        padding: 8px;
                    }
                    .bc-editor-content img {
                        max-width: 100%;
                        height: auto;
                    }
                    .bc-editor-content blockquote {
                        border-left: 3px solid #ccc;
                        margin-left: 0;
                        padding-left: 15px;
                        color: #666;
                    }
                    .bc-editor-content p {
                        margin-bottom: 10px;
                        min-height: 1.2em; /* Altura mínima para párrafos */
                    }
                    .bc-editor-content * {
                        visibility: visible !important; /* Asegurar que todos los elementos internos sean visibles */
                        opacity: 1 !important;
                    }
                    .bc-editor-hidden {
                        height: 0 !important;
                        padding: 0 !important;
                        border: 0 !important;
                        margin: 0 !important;
                        overflow: hidden !important;
                        opacity: 0 !important;
                        position: absolute !important;
                        pointer-events: none !important;
                        visibility: hidden !important;
                    }
                    .bc-editor-help {
                        margin: 5px;
                        padding: 5px 8px;
                        border-radius: 3px;
                        background: #f8f8f8;
                        border: 1px solid #ddd;
                        font-size: 12px;
                        color: #555;
                    }
                    .bc-editor-keyboard-shortcuts {
                        position: absolute;
                        right: 10px;
                        bottom: 10px;
                        background: #f8f9fa;
                        border: 1px solid #ddd;
                        border-radius: 4px;
                        padding: 5px 10px;
                        cursor: pointer;
                        font-size: 12px;
                        opacity: 0.7;
                        transition: opacity 0.2s;
                        z-index: 2;
                    }
                    .bc-editor-keyboard-shortcuts:hover {
                        opacity: 1;
                    }
                    .bc-editor-shortcuts-panel {
                        display: none;
                        position: absolute;
                        right: 10px;
                        top: 65px;
                        background: white;
                        border: 1px solid #ccc;
                        border-radius: 4px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        padding: 10px;
                        z-index: 100;
                        width: auto;
                    }
                    .bc-editor-shortcuts-panel.visible {
                        display: block;
                    }
                    .bc-editor-shortcuts-panel h3 {
                        margin: 0 0 10px 0;
                        font-size: 14px;
                        border-bottom: 1px solid #eee;
                        padding-bottom: 5px;
                    }
                    .bc-editor-shortcut-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 5px;
                        font-size: 12px;
                    }
                    .bc-editor-shortcut-key {
                        background: #f1f1f1;
                        padding: 2px 5px;
                        border-radius: 3px;
                        border: 1px solid #ddd;
                        font-family: monospace;
                    }
                    /* Fixes para BigCommerce Page Builder */
                    .widget-form-field .bc-editor-wrapper {
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    /* Corrección para contenido persistente */
                    [class*="WidgetFormField"] .bc-editor-content,
                    [class*="widget-form-"] .bc-editor-content {
                        display: block !important;
                        min-height: 250px !important;
                    }
                    /* Asegurar que el estilo funcione incluso con CSS que pueda estar sobreescribiendo */
                    .bc-editor-content[contenteditable="true"] {
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                    }
                `;
                document.head.appendChild(style);
                debug('Editor styles added');
            }
            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

function safeExecCommand(command, param = null) {
    try {
        if (command === 'createLink') {
            if (param && typeof param === 'string') {
                if (param.toLowerCase().trim().startsWith('javascript:')) {
                    console.warn('Blocked javascript: URL in createLink command');
                    return false;
                }
                document.execCommand(command, false, param);
                return true;
            }
            return false;
        } else if (param) {
            document.execCommand(command, false, param);
            return true;
        } else {
            document.execCommand(command, false, null);
            return true;
        }
    } catch (error) {
        console.error(`Error executing command '${command}':`, error);
        return false;
    }
}

class BasicHtmlEditor {
    constructor(element, options = {}) {
        if (!element || !(element instanceof HTMLElement)) {
            const error = new Error('Invalid element provided to BasicHtmlEditor');
            ErrorTracker.trackError(error, ErrorTracker.CATEGORIES.INITIALIZATION, ErrorTracker.SEVERITY.HIGH);
            throw error;
        }

        this.targetField = element;
        this.options = options;
        this.editorId = 'bc-editor-' + Math.random().toString(36).substring(2, 9);
        this.wrapper = null;
        this.toolbar = null;
        this.content = null;
        this.onChange = options.onChange || function() {};
        this.initialized = false;
        this.shortcuts = options.shortcuts !== false; // Enable shortcuts by default
        
        try {
            // SIMPLIFIED CHECK: Since enhanceFieldWithEditor already did thorough checks,
            // we'll just do a fast check here as a last protection
            if (this.targetField.nextElementSibling?.classList.contains('bc-editor-wrapper')) {
                debug('Element already has an editor wrapper, skipping initialization');
                throw new Error('Element already has an editor');
            }
            
            this.init();
            this.initialized = true;
        } catch (error) {
            console.error('Failed to initialize editor:', error);
            // If initialization fails, don't change the processed attribute
            // Let enhanceFieldWithEditor handle error recovery
            ErrorTracker.trackError(
                error, 
                ErrorTracker.CATEGORIES.INITIALIZATION, 
                ErrorTracker.SEVERITY.HIGH,
                { element: element.id || element.className || 'unknown' }
            );
            this.initialized = false;
            throw error; // Re-throw to let enhanceFieldWithEditor handle it
        }
    }
    
    init() {
        try {
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'bc-editor-wrapper';
            this.wrapper.id = this.editorId;
            
            // Add ARIA role for the wrapper
            this.wrapper.setAttribute('role', 'application');
            this.wrapper.setAttribute('aria-label', 'HTML Text Editor');
            
            this.toolbar = document.createElement('div');
            this.toolbar.className = 'bc-editor-toolbar';
            this.toolbar.setAttribute('role', 'toolbar');
            this.toolbar.setAttribute('aria-label', 'Formatting Options');
            
            // Text formatting
            const bold = this.createToolbarButton('bold', 'B', 'Bold');
            const italic = this.createToolbarButton('italic', 'I', 'Italic');
            const underline = this.createToolbarButton('underline', 'U', 'Underline');
            
            // Text alignment
            const alignLeft = this.createToolbarButton('justifyLeft', '⫷', 'Align Left');
            const alignCenter = this.createToolbarButton('justifyCenter', '☰', 'Align Center');
            const alignRight = this.createToolbarButton('justifyRight', '⫸', 'Align Right');
            
            // Lists
            const orderedList = this.createToolbarButton('insertOrderedList', '1.', 'Ordered List');
            const unorderedList = this.createToolbarButton('insertUnorderedList', '•', 'Unordered List');
            
            // Links and media
            const link = this.createToolbarButton('createLink', '🔗', 'Insert Link');
            const image = this.createToolbarButton('insertImage', '🖼️', 'Insert Image');
            
            // Block formatting
            const heading = this.createToolbarButton('heading', 'H', 'Add Heading');
            
            // Undo/Redo
            const undo = this.createToolbarButton('undo', '↩️', 'Undo');
            const redo = this.createToolbarButton('redo', '↪️', 'Redo');
            
            // Group 1: Text formatting
            this.toolbar.appendChild(bold);
            this.toolbar.appendChild(italic);
            this.toolbar.appendChild(underline);
            
            // Add a visual separator
            const separator1 = document.createElement('span');
            separator1.style.margin = '0 5px';
            separator1.style.borderRight = '1px solid #ddd';
            separator1.style.height = '20px';
            this.toolbar.appendChild(separator1);
            
            // Group 2: Alignment
            this.toolbar.appendChild(alignLeft);
            this.toolbar.appendChild(alignCenter);
            this.toolbar.appendChild(alignRight);
            
            // Add another separator
            const separator2 = document.createElement('span');
            separator2.style.margin = '0 5px';
            separator2.style.borderRight = '1px solid #ddd';
            separator2.style.height = '20px';
            this.toolbar.appendChild(separator2);
            
            // Group 3: Lists
            this.toolbar.appendChild(orderedList);
            this.toolbar.appendChild(unorderedList);
            
            // Add another separator
            const separator3 = document.createElement('span');
            separator3.style.margin = '0 5px';
            separator3.style.borderRight = '1px solid #ddd';
            separator3.style.height = '20px';
            this.toolbar.appendChild(separator3);
            
            // Group 4: Links and media
            this.toolbar.appendChild(link);
            this.toolbar.appendChild(image);
            
            // Add another separator
            const separator4 = document.createElement('span');
            separator4.style.margin = '0 5px';
            separator4.style.borderRight = '1px solid #ddd';
            separator4.style.height = '20px';
            this.toolbar.appendChild(separator4);
            
            // Group 5: Undo/Redo
            this.toolbar.appendChild(undo);
            this.toolbar.appendChild(redo);
            
            // Heading selector setup
            heading.addEventListener('click', () => {
                const headingLevel = prompt('Enter heading level (1-6):', '2');
                if (headingLevel && !isNaN(headingLevel) && headingLevel >= 1 && headingLevel <= 6) {
                    document.execCommand('formatBlock', false, `h${headingLevel}`);
                }
            });
            
            // Add click handlers for all buttons
            this.toolbar.querySelectorAll('.bc-editor-button').forEach(button => {
                button.addEventListener('click', () => {
                    this.handleCommand(button.getAttribute('data-command'));
                });
                
                // Add keyboard handling for accessibility
                button.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        this.handleCommand(button.getAttribute('data-command'));
                    }
                });
            });
            
            this.content = document.createElement('div');
            this.content.className = 'bc-editor-content';
            this.content.contentEditable = true;
            
            // Establecer estilos inline para evitar que sean sobrescritos por BigCommerce
            this.content.style.display = 'block';
            this.content.style.visibility = 'visible';
            this.content.style.opacity = '1';
            this.content.style.minHeight = '250px';
            this.content.style.position = 'relative';
            this.content.style.zIndex = '1';
            this.content.style.backgroundColor = 'white';
            this.content.style.color = '#333';
            
            // ARIA attributes for the editable area
            this.content.setAttribute('role', 'textbox');
            this.content.setAttribute('aria-multiline', 'true');
            this.content.setAttribute('aria-label', 'Content editable area');
            
            // Obtener el contenido real del campo original y limpiarlo
            let originalContent = '';
            
            try {
                originalContent = this.targetField.value || '';
            } catch (e) {
                console.error('Error getting field value:', e);
                originalContent = '';
            }
            
            // Si el contenido está vacío, asegurar que haya al menos un salto de línea para que sea editable
            if (!originalContent || originalContent.trim() === '') {
                originalContent = '<p><br></p>';
            }
            
            // Asegurar que el contenido siempre tenga un párrafo mínimo para facilitar la edición
            if (!originalContent.includes('<p>') && !originalContent.includes('<div>')) {
                originalContent = '<p>' + originalContent + '</p>';
            }
            
            // Sanitizar el contenido HTML antes de insertarlo en el editor
            let sanitizedContent = '';
            try {
                // Asegurarnos de que el método sanitizeHtml existe
                if (typeof this.sanitizeHtml === 'function') {
                    sanitizedContent = this.sanitizeHtml(originalContent);
                } else {
                    console.warn('sanitizeHtml method not found, using original content');
                    sanitizedContent = originalContent;
                }
            } catch (e) {
                console.error('Error sanitizing content:', e);
                sanitizedContent = originalContent;
            }
            
            // Asegurar que el contenido es válido
            if (!sanitizedContent || sanitizedContent.trim() === '') {
                sanitizedContent = '<p><br></p>';
            }
            
            // Asignar el contenido sanitizado al editor
            this.content.innerHTML = sanitizedContent;
            
            // Asegurar que sea visible estableciendo explícitamente dimensiones mínimas
            this.content.style.minHeight = '200px';
            this.content.style.display = 'block';
            this.content.style.width = '100%';
            
            const helpText = document.createElement('div');
            helpText.className = 'bc-editor-help';
            helpText.innerHTML = 'Tip: You can use HTML tags for more control. Select text to apply formatting.';
            helpText.setAttribute('role', 'note');
            helpText.setAttribute('aria-live', 'polite');
            
            this.wrapper.appendChild(this.toolbar);
            this.wrapper.appendChild(this.content);
            this.wrapper.appendChild(helpText);
            
            // Add ARIA announcements for status changes
            this.statusAnnouncer = document.createElement('div');
            this.statusAnnouncer.className = 'bc-editor-status-announcer';
            this.statusAnnouncer.setAttribute('role', 'status');
            this.statusAnnouncer.setAttribute('aria-live', 'polite');
            this.statusAnnouncer.style.position = 'absolute';
            this.statusAnnouncer.style.width = '1px';
            this.statusAnnouncer.style.height = '1px';
            this.statusAnnouncer.style.overflow = 'hidden';
            this.wrapper.appendChild(this.statusAnnouncer);
            
            // Add keyboard shortcuts info
            if (this.shortcuts) {
                this.addKeyboardShortcutsInfo();
            }
            
            if (this.targetField.parentNode) {
                this.targetField.parentNode.insertBefore(this.wrapper, this.targetField.nextSibling);
                
                this.targetField.classList.add('bc-editor-hidden');
                this.targetField.setAttribute('aria-hidden', 'true');
                
                debug('Editor initialized:', this.editorId);
            } else {
                throw new Error('Target field has no parent node');
            }
            
            // Agregar la clase de no-selección a elementos de la interfaz
            this.wrapper.classList.add('bc-no-selection');
            this.toolbar.classList.add('bc-no-selection');
            
            // Configurar eventos para el área editable
            this.setupContentEvents();
            
            // Añadir intervalo para comprobar que el editor sigue siendo visible
            this.visibilityCheckInterval = setInterval(() => {
                this.ensureEditorVisibility();
            }, 1000);
            
            // Configurar evento para asegurar que el campo esté correctamente sincronizado al inicio
            setTimeout(() => {
                try {
                    this.syncContent(); // Sincronizar inmediatamente después de crear
                    
                    // Enfocar el contenido para asegurar que sea visible y accesible
                    this.content.focus();
                    
                    // Colocar el cursor al final del contenido
                    this.placeCaretAtEnd(this.content);
                } catch (e) {
                    console.error('Error in post-initialization:', e);
                }
            }, 100);
        } catch (error) {
            console.error('Error initializing editor:', error);
            throw error; // Re-lanzar para que el constructor pueda manejarlo
        }
    }
    
    // Método para asegurar que el editor se mantenga visible
    ensureEditorVisibility() {
        try {
            // Verificar y restaurar la visibilidad del editor si está oculto
            if (this.content && 
                (this.content.style.display === 'none' || 
                 this.content.style.visibility === 'hidden' || 
                 this.content.style.opacity === '0' ||
                 getComputedStyle(this.content).display === 'none' ||
                 getComputedStyle(this.content).visibility === 'hidden' ||
                 parseFloat(getComputedStyle(this.content).opacity) < 0.1)) {
                
                debug('Editor visibility issue detected, restoring visibility');
                
                // Restaurar la visibilidad forzando estilos inline con !important
                this.content.style.cssText = `
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    min-height: 250px !important;
                    height: auto !important;
                    position: relative !important;
                    z-index: 1 !important;
                    background-color: white !important;
                    color: #333 !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                `;
                
                // Si tenemos acceso al estilo, tratar de agregar reglas más específicas
                const styleElement = document.getElementById('bc-editor-styles');
                if (styleElement) {
                    // Crear regla específica para este editor
                    const specificRule = `
                        #${this.editorId} .bc-editor-content {
                            display: block !important;
                            visibility: visible !important;
                            opacity: 1 !important;
                            min-height: 250px !important;
                        }
                    `;
                    styleElement.textContent += specificRule;
                }
                
                // Intentar traer el elemento al frente con un z-index más alto
                this.wrapper.style.zIndex = '999999';
                this.content.style.zIndex = '999998';
            }
        } catch (error) {
            debug('Error in ensureEditorVisibility:', error);
        }
    }
    
    setupContentEvents() {
        // Evento input para sincronizar contenido cuando cambia
        this.content.addEventListener('input', () => {
            this.syncContent();
        });
        
        // Evento blur para sincronizar cuando el editor pierde el foco
        this.content.addEventListener('blur', () => {
            this.syncContent();
            
            // Asegurar que el contenido siga siendo visible después de perder el foco
            setTimeout(() => this.ensureEditorVisibility(), 100);
        });
        
        // Evento focus para verificar el estado del contenido
        this.content.addEventListener('focus', () => {
            if (this.content.innerHTML.trim() === '' || this.content.innerHTML === '<br>') {
                this.content.innerHTML = '<p><br></p>';
            }
            
            // Asegurar que el contenido sea visible cuando gana el foco
            this.ensureEditorVisibility();
        });
        
        // Eventos de teclado para mejorar la experiencia de edición
        this.content.addEventListener('keydown', (e) => {
            // Detectar Tab para mejorar la accesibilidad
            if (e.key === 'Tab') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Si Shift+Tab, moverse al elemento anterior (toolbar)
                    const lastToolbarButton = this.toolbar.querySelector('button:last-child');
                    if (lastToolbarButton) {
                        lastToolbarButton.focus();
                    }
                } else {
                    // Insertar un tab en el contenido
                    document.execCommand('insertHTML', false, '&nbsp;&nbsp;&nbsp;&nbsp;');
                }
            }
            
            // Asegurar que Enter siempre cree nuevos párrafos
            if (e.key === 'Enter' && !e.shiftKey) {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const currentNode = range.startContainer;
                    
                    // Si estamos dentro de una lista, permitir comportamiento normal
                    if (this.isWithinNodeType(currentNode, ['UL', 'OL', 'LI'])) {
                        return;
                    }
                    
                    // Si no estamos en un párrafo, forzar la creación de uno
                    if (!this.isWithinNodeType(currentNode, ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])) {
                        e.preventDefault();
                        document.execCommand('insertParagraph', false);
                    }
                }
            }
            
            // Comandos rápidos de teclado
            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'b':
                        e.preventDefault();
                        this.execCommand('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        this.execCommand('italic');
                        break;
                    case 'u':
                        e.preventDefault();
                        this.execCommand('underline');
                        break;
                }
            }
            
            // Asegurar que el contenido sea visible después de cada pulsación de tecla
            setTimeout(() => this.ensureEditorVisibility(), 50);
        });
        
        // Evento de clic para asegurar visibilidad
        this.content.addEventListener('click', () => {
            this.ensureEditorVisibility();
        });
    }
    
    isWithinNodeType(node, types) {
        try {
            while (node && node !== this.content) {
                if (node.nodeType === 1 && types.includes(node.tagName)) {
                    return true;
                }
                node = node.parentNode;
            }
            return false;
        } catch (e) {
            console.error('Error checking node type:', e);
            return false;
        }
    }
    
    // Método para manejar los comandos desde la barra de herramientas
    handleCommand(command) {
        try {
            this.content.focus();
            
            if (command === 'createLink') {
                const selection = window.getSelection();
                const selectedText = selection.toString();
                
                if (selectedText) {
                    const url = prompt('Enter URL for link:', 'https://');
                    if (url) {
                        // Usar un método seguro para evitar problemas con URLs maliciosas
                        const sanitizedUrl = this.sanitizeUrl(url);
                        document.execCommand('createLink', false, sanitizedUrl);
                        
                        // Aplicar target="_blank" a todos los enlaces creados
                        const links = this.content.querySelectorAll('a[href]');
                        links.forEach(link => {
                            link.setAttribute('target', '_blank');
                            link.setAttribute('rel', 'noopener noreferrer');
                        });
                    }
                } else {
                    alert('Please select some text first to create a link.');
                    this.announceStatus('Please select text first to create a link');
                }
            } else if (command === 'insertImage') {
                const url = prompt('Enter image URL:', 'https://');
                if (url) {
                    const sanitizedUrl = this.sanitizeUrl(url);
                    document.execCommand('insertImage', false, sanitizedUrl);
                    
                    // Asegurar que la imagen sea responsive
                    const images = this.content.querySelectorAll('img');
                    images.forEach(img => {
                        if (!img.style.maxWidth) {
                            img.style.maxWidth = '100%';
                        }
                        if (!img.hasAttribute('alt')) {
                            img.setAttribute('alt', 'Image');
                        }
                    });
                }
            } else if (command === 'heading') {
                const level = prompt('Enter heading level (1-6):', '2');
                if (level && !isNaN(level) && level >= 1 && level <= 6) {
                    document.execCommand('formatBlock', false, `h${level}`);
                }
            } else if (command === 'insertTable') {
                const tableSize = prompt('Enter table size (rows x columns):', '3x3');
                if (tableSize && /^\d+x\d+$/.test(tableSize)) {
                    const [rows, cols] = tableSize.split('x').map(num => parseInt(num, 10));
                    
                    if (rows > 0 && cols > 0 && rows <= 20 && cols <= 20) {
                        let tableHtml = '<table border="1" style="width:100%;">';
                        
                        for (let i = 0; i < rows; i++) {
                            tableHtml += '<tr>';
                            for (let j = 0; j < cols; j++) {
                                tableHtml += '<td>Cell</td>';
                            }
                            tableHtml += '</tr>';
                        }
                        
                        tableHtml += '</table><p></p>';
                        document.execCommand('insertHTML', false, tableHtml);
                    }
                }
            } else {
                // Para todos los demás comandos estándar
                this.execCommand(command);
            }
            
            // Actualizar el estado de la barra de herramientas
            this.updateToolbarState();
            
            // Sincronizar el contenido
            this.syncContent();
        } catch (error) {
            console.error('Error handling command:', error);
            if (typeof ErrorTracker !== 'undefined') {
                ErrorTracker.trackError(
                    error,
                    ErrorTracker.CATEGORIES.USER_INTERACTION,
                    ErrorTracker.SEVERITY.MEDIUM,
                    { command }
                );
            }
        }
    }
    
    // Método para crear botones de la barra de herramientas
    createToolbarButton(command, label, tooltip) {
        const button = document.createElement('button');
        button.className = 'bc-editor-button';
        button.innerHTML = label;
        button.setAttribute('type', 'button');
        button.setAttribute('data-command', command);
        button.setAttribute('data-tooltip', tooltip);
        button.setAttribute('aria-label', tooltip);
        return button;
    }
    
    // Método para anunciar mensajes de estado para lectores de pantalla
    announceStatus(message) {
        try {
            if (this.statusAnnouncer) {
                this.statusAnnouncer.textContent = message;
                
                // Limpiar después de unos segundos
                setTimeout(() => {
                    if (this.statusAnnouncer) {
                        this.statusAnnouncer.textContent = '';
                    }
                }, 3000);
            }
        } catch (error) {
            console.error('Error announcing status:', error);
        }
    }
    
    // Actualizar el estado de los botones de la barra de herramientas
    updateToolbarState() {
        try {
            if (!this.toolbar) return;
            
            const commands = [
                'bold', 'italic', 'underline', 
                'justifyLeft', 'justifyCenter', 'justifyRight',
                'insertOrderedList', 'insertUnorderedList'
            ];
            
            commands.forEach(command => {
                const button = this.toolbar.querySelector(`[data-command="${command}"]`);
                if (button) {
                    try {
                        const isActive = document.queryCommandState(command);
                        if (isActive) {
                            button.classList.add('active');
                            button.setAttribute('aria-pressed', 'true');
                        } else {
                            button.classList.remove('active');
                            button.setAttribute('aria-pressed', 'false');
                        }
                    } catch (e) {
                        // Ignorar errores de queryCommandState que a veces ocurren
                    }
                }
            });
        } catch (error) {
            console.error('Error updating toolbar state:', error);
        }
    }
    
    // Método para añadir información de atajos de teclado
    addKeyboardShortcutsInfo() {
        try {
            const shortcutsBtn = document.createElement('button');
            shortcutsBtn.className = 'bc-editor-keyboard-shortcuts';
            shortcutsBtn.setAttribute('type', 'button');
            shortcutsBtn.setAttribute('aria-label', 'Show keyboard shortcuts');
            shortcutsBtn.innerHTML = '⌨️ Shortcuts';
            
            const shortcutsPanel = document.createElement('div');
            shortcutsPanel.className = 'bc-editor-shortcuts-panel';
            shortcutsPanel.innerHTML = `
                <h3>Keyboard Shortcuts</h3>
                <div class="bc-editor-shortcut-row">
                    <span>Bold</span>
                    <span class="bc-editor-shortcut-key">Ctrl+B</span>
                </div>
                <div class="bc-editor-shortcut-row">
                    <span>Italic</span>
                    <span class="bc-editor-shortcut-key">Ctrl+I</span>
                </div>
                <div class="bc-editor-shortcut-row">
                    <span>Underline</span>
                    <span class="bc-editor-shortcut-key">Ctrl+U</span>
                </div>
            `;
            
            shortcutsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                shortcutsPanel.classList.toggle('visible');
            });
            
            document.addEventListener('click', (e) => {
                if (!shortcutsPanel.contains(e.target) && e.target !== shortcutsBtn) {
                    shortcutsPanel.classList.remove('visible');
                }
            });
            
            this.wrapper.appendChild(shortcutsBtn);
            this.wrapper.appendChild(shortcutsPanel);
        } catch (error) {
            console.error('Error adding keyboard shortcuts info:', error);
        }
    }
    
    // Método para sincronizar contenido del editor al campo original
    syncContent() {
        try {
            if (!this.content || !this.targetField) return;
            
            // Obtener contenido del editor
            const content = this.content.innerHTML;
            
            // Actualizar el campo original
            this.targetField.value = content;
            
            // Disparar eventos nativos para asegurar que BigCommerce reconozca los cambios
            this.targetField.dispatchEvent(new Event('input', { bubbles: true }));
            this.targetField.dispatchEvent(new Event('change', { bubbles: true }));
            
            // Llamar al callback onChange si se proporcionó
            if (typeof this.onChange === 'function') {
                this.onChange(content);
            }
        } catch (error) {
            console.error('Error syncing content:', error);
            if (typeof ErrorTracker !== 'undefined') {
                ErrorTracker.trackError(
                    error, 
                    ErrorTracker.CATEGORIES.DOM_MANIPULATION, 
                    ErrorTracker.SEVERITY.MEDIUM,
                    { editorId: this.editorId }
                );
            }
        }
    }

    // Método auxiliar para colocar el cursor al final del contenido
    placeCaretAtEnd(element) {
        try {
            if (document.createRange && window.getSelection) {
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(element);
                range.collapse(false); // false = colapsar al final
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } catch (e) {
            console.error('Error placing caret at end:', e);
            if (typeof debug === 'function') {
                debug('Error placing caret at end:', e);
            }
        }
    }
    
    // Método para sanitizar HTML y evitar código malicioso
    sanitizeHtml(html) {
        try {
            if (!html || typeof html !== 'string') return '';
            
            // Usar un div temporal para sanitizar
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Eliminar scripts y atributos javascript:
            const scripts = tempDiv.querySelectorAll('script');
            scripts.forEach(script => script.remove());
            
            // Sanitizar atributos on* y javascript: URLs
            const allElements = tempDiv.querySelectorAll('*');
            allElements.forEach(el => {
                // Eliminar manejadores de eventos inline
                Array.from(el.attributes).forEach(attr => {
                    if (attr.name.startsWith('on') || 
                        (attr.value && attr.value.toLowerCase().includes('javascript:'))) {
                        el.removeAttribute(attr.name);
                    }
                });
                
                // Sanitizar href/src con javascript:
                if (el.hasAttribute('href')) {
                    const href = el.getAttribute('href');
                    if (href && href.toLowerCase().startsWith('javascript:')) {
                        el.setAttribute('href', '#');
                    }
                }
                
                if (el.hasAttribute('src')) {
                    const src = el.getAttribute('src');
                    if (src && src.toLowerCase().startsWith('javascript:')) {
                        el.removeAttribute('src');
                    }
                }
                
                // Añadir target="_blank" a links externos
                if (el.tagName === 'A' && el.hasAttribute('href')) {
                    const href = el.getAttribute('href');
                    if (href && !href.startsWith('#') && !href.startsWith('/')) {
                        el.setAttribute('target', '_blank');
                        el.setAttribute('rel', 'noopener noreferrer');
                    }
                }
            });
            
            return tempDiv.innerHTML;
        } catch (error) {
            console.error('Error sanitizing HTML:', error);
            if (typeof ErrorTracker !== 'undefined') {
                ErrorTracker.trackError(
                    error, 
                    ErrorTracker.CATEGORIES.DOM_MANIPULATION, 
                    ErrorTracker.SEVERITY.MEDIUM,
                    { inputLength: html ? html.length : 0 }
                );
            }
            return html || ''; // En caso de error, devolver el HTML original o cadena vacía
        }
    }
    
    // Método para sanitizar URLs
    sanitizeUrl(url) {
        try {
            if (!url) return '';
            url = url.trim();
            
            // Bloquear javascript: y data: URLs potencialmente peligrosas
            if (url.toLowerCase().startsWith('javascript:') || 
                (url.toLowerCase().startsWith('data:') && !url.toLowerCase().startsWith('data:image/'))) {
                if (typeof ErrorTracker !== 'undefined') {
                    ErrorTracker.trackError(
                        new Error('Blocked potentially unsafe URL'),
                        ErrorTracker.CATEGORIES.USER_INTERACTION,
                        ErrorTracker.SEVERITY.MEDIUM,
                        { url: url }
                    );
                }
                return 'about:blank';
            }
            
            // Verificar si la URL comienza con un protocolo permitido
            const protocolPattern = /^(?:https?|mailto|tel|data:image\/):/i;
            if (!protocolPattern.test(url)) {
                // Agregar https:// si no tiene protocolo
                return 'https://' + url.replace(/^:?\/\//, '');
            }
            
            return url;
        } catch (error) {
            console.error('Error sanitizing URL:', error);
            if (typeof ErrorTracker !== 'undefined') {
                ErrorTracker.trackError(
                    error, 
                    ErrorTracker.CATEGORIES.DOM_MANIPULATION, 
                    ErrorTracker.SEVERITY.LOW
                );
            }
            return 'about:blank';
        }
    }
    
    // Método simplificado para ejecutar comandos de edición
    execCommand(command, value = null) {
        try {
            if (!this.content) return false;
            
            this.content.focus();
            
            // Comandos básicos
            document.execCommand(command, false, value);
            
            // Sincronizar contenido después de ejecutar el comando
            this.syncContent();
            return true;
        } catch (error) {
            console.error(`Error executing command ${command}:`, error);
            if (typeof ErrorTracker !== 'undefined') {
                ErrorTracker.trackError(
                    error,
                    ErrorTracker.CATEGORIES.EDITOR_COMMAND,
                    ErrorTracker.SEVERITY.MEDIUM,
                    { command, value }
                );
            }
            return false;
        }
    }
    
    // Método para limpiar recursos cuando se destruye el editor
    destroy() {
        try {
            // Limpiar intervalo de comprobación de visibilidad
            if (this.visibilityCheckInterval) {
                clearInterval(this.visibilityCheckInterval);
            }
            
            // Resto del código de limpieza
            if (this.content) {
                this.content.removeEventListener('input', this.syncContent);
                this.content.removeEventListener('keydown', this.handleKeyDown);
            }
            
            if (this.wrapper && this.wrapper.parentNode) {
                this.wrapper.parentNode.removeChild(this.wrapper);
            }
            
            if (this.targetField) {
                this.targetField.classList.remove('bc-editor-hidden');
            }
            
            debug('Editor destroyed:', this.editorId);
        } catch (error) {
            console.error('Error destroying editor:', error);
        }
    }
}

// Función principal para mejorar campos de texto con el editor
function enhanceFieldWithEditor(field) {
    try {
        // Verificar si el campo ya tiene un editor asociado
        if (PROCESSED_EDITOR_IDS.has(field.id) || field.getAttribute('data-wysiwyg-processed') === 'true') {
            debug('Field already processed, skipping:', field.id || 'unknown');
            return;
        }
        
        if (!field.id) {
            field.id = 'bc-field-' + Math.random().toString(36).substring(2, 9);
        }
        
        // Marcar el campo como procesado
        PROCESSED_EDITOR_IDS.add(field.id);
        field.setAttribute('data-wysiwyg-processed', 'true');
        
        // Opciones del editor
        const options = {
            onChange: function(content) {
                debug('Content changed:', content.substring(0, 50) + '...');
            }
        };
        
        // Inicializar editor
        try {
            const editor = new BasicHtmlEditor(field, options);
            debug('Editor initialized for field:', field.id);
            return editor;
        } catch (error) {
            console.error('Failed to initialize editor for field:', error);
            ErrorTracker.trackError(
                error, 
                ErrorTracker.CATEGORIES.INITIALIZATION, 
                ErrorTracker.SEVERITY.HIGH,
                { fieldId: field.id || 'unknown' }
            );
            
            // Desmarcar como procesado para permitir nuevos intentos
            PROCESSED_EDITOR_IDS.delete(field.id);
            field.removeAttribute('data-wysiwyg-processed');
            return null;
        }
    } catch (error) {
        console.error('Error in enhanceFieldWithEditor:', error);
        return null;
    }
}

// Verificar si un campo debe ser mejorado con el editor
function shouldEnhanceField(field) {
    try {
        // Debug para ver qué campos estamos evaluando
        debug('Evaluating field for enhancement:', field.id || field.name || 'unnamed field', 
            'type:', field.tagName, 
            'class:', field.className || 'no-class');
        
        // Solo mejorar textareas o inputs de tipo hidden que BigCommerce usa para HTML
        if (!(field instanceof HTMLTextAreaElement) && 
            !(field instanceof HTMLInputElement && field.type.toLowerCase() === 'hidden')) {
            debug('Field rejected: not a textarea or hidden input');
            return false;
        }
        
        // Evitar mejorar campos que no deben tener formato
        const excludePatterns = [
            'password', 'search', 'email', 'url', 'tel', 'number', 'date',
            'captcha', 'code-editor', 'json', 'css', 'javascript'
        ];
        
        const fieldId = (field.id || '').toLowerCase();
        const fieldName = (field.name || '').toLowerCase();
        const fieldClass = (field.className || '').toLowerCase();
        
        for (const pattern of excludePatterns) {
            if (fieldId.includes(pattern) || fieldName.includes(pattern) || fieldClass.includes(pattern)) {
                debug('Field rejected: matches exclude pattern:', pattern);
                return false;
            }
        }
        
        // Primera prueba: Es un campo HTML explícito
        if (fieldId.includes('html') || 
            fieldName.includes('html') || 
            fieldClass.includes('html') || 
            field.getAttribute('data-wysiwyg') === 'true') {
            debug('Field accepted: explicitly HTML field');
            return true;
        }
        
        // Segunda prueba: Es un campo de contenido o descripción
        if (fieldId.includes('content') || 
            fieldId.includes('description') || 
            fieldName.includes('content') || 
            fieldName.includes('description') ||
            fieldClass.includes('content')) {
            debug('Field accepted: content or description field');
            return true;
        }
        
        // Tercera prueba: Es un campo de texto grande (textareas)
        if (field instanceof HTMLTextAreaElement) {
            // Si es un textarea, casi siempre querremos mejorarlo
            if (field.rows > 2 || field.offsetHeight > 80 || field.cols > 40) {
                debug('Field accepted: large textarea');
                return true;
            }
            
            // Si el textarea contiene algunas etiquetas HTML, probablemente sea contenido HTML
            const value = field.value || '';
            if (value.includes('<p>') || 
                value.includes('<div>') || 
                value.includes('<br') || 
                value.includes('<span') || 
                value.includes('<img') ||
                value.includes('<a href')) {
                debug('Field accepted: contains HTML tags');
                return true;
            }
            
            // En BigCommerce, muchos campos podrían ser HTML
            if (isBigCommerceAdmin()) {
                debug('Field accepted: textarea in BigCommerce admin');
                return true;
            }
        }
        
        // Cuarta prueba: Para compatibilidad con BigCommerce
        // Patrones comunes de ID/name en BigCommerce para campos de contenido
        const bcPatterns = [
            'wysiwyg', 'editor', 'rich', 'text_area', 
            'product_description', 'category_description',
            'page_text', 'blog_post', 'widget_content'
        ];
        
        for (const pattern of bcPatterns) {
            if (fieldId.includes(pattern) || fieldName.includes(pattern)) {
                debug('Field accepted: matches BigCommerce pattern:', pattern);
                return true;
            }
        }
        
        // Por defecto, rechazar el campo
        debug('Field rejected: does not match any enhancement criteria');
        return false;
    } catch (error) {
        console.error('Error in shouldEnhanceField:', error);
        // En caso de error, devolver true para ser inclusivos
        return true;
    }
}

// Función para escanear la página en busca de campos a mejorar
function scanAndEnhanceFields() {
    debug('Scanning for fields to enhance...');
    
    try {
        // Buscar textareas que parecen ser editores de contenido
        const allTextAreas = document.querySelectorAll('textarea');
        debug(`Found ${allTextAreas.length} textareas`);
        
        let enhancedCount = 0;
        
        allTextAreas.forEach(field => {
            if (shouldEnhanceField(field)) {
                debug('Enhancing field:', field.id || 'unnamed field');
                if (enhanceFieldWithEditor(field)) {
                    enhancedCount++;
                }
            }
        });
        
        // Buscar también campos hidden específicos que BigCommerce usa para contenido HTML
        const hiddenContentFields = document.querySelectorAll('input[type="hidden"][name*="content"], input[type="hidden"][name*="description"]');
        hiddenContentFields.forEach(field => {
            if (shouldEnhanceField(field)) {
                debug('Enhancing hidden field:', field.id || 'unnamed field');
                if (enhanceFieldWithEditor(field)) {
                    enhancedCount++;
                }
            }
        });
        
        debug(`Enhanced ${enhancedCount} fields with WYSIWYG editor`);
        return enhancedCount;
    } catch (error) {
        console.error('Error scanning for fields:', error);
        ErrorTracker.trackError(
            error, 
            ErrorTracker.CATEGORIES.INITIALIZATION, 
            ErrorTracker.SEVERITY.HIGH
        );
        return 0;
    }
}

// Función para inicializar la extensión
function initializeExtension() {
    debug('Initializing BigCommerce WYSIWYG Editor extension...');
    
    // Verificar si estamos en el admin de BigCommerce
    if (!isBigCommerceAdmin()) {
        debug('Not in BigCommerce admin, skipping initialization');
        return;
    }
    
    // Verificar el contexto de la extensión
    const extensionValid = browserAPI.isValid();
    debug('Extension context valid:', extensionValid);
    
    if (!extensionValid) {
        console.warn('BigCommerce WYSIWYG Editor: Running in fallback mode due to invalid extension context');
        EXTENSION_FALLBACK_MODE = true;
    }
    
    // Cargar estilos del editor
    loadEditorStyles()
        .then(() => {
            debug('Editor styles loaded successfully');
            
            // Escanear y mejorar campos iniciales
            const initialCount = scanAndEnhanceFields();
            
            // Configurar observador para detectar nuevos campos
            setupDynamicFieldsObserver();
            
            debug(`Initialization complete. Initially enhanced ${initialCount} fields.`);
        })
        .catch(error => {
            console.error('Failed to load editor styles:', error);
            ErrorTracker.trackError(
                error, 
                ErrorTracker.CATEGORIES.INITIALIZATION, 
                ErrorTracker.SEVERITY.HIGH
            );
        });
}

// Observador para detectar cuando se añaden nuevos campos dinámicamente
function setupDynamicFieldsObserver() {
    try {
        if (typeof MutationObserver === 'undefined') {
            debug('MutationObserver not supported, skipping dynamic fields detection');
            return;
        }
        
        const observer = new MutationObserver(mutations => {
            let shouldScan = false;
            
            for (const mutation of mutations) {
                // Si se añaden nuevos nodos, verificar si hay campos que mejorar
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            // Si es un campo directamente o contiene campos
                            if (shouldEnhanceField(node) || 
                                node.querySelector('textarea, input[type="hidden"]')) {
                                shouldScan = true;
                                break;
                            }
                        }
                    }
                }
                
                if (shouldScan) break;
            }
            
            if (shouldScan) {
                debug('Detected new potential fields, rescanning...');
                setTimeout(scanAndEnhanceFields, 500); // Pequeño retraso para asegurar que el DOM esté listo
            }
        });
        
        // Observar todo el documento para cambios
        observer.observe(document.body, {
            childList: true, 
            subtree: true
        });
        
        debug('Dynamic fields observer set up successfully');
    } catch (error) {
        console.error('Error setting up dynamic fields observer:', error);
        ErrorTracker.trackError(
            error, 
            ErrorTracker.CATEGORIES.INITIALIZATION, 
            ErrorTracker.SEVERITY.MEDIUM
        );
    }
}

// Iniciar la extensión cuando el DOM esté completamente cargado
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    // Si el DOM ya está cargado, iniciar inmediatamente
    initializeExtension();
}

// Reintentar la inicialización después de la carga completa de la página
// Esto ayuda en casos donde BigCommerce carga dinámicamente el contenido
window.addEventListener('load', () => {
    setTimeout(() => {
        debug('Retrying initialization after page load');
        scanAndEnhanceFields();
    }, 1000);
});

// También reintentar periódicamente para páginas con carga dinámica
let retryCount = 0;
const maxRetries = 5;
const retryInterval = setInterval(() => {
    retryCount++;
    if (retryCount > maxRetries) {
        clearInterval(retryInterval);
        return;
    }
    
    debug(`Retry scan #${retryCount}`);
    scanAndEnhanceFields();
}, 3000);