import { TranslationServiceFactory } from './translator.js';

const translator = TranslationServiceFactory.createService('ollama');

// Default settings (should ideally be kept in one place, e.g., a shared module or duplicated for now)
const defaultSettings = {
    ollamaApiUrl: 'http://localhost:11434',
    llmModel: 'qwen3:4b',
    translationPrompt: `You are a precise Chinese translator. Your task is to translate the text between <translate> tags into Chinese.\n\nRules:\n1. Use the context between <context> tags to ensure accurate, authentic and natural translation\n2. Output ONLY the Chinese translation\n3. Do not add any explanations, comments, or parentheses\n4. Do not include the original text\n5. Do not add any additional text\n\n<context>\n{context.before} {text} {context.after}\n</context>\n<translate>{text}</translate>\n\nTranslation:/no_think`,
    temperature: 0.1,
    topP: 0.1,
    topK: 10,
    repeatPenalty: 1.2,
    dataStoragePath: '',
    logFilePath: '/tmp/ollama_translator.log'
};

// Function to get settings from storage or use defaults
async function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(defaultSettings, (items) => {
            resolve(items);
        });
    });
}

// Function to inject translated text into the page
function injectTranslatedText(tabId, selectedText, translatedText) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (selText, transText) => {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        // Create a container element with special attributes for undo functionality
        const container = document.createElement("span");
        container.className = "translation-modification";
        container.setAttribute("data-original-text", selText);
        container.setAttribute("data-translated-text", transText);
        container.style.position = "relative";
        container.style.cursor = "pointer";
        container.style.borderRadius = "2px";
        container.style.padding = "0 2px";
        container.style.transition = "background-color 0.2s";

        // Add hover effect to indicate it's undoable
        container.addEventListener("mouseenter", function() {
          this.style.backgroundColor = "rgba(255, 255, 0, 0.1)";
          this.setAttribute("title", "SHIFT+click to undo translation");
        });
        
        container.addEventListener("mouseleave", function() {
          this.style.backgroundColor = "transparent";
        });

        const translatedNode = document.createTextNode(transText + " ");
        const originalNode = document.createElement("span");
        originalNode.textContent = `(${selText})`;
        originalNode.style.color = "grey";

        container.appendChild(translatedNode);
        container.appendChild(originalNode);
        range.insertNode(container);
      }
    },
    args: [selectedText, translatedText]
  });
}

// Function to show error messages
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
      const settings = await getSettings();
      const translation = await translator.translate(info.selectionText, null /* context */, settings);
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
        const settings = await getSettings();
        const translation = await translator.translate(request.text, request.context, settings);
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