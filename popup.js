/**
 * BigCommerce WYSIWYG Editor - Popup Script
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

/**
 * Cross-browser compatibility layer
 * Provides a unified API for Chrome and Firefox extensions
 */
const browserAPI = (function() {
    // Determine if we're in Firefox (browser namespace exists) or Chrome
    const api = typeof browser !== 'undefined' ? browser : chrome;
    
    return {
        // Runtime API
        runtime: {
            sendMessage: function(message, callback) {
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
            },
            getManifest: function() {
                return api.runtime.getManifest();
            },
            getLastError: function() {
                return api.runtime.lastError;
            }
        },
        
        // Tabs API
        tabs: {
            query: function(queryInfo, callback) {
                if (typeof browser !== 'undefined') {
                    return browser.tabs.query(queryInfo)
                        .then(callback)
                        .catch(error => {
                            debug('Error querying tabs:', error);
                            if (callback) callback([]);
                        });
                } else {
                    return chrome.tabs.query(queryInfo, callback);
                }
            },
            sendMessage: function(tabId, message, callback) {
                if (typeof browser !== 'undefined') {
                    return browser.tabs.sendMessage(tabId, message)
                        .then(callback)
                        .catch(error => {
                            debug('Error sending message to tab:', error);
                            if (callback) callback(null);
                        });
                } else {
                    return chrome.tabs.sendMessage(tabId, message, callback);
                }
            }
        },
        
        // i18n API for localization
        i18n: api.i18n ? {
            getMessage: function(messageName, substitutions) {
                return api.i18n.getMessage(messageName, substitutions);
            }
        } : {
            // Fallback if i18n API is not available
            getMessage: function(messageName) {
                return messageName;
            }
        }
    };
})();

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    const statusMsg = document.getElementById('status-message');
    const debugInfo = document.getElementById('debug-info');
    const announcer = document.getElementById('announcer');
    
    // Function to update status messages
    function updateStatus(message, isError = false) {
        statusMsg.textContent = message;
        statusMsg.style.color = isError ? '#d9534f' : '#5cb85c';
        statusMsg.style.backgroundColor = isError ? '#f9f2f2' : '#f2f9f2';
        
        // Announce status for screen readers
        announceScreenReaderMessage(message);
    }
    
    // Function for screen reader announcements
    function announceScreenReaderMessage(message) {
        announcer.textContent = message;
        
        // Clear after a few seconds to prevent double announcements
        setTimeout(() => {
            announcer.textContent = '';
        }, 5000);
    }
    
    // Function to show debug information
    function showDebugInfo(content, autoClear = true) {
        if (typeof content === 'object') {
            debugInfo.textContent = JSON.stringify(content, null, 2);
        } else {
            debugInfo.textContent = content;
        }
        
        debugInfo.classList.remove('visually-hidden');
        debugInfo.setAttribute('aria-hidden', 'false');
        
        if (autoClear) {
            clearDebugInfoAfterDelay();
        }
    }
    
    // Function to hide debug information
    function hideDebugInfo() {
        debugInfo.classList.add('visually-hidden');
        debugInfo.setAttribute('aria-hidden', 'true');
    }
    
    // Function to clear debug messages after a time
    function clearDebugInfoAfterDelay(delay = 30000) {
        setTimeout(() => {
            if (!debugInfo.classList.contains('visually-hidden')) {
                hideDebugInfo();
            }
        }, delay);
    }
    
    // Ping the service worker to keep it active and check extension status
    browserAPI.runtime.sendMessage({action: 'ping'}, (response) => {
        if (browserAPI.runtime.getLastError()) {
            updateStatus('Error connecting to extension: ' + browserAPI.runtime.getLastError().message, true);
            showDebugInfo('Runtime error: ' + JSON.stringify(browserAPI.runtime.getLastError()));
            return;
        }
        
        debug('Service worker status:', response);
        
        if (!response) {
            updateStatus('Error: Service worker not responding', true);
            return;
        }
        
        // Show detailed debug info on double-click of status message
        statusMsg.addEventListener('dblclick', () => {
            if (debugInfo.classList.contains('visually-hidden')) {
                showDebugInfo(response, false);
                announceScreenReaderMessage('Debug information displayed');
            } else {
                hideDebugInfo();
                announceScreenReaderMessage('Debug information hidden');
            }
        });
        
        // Add keyboard access to status message
        statusMsg.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                statusMsg.dispatchEvent(new MouseEvent('dblclick'));
            }
        });
        
        // Make status message focusable
        statusMsg.tabIndex = 0;
        statusMsg.setAttribute('role', 'button');
        statusMsg.setAttribute('aria-label', 'Show debug information (double-click or press Enter)');
    });
    
    // Check if we're on a BigCommerce site
    browserAPI.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (browserAPI.runtime.getLastError()) {
            updateStatus('Error accessing tab: ' + browserAPI.runtime.getLastError().message, true);
            return;
        }
        
        const currentTab = tabs[0];
        const isBigCommerce = currentTab && currentTab.url && currentTab.url.includes('.mybigcommerce.com');
        
        if (!isBigCommerce) {
            updateStatus('Not on a BigCommerce site', true);
            refreshBtn.disabled = true;
            refreshBtn.setAttribute('aria-disabled', 'true');
            return;
        }
        
        updateStatus('Ready to enhance BigCommerce editor');
    });
    
    // Add click handler for refresh button
    refreshBtn.addEventListener('click', () => {
        // Show "loading" status
        updateStatus('Refreshing editors...');
        refreshBtn.disabled = true;
        refreshBtn.setAttribute('aria-disabled', 'true');
        
        browserAPI.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) {
                updateStatus('Error: Unable to connect to tab', true);
                refreshBtn.disabled = false;
                refreshBtn.setAttribute('aria-disabled', 'false');
                return;
            }
            
            try {
                browserAPI.tabs.sendMessage(tabs[0].id, {action: 'refresh-editors'}, (response) => {
                    refreshBtn.disabled = false;
                    refreshBtn.setAttribute('aria-disabled', 'false');
                    
                    // Handle potential errors
                    if (browserAPI.runtime.getLastError()) {
                        const errorMsg = browserAPI.runtime.getLastError().message;
                        updateStatus('Error: ' + errorMsg, true);
                        
                        // If it's a connection error, the content script might not be loaded
                        if (errorMsg.includes('Could not establish connection') || 
                            errorMsg.includes('receiving end does not exist')) {
                            showDebugInfo('Content script may not be loaded. Try reloading the page.');
                        }
                        
                        return;
                    }
                    
                    if (!response || response.status !== 'success') {
                        updateStatus('Warning: No confirmation received', true);
                        return;
                    }
                    
                    // Show success message
                    updateStatus('Editors refreshed successfully!');
                    
                    // Reset message after 3 seconds
                    setTimeout(() => {
                        updateStatus('Ready to enhance BigCommerce editor');
                    }, 3000);
                });
            } catch (e) {
                refreshBtn.disabled = false;
                refreshBtn.setAttribute('aria-disabled', 'false');
                updateStatus('Error: ' + e.message, true);
                console.error(e);
                
                showDebugInfo(e.stack || e.toString());
            }
        });
    });

    // Add click handler for help link
    document.getElementById('help-link').addEventListener('click', (e) => {
        e.preventDefault();
        
        // If debug info is already visible, hide it
        if (!debugInfo.classList.contains('visually-hidden')) {
            hideDebugInfo();
            return;
        }
        
        // Show help information
        const helpHtml = `
            <strong>Troubleshooting:</strong><br>
            1. Make sure you're on a BigCommerce site<br>
            2. Try refreshing the page<br>
            3. Check for errors in console (F12)<br>
            4. Supported fields: All text and HTML fields<br>
            <br>
            <strong>Double-click</strong> status message for debug info
        `;
        
        debugInfo.innerHTML = helpHtml;
        debugInfo.classList.remove('visually-hidden');
        debugInfo.setAttribute('aria-hidden', 'false');
        
        announceScreenReaderMessage('Help information displayed');
        
        // Give more time for help information
        clearDebugInfoAfterDelay(60000);
    });
    
    // Add keyboard support for help link
    document.getElementById('help-link').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.target.click();
        }
    });
});