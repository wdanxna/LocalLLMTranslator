document.addEventListener('DOMContentLoaded', () => {
    // Default settings
    const defaultSettings = {
        ollamaApiUrl: 'http://localhost:11434',
        llmModel: 'qwen3:4b',
        translationPrompt: `You are a precise Chinese translator. Your task is to translate the text between <translate> tags into Chinese.\n\nRules:\n1. Use the context between <context> tags to ensure accurate, authentic and natural translation\n2. Output ONLY the Chinese translation\n3. Do not add any explanations, comments, or parentheses\n4. Do not include the original text\n5. Do not add any additional text\n\n<context>\n{context.before} {text} {context.after}\n</context>\n<translate>{text}</translate>\n\nTranslation:/no_think`,
        temperature: 0.1,
        topP: 0.1,
        topK: 10,
        repeatPenalty: 1.2,
        dataStoragePath: '', // Default to empty, user can specify
        logFilePath: '/tmp/ollama_translator.log' // Platform-dependent, might need adjustment
    };

    // UI Elements
    const ollamaApiUrlInput = document.getElementById('ollamaApiUrl');
    const llmModelSelect = document.getElementById('llmModel');
    const refreshModelsButton = document.getElementById('refreshModels');
    const translationPromptTextarea = document.getElementById('translationPrompt');
    const temperatureInput = document.getElementById('temperature');
    const topPInput = document.getElementById('topP');
    const topKInput = document.getElementById('topK');
    const repeatPenaltyInput = document.getElementById('repeatPenalty');
    const dataStoragePathInput = document.getElementById('dataStoragePath');
    const logFilePathInput = document.getElementById('logFilePath');
    const saveButton = document.getElementById('save');
    const saveStatusDiv = document.getElementById('saveStatus');
    const resetButtons = document.querySelectorAll('.reset-btn');

    // --- Functions ---

    // Fetch available models from the Ollama API
    async function fetchModels(apiUrl) {
        llmModelSelect.innerHTML = '<option value="">Loading models...</option>';
        try {
            const response = await fetch(`${apiUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            const data = await response.json();
            llmModelSelect.innerHTML = ''; // Clear loading/error message
            if (data.models && data.models.length > 0) {
                data.models.forEach(model => {
                    const option = document.createElement('option');
                    option.value = model.name;
                    option.textContent = model.name;
                    llmModelSelect.appendChild(option);
                });
            } else {
                llmModelSelect.innerHTML = '<option value="">No models found or API not compatible</option>';
            }
        } catch (error) {
            console.error('Error fetching models:', error);
            llmModelSelect.innerHTML = `<option value="">Error fetching models: ${error.message}</option>`;
        }
    }

    // Load settings from chrome.storage.sync or use defaults
    function loadSettings() {
        chrome.storage.sync.get(defaultSettings, (items) => {
            ollamaApiUrlInput.value = items.ollamaApiUrl;
            translationPromptTextarea.value = items.translationPrompt;
            temperatureInput.value = items.temperature;
            topPInput.value = items.topP;
            topKInput.value = items.topK;
            repeatPenaltyInput.value = items.repeatPenalty;
            dataStoragePathInput.value = items.dataStoragePath;
            logFilePathInput.value = items.logFilePath;

            fetchModels(items.ollamaApiUrl).then(() => {
                // Set the selected model after models are loaded
                if (items.llmModel) {
                    llmModelSelect.value = items.llmModel;
                    // If the saved model is not in the list, it won't be selected, which is fine.
                }
            });
        });
    }

    // Save settings to chrome.storage.sync
    function saveSettings() {
        const settings = {
            ollamaApiUrl: ollamaApiUrlInput.value,
            llmModel: llmModelSelect.value,
            translationPrompt: translationPromptTextarea.value,
            temperature: parseFloat(temperatureInput.value),
            topP: parseFloat(topPInput.value),
            topK: parseInt(topKInput.value, 10),
            repeatPenalty: parseFloat(repeatPenaltyInput.value),
            dataStoragePath: dataStoragePathInput.value,
            logFilePath: logFilePathInput.value
        };

        chrome.storage.sync.set(settings, () => {
            saveStatusDiv.textContent = 'Settings saved!';
            setTimeout(() => { saveStatusDiv.textContent = ''; }, 3000);
        });
    }

    // Reset a specific option to its default value
    function resetOption(optionKey) {
        const defaultValue = defaultSettings[optionKey];
        switch (optionKey) {
            case 'ollamaApiUrl': ollamaApiUrlInput.value = defaultValue; break;
            case 'llmModel': 
                fetchModels(ollamaApiUrlInput.value || defaultSettings.ollamaApiUrl).then(() => {
                     llmModelSelect.value = defaultValue;
                });
                break;
            case 'translationPrompt': translationPromptTextarea.value = defaultValue; break;
            case 'temperature': temperatureInput.value = defaultValue; break;
            case 'topP': topPInput.value = defaultValue; break;
            case 'topK': topKInput.value = defaultValue; break;
            case 'repeatPenalty': repeatPenaltyInput.value = defaultValue; break;
            case 'dataStoragePath': dataStoragePathInput.value = defaultValue; break;
            case 'logFilePath': logFilePathInput.value = defaultValue; break;
        }
        // Optionally, immediately save after reset or let user click save
        // saveSettings(); 
        saveStatusDiv.textContent = `${optionKey} reset to default. Click Save Settings to apply.`;
         setTimeout(() => { saveStatusDiv.textContent = ''; }, 5000);
    }

    // --- Event Listeners ---
    saveButton.addEventListener('click', saveSettings);

    refreshModelsButton.addEventListener('click', () => {
        const currentApiUrl = ollamaApiUrlInput.value || defaultSettings.ollamaApiUrl;
        fetchModels(currentApiUrl);
    });

    resetButtons.forEach(button => {
        button.addEventListener('click', (event) => {
            const optionKey = event.target.dataset.option;
            if (optionKey) {
                resetOption(optionKey);
            }
        });
    });
    
    ollamaApiUrlInput.addEventListener('change', () => {
        // When API URL changes, try to refresh models
        fetchModels(ollamaApiUrlInput.value || defaultSettings.ollamaApiUrl);
    });

    // --- Initial Load ---
    loadSettings();
}); 