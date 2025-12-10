## About
This extension allows you to use local deployed LLMs to translate text in place in the browser.

When translating, few text before and after the translating text is also sent for translation as context for better accuracy.


**Note**: 
1. Ollama is used during the development and testing.
2. This extension is not published on Chrome Store, however, both Edge and Chrome should work fine.
3. As a consequence of unpublished extension, you need to load it under developer mode, ask any LLM for how to install an extension from source.

## Usage
Configure your local API endpoint in extension's option page, It would automatically fetch all available models for you choose from if the API is working.

After all configuration, highlight a text you want to translate and press the "SHIFT" key, the translation would appear in place at the original text.

press ENTER again to hide the translation.

The prompt of tranlsation can also be customized in the extension's option page.

## Contribution
Any contribution is welcomed

## License
MIT


