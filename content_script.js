let shiftPressTime = null;
const MAX_SHIFT_TAP_DURATION = 250; // Maximum duration in milliseconds for a "brief tap"

document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift' && !event.repeat) {
        // Record the timestamp when SHIFT is pressed down
        shiftPressTime = Date.now();
    }
});

document.addEventListener('keyup', (event) => {
    if (event.key === 'Shift' && shiftPressTime !== null) {
        const shiftReleaseTime = Date.now();
        const shiftDuration = shiftReleaseTime - shiftPressTime;
        
        // Reset the press time
        shiftPressTime = null;
        
        // Only trigger translation if it was a brief tap (not a long hold)
        if (shiftDuration <= MAX_SHIFT_TAP_DURATION) {
            const selectedText = window.getSelection().toString().trim();

            if (selectedText) {
                // Try to get context
                try {
                    const selection = window.getSelection();
                    let context = { before: '', after: '' };

                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        
                        // Text before selection
                        const preCaretRange = range.cloneRange();
                        preCaretRange.selectNodeContents(range.startContainer.parentNode || document.body); // Select parent or body as a boundary
                        preCaretRange.setEnd(range.startContainer, range.startOffset);
                        const beforeFullText = preCaretRange.toString();
                        context.before = beforeFullText.trim().split(/\s+/).slice(-10).join(' ');

                        // Text after selection
                        const postCaretRange = range.cloneRange();
                        postCaretRange.selectNodeContents(range.endContainer.parentNode || document.body); // Select parent or body as a boundary
                        postCaretRange.setStart(range.endContainer, range.endOffset);
                        const afterFullText = postCaretRange.toString();
                        context.after = afterFullText.trim().split(/\s+/).slice(0, 10).join(' ');
                    }
                    
                    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                        chrome.runtime.sendMessage({
                            type: 'translateTextHotkey',
                            text: selectedText,
                            context: context
                        }, response => {
                            if (chrome.runtime.lastError) {
                                console.error('Error sending message from content script:', chrome.runtime.lastError.message);
                                // Optionally, inform the user via a temporary message on the page
                                // showTemporaryMessage(`Translation trigger failed: ${chrome.runtime.lastError.message}`);
                            } else {
                                // console.log('Hotkey message sent, response:', response);
                            }
                        });
                    } else {
                        console.error("chrome.runtime.sendMessage is not available in this context.");
                        // Optionally, inform the user
                        // showTemporaryMessage("Translation service is currently unavailable from this page context.");
                    }
                } catch (error) {
                    console.error('Error getting context:', error);
                }
            }
        }
    }
});

// Helper to show a temporary message on the page (optional)
function showTemporaryMessage(message, duration = 3000) {
    const div = document.createElement('div');
    div.textContent = message;
    div.style.position = 'fixed';
    div.style.bottom = '20px';
    div.style.left = '20px';
    div.style.backgroundColor = 'black';
    div.style.color = 'white';
    div.style.padding = '10px';
    div.style.zIndex = '10000';
    div.style.borderRadius = '5px';
    document.body.appendChild(div);
    setTimeout(() => {
        document.body.removeChild(div);
    }, duration);
} 