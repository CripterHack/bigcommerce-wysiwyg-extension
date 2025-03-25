// Background script to handle extension events
chrome.runtime.onInstalled.addListener(() => {
    console.log('BigCommerce WYSIWYG Editor extension installed');
    
    // Initialize extension settings with defaults if not already set
    chrome.storage.local.get('settings', (result) => {
        if (!result.settings) {
            const defaultSettings = {
                enabled: true,
                lastUpdated: new Date().toISOString()
            };
            
            chrome.storage.local.set({ settings: defaultSettings }, () => {
                console.log('Default settings initialized');
            });
        }
    });
});

// Update extension icon based on the current page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Check if we're on BigCommerce
        const isBigCommerce = tab.url.includes('.mybigcommerce.com');
        
        // Update icon to show active/inactive state
        if (isBigCommerce) {
            chrome.action.setIcon({
                path: {
                    16: "images/icon16.png",
                    48: "images/icon48.png",
                    128: "images/icon128.png"
                },
                tabId: tabId
            });
        } else {
            // Optional: Use grayscale icons for inactive state
            // This would require creating grayscale versions of the icons
        }
    }
});

// Handle errors
chrome.runtime.onError.addListener((error) => {
    console.error('Extension error:', error.message);
});