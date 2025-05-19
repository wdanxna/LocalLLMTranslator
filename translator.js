// Abstract base class for translation services
class TranslationService {
    async translate(text) {
        throw new Error('translate() method must be implemented');
    }
}

// Ollama-based translation service using native messaging
class OllamaTranslateService extends TranslationService {
    constructor() {
        super();
        this.port = null;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async connect() {
        if (!this.port) {
            try {
                this.port = chrome.runtime.connectNative('com.ollama.translator');
                
                return new Promise((resolve, reject) => {
                    this.port.onMessage.addListener((response) => {
                        if (response.error) {
                            reject(new Error(response.error));
                        } else {
                            resolve(response.result);
                        }
                    });

                    this.port.onDisconnect.addListener(() => {
                        const error = chrome.runtime.lastError;
                        if (error) {
                            console.error('Native messaging error:', error);
                            reject(new Error(`Connection error: ${error.message}`));
                        }
                        this.port = null;
                    });
                });
            } catch (error) {
                console.error('Connection error:', error);
                throw new Error(`Failed to connect to native host: ${error.message}`);
            }
        }
    }

    async translate(text) {
        try {
            if (this.retryCount >= this.maxRetries) {
                this.retryCount = 0;
                throw new Error('Maximum retry attempts reached');
            }

            console.log('Connecting to translation service');
            await this.connect();
            console.log('Connected');
            
            return new Promise((resolve, reject) => {
                const messageListener = (response) => {
                    this.port.onMessage.removeListener(messageListener);
                    if (response.error) {
                        this.retryCount++;
                        reject(new Error(response.error));
                    } else {
                        this.retryCount = 0;
                        resolve(response.result);
                    }
                };

                this.port.onMessage.addListener(messageListener);
                this.port.postMessage({
                    type: 'translate',
                    text: text
                });
            });
        } catch (error) {
            console.error('Translation error:', error);
            if (error.message.includes('Connection error') || error.message.includes('Failed to connect')) {
                this.retryCount++;
                if (this.retryCount < this.maxRetries) {
                    console.log(`Retrying translation (attempt ${this.retryCount + 1}/${this.maxRetries})`);
                    return this.translate(text);
                }
            }
            throw error;
        }
    }
}

// Factory to create translation service instances
class TranslationServiceFactory {
    static createService(serviceType = 'ollama') {
        switch (serviceType.toLowerCase()) {
            case 'ollama':
                return new OllamaTranslateService();
            default:
                throw new Error(`Unknown translation service: ${serviceType}`);
        }
    }
}

// Export the factory for use in other files
export { TranslationServiceFactory }; 