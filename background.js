/**
 * BigCommerce WYSIWYG Editor - Background Service Worker
 * 
 * DEBUGGING:
 * To enable debug logging, change the DEBUG_MODE constant below to true.
 * All console.log statements are wrapped in a debug() function for easy toggling.
 */

// Set to true to enable debug logging, false to disable
const DEBUG_MODE = false;

// Debug logging function - use this instead of console.log directly
function debug(...args) {
    if (DEBUG_MODE) {
        console.log(...args);
    }
}

// Background service worker for Chrome Extension Manifest V3
debug('BigCommerce WYSIWYG Editor service worker initialized');

// Default settings with expiration
const DEFAULT_SETTINGS = {
    enabled: true,
    lastUpdated: new Date().toISOString(),
    // Add expiration (24 hours from now)
    expiresAt: new Date(Date.now() + 86400000).toISOString()
};

// Persistent state for the service worker
const state = {
    initialized: false,
    activeTabIds: new Set(),
    settings: DEFAULT_SETTINGS
};

// Session storage for temporary data
function storeTemporaryData(key, data) {
    if (typeof chrome.storage.session !== 'undefined') {
        // Use session storage if available (Chrome 102+)
        chrome.storage.session.set({ [key]: data });
    } else {
        // Fallback to local storage with expiration
        const storageData = {
            data: data,
            expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour expiration
        };
        chrome.storage.local.set({ [key]: storageData });
    }
}

// Clean up expired data in local storage
function cleanupExpiredData() {
    chrome.storage.local.get(null, (items) => {
        const now = new Date();
        const keysToRemove = [];
        
        for (const [key, value] of Object.entries(items)) {
            if (value && value.expiresAt && new Date(value.expiresAt) < now) {
                keysToRemove.push(key);
            }
        }
        
        if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
            debug('Cleaned up expired storage items:', keysToRemove);
        }
    });
}

// Initialize when extension is installed or the service worker is restarted
function initialize() {
    if (state.initialized) return;
    
    debug('Initializing BigCommerce WYSIWYG Editor');
    
    // Initialize storage with default settings
    chrome.storage.local.get('settings', (result) => {
        if (!result.settings) {
            chrome.storage.local.set({ settings: state.settings });
        } else {
            // Check if settings have expired
            const settings = result.settings;
            if (settings.expiresAt && new Date(settings.expiresAt) < new Date()) {
                // Reset to defaults if expired
                chrome.storage.local.set({ settings: {
                    ...settings,
                    lastUpdated: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 86400000).toISOString()
                }});
            } else {
                // Update state with stored settings
                state.settings = settings;
            }
        }
    });
    
    // Clean up any expired data
    cleanupExpiredData();
    
    // Schedule regular cleanup (every 24 hours)
    setInterval(cleanupExpiredData, 86400000);
    
    state.initialized = true;
}

// Run initialization when installed or updated
chrome.runtime.onInstalled.addListener((details) => {
    debug('BigCommerce WYSIWYG Editor extension installed or updated:', details.reason);
    initialize();
    
    // If this is an update, show what's new
    if (details.reason === 'update') {
        debug('Updated from version', details.previousVersion);
        
        // Store temporary update data for the popup
        storeTemporaryData('updateInfo', {
            previousVersion: details.previousVersion,
            currentVersion: chrome.runtime.getManifest().version,
            updateTime: new Date().toISOString()
        });
    }
});

// Also run initialization when the service worker starts
initialize();

// Update extension icon based on the current page
try {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url) {
            try {
                // Check if we're on BigCommerce
                const isBigCommerce = tab.url.includes('.mybigcommerce.com');
                
                if (isBigCommerce) {
                    // Track active BigCommerce tabs
                    state.activeTabIds.add(tabId);
                    
                    // Update icon to show active state
                    chrome.action.setIcon({
                        path: {
                            16: "img/icon16.png",
                            48: "img/icon48.png",
                            128: "img/icon128.png"
                        },
                        tabId: tabId
                    });
                    
                    // Store tab info in session storage
                    storeTemporaryData(`tab_${tabId}`, {
                        url: tab.url,
                        title: tab.title,
                        activatedAt: new Date().toISOString()
                    });
                } else {
                    // Remove from tracked tabs if not BigCommerce
                    state.activeTabIds.delete(tabId);
                }
            } catch (err) {
                console.error('Error in tab update handler:', err);
            }
        }
    });
    
    // Clean up when tabs are closed
    chrome.tabs.onRemoved.addListener((tabId) => {
        state.activeTabIds.delete(tabId);
        
        // Clean up any session storage for this tab
        if (typeof chrome.storage.session !== 'undefined') {
            chrome.storage.session.remove(`tab_${tabId}`);
        } else {
            chrome.storage.local.remove(`tab_${tabId}`);
        }
    });
} catch (err) {
    console.error('Error setting up tab listeners:', err);
}

// Unified message handler for all types of messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        // Handle ping messages from popup
        if (message.action === 'ping') {
            sendResponse({ 
                status: 'active',
                initialized: state.initialized,
                activeTabs: Array.from(state.activeTabIds),
                version: chrome.runtime.getManifest().version
            });
        }
        // Handle status check messages
        else if (message.action === 'getStatus') {
            sendResponse({ 
                status: 'ok',
                initialized: state.initialized,
                settings: state.settings
            });
        }
        // Handle storage management related messages
        else if (message.action === 'cleanupStorage') {
            cleanupExpiredData();
            sendResponse({ status: 'cleanup_completed' });
        }
    } catch (err) {
        console.error('Error handling message:', err, message);
        sendResponse({ status: 'error', error: err.message });
    }
    
    return true; // Keep the messaging channel open for async responses
});