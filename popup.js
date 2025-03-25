// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refresh-btn');
    const statusMsg = document.createElement('div');
    statusMsg.style.marginTop = '10px';
    statusMsg.style.fontSize = '12px';
    statusMsg.style.color = '#666';
    document.body.appendChild(statusMsg);
    
    // Check if we're on a BigCommerce site
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const currentTab = tabs[0];
        const isBigCommerce = currentTab && currentTab.url && currentTab.url.includes('.mybigcommerce.com');
        
        if (!isBigCommerce) {
            statusMsg.textContent = 'Not on a BigCommerce site';
            statusMsg.style.color = '#d9534f';
            refreshBtn.disabled = true;
            return;
        }
        
        statusMsg.textContent = 'Ready to enhance BigCommerce editor';
        statusMsg.style.color = '#5cb85c';
    });
    
    // Add click handler for refresh button
    refreshBtn.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || tabs.length === 0) {
                statusMsg.textContent = 'Error: Unable to connect to tab';
                statusMsg.style.color = '#d9534f';
                return;
            }
            
            try {
                chrome.tabs.sendMessage(tabs[0].id, {action: 'refresh-editors'}, (response) => {
                    // Handle potential errors
                    if (chrome.runtime.lastError) {
                        statusMsg.textContent = 'Error: Content script not responding';
                        statusMsg.style.color = '#d9534f';
                        console.error(chrome.runtime.lastError);
                        return;
                    }
                    
                    // Show success message
                    statusMsg.textContent = 'Editors refreshed successfully!';
                    statusMsg.style.color = '#5cb85c';
                    
                    // Reset message after 3 seconds
                    setTimeout(() => {
                        statusMsg.textContent = 'Ready to enhance BigCommerce editor';
                    }, 3000);
                });
            } catch (e) {
                statusMsg.textContent = 'Error: ' + e.message;
                statusMsg.style.color = '#d9534f';
                console.error(e);
            }
        });
    });
});