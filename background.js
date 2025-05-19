import { TranslationServiceFactory } from './translator.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translateText",
    title: "Translate by My Translator",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translateText" && info.selectionText) {
    const originalText = info.selectionText;
    
    try {
      const translator = TranslationServiceFactory.createService();
      const translatedText = await translator.translate(originalText);

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: replaceText,
        args: [translatedText, originalText]
      });
    } catch (error) {
      console.error('Translation failed:', error);
      // You might want to show an error message to the user here
    }
  }
});

function replaceText(translatedText, originalText) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const translatedNode = document.createTextNode(translatedText + " ");
  const originalNode = document.createElement("span");
  originalNode.textContent = `(${originalText})`;
  originalNode.style.color = "grey";

  range.insertNode(originalNode);
  range.insertNode(translatedNode);
  selection.removeAllRanges();
} 