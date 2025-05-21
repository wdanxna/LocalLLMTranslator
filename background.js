import { TranslationServiceFactory } from './translator.js';

const translator = TranslationServiceFactory.createService('ollama');

// Function to inject translated text into the page
function injectTranslatedText(tabId, selectedText, translatedText) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (selText, transText) => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const translatedNode = document.createTextNode(transText + " ");
        const originalNode = document.createElement("span");
        originalNode.textContent = `(${selText})`;
        originalNode.style.color = "grey";

        range.insertNode(originalNode);
        range.insertNode(translatedNode);
      }
    },
    args: [selectedText, translatedText]
  });
}

// Function to show error messages (can be expanded or moved)
function showError(tabId, message) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg) => {
      alert(msg);
    },
    args: [message]
  });
}

// Create context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateText",
    title: "Translate to Chinese: %s",
    contexts: ["selection"]
  });
});

// Listener for context menu click
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translateText" && info.selectionText) {
    try {
      const translation = await translator.translate(info.selectionText);
      injectTranslatedText(tab.id, info.selectionText, translation);
    } catch (error) {
      console.error('Translation error:', error);
      showError(tab.id, `Translation failed: ${error.message}`);
    }
  }
});

// Listener for messages from content script (e.g., for hotkey)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "translateTextHotkey" && request.text) {
    (async () => {
      try {
        const translation = await translator.translate(request.text, request.context);
        if (sender.tab && sender.tab.id) {
          injectTranslatedText(sender.tab.id, request.text, translation);
        }
        sendResponse({ success: true, translation: translation });
      } catch (error) {
        console.error('Hotkey translation error:', error);
        if (sender.tab && sender.tab.id) {
          showError(sender.tab.id, `Hotkey translation failed: ${error.message}`);
        }
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indicates that the response is sent asynchronously
  }
}); 