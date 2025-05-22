#!/usr/bin/env python3
import sys
import json
import struct
import http.client
import urllib.parse
import logging
import os
import tempfile

# Global logger instance - will be configured by settings from the first message
logger = logging.getLogger("ollama_translator_host")
logger.setLevel(logging.DEBUG) # Default level, can be overridden
# Default handler to console in case file setup fails or no path is given early
console_handler = logging.StreamHandler(sys.stderr)
console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - PID:%(process)d - %(message)s'))
logger.addHandler(console_handler)

initial_settings_applied = False

def setup_logging(log_file_path_from_settings):
    global initial_settings_applied
    if initial_settings_applied and logger.handlers:
        # If already configured by a file path, don't reconfigure unless path changes
        # This simple check might need refinement if the path could change mid-session
        for handler in logger.handlers:
            if isinstance(handler, logging.FileHandler) and handler.baseFilename == log_file_path_from_settings:
                return
            
    # Remove existing handlers before adding a new file handler to avoid duplicate logs
    for handler in list(logger.handlers):
        logger.removeHandler(handler)

    chosen_log_path = ""
    try:
        if log_file_path_from_settings:
            chosen_log_path = os.path.expanduser(log_file_path_from_settings) # Expand ~ for user dir
            # Ensure directory exists for the log file
            log_dir = os.path.dirname(chosen_log_path)
            if log_dir: # Only create if path includes a directory
                 os.makedirs(log_dir, exist_ok=True)
            file_handler = logging.FileHandler(chosen_log_path, mode='a')
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - PID:%(process)d - %(message)s')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            logger.info(f"Logging configured to file: {chosen_log_path}")
            initial_settings_applied = True # Mark that file logging is set up
        else:
            raise ValueError("No log file path provided in settings.")
    except Exception as e:
        # Fallback to temp dir if specified path fails or is empty
        try:
            temp_dir = tempfile.gettempdir()
            fallback_log_path = os.path.join(temp_dir, 'ollama_translator_host_fallback.log')
            file_handler = logging.FileHandler(fallback_log_path, mode='a')
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - PID:%(process)d - FALLBACK - %(message)s')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            logger.error(f"Failed to set up logging with path '{chosen_log_path}': {e}. Fallback to: {fallback_log_path}")
            initial_settings_applied = True # Mark that fallback logging is set up
        except Exception as e_fallback:
            # If all else fails, log to stderr (already configured by default handler)
            logger.error(f"Critical error setting up any file logging: {e_fallback}. Logging to stderr only.")
            logger.addHandler(console_handler) # Ensure console handler is still there

def read_message():
    try:
        text_length_bytes = sys.stdin.buffer.read(4)
        if len(text_length_bytes) == 0:
            logger.info("No message length bytes received, host might be closing.")
            return None
        text_length = struct.unpack('I', text_length_bytes)[0]
        logger.debug(f"Received message length: {text_length}")
        text = sys.stdin.buffer.read(text_length).decode('utf-8')
        message = json.loads(text)
        logger.info(f"Received message: {json.dumps(message)[:500]}...") # Log truncated message
        return message
    except struct.error as e:
        logger.error(f"Struct unpack error reading message length (likely pipe closed): {e}")
        return None # Indicate pipe closure
    except Exception as e:
        logger.error(f"Error reading message: {e}")
        return None

def send_message(message):
    try:
        message_json = json.dumps(message)
        message_bytes = message_json.encode('utf-8')
        sys.stdout.buffer.write(struct.pack('I', len(message_bytes)))
        sys.stdout.buffer.write(message_bytes)
        sys.stdout.buffer.flush()
        logger.info(f"Sent message: {json.dumps(message)}")
    except Exception as e:
        logger.error(f"Error sending message: {e}")

def translate_text(text, context, settings):
    logger.info(f"Translate request for text: '{text}' with context and settings.")
    try:
        api_url = settings.get('ollamaApiUrl', 'http://localhost:11434')
        model = settings.get('llmModel', 'qwen3:4b')
        prompt_template = settings.get('translationPrompt', '{text}') # Basic default if prompt is missing
        temperature = settings.get('temperature', 0.1)
        top_p = settings.get('topP', 0.1)
        top_k = settings.get('topK', 10)
        repeat_penalty = settings.get('repeatPenalty', 1.2)
        # Stop sequences are already part of the settings.get('translationPrompt') in the options page JS, but good to have a fallback.
        # However, the prompt now includes the actual stop instructions, so we retrieve the full prompt.
        # The `stop` parameter for the API call needs to be extracted if it was a separate field in settings.
        # For now, assuming stop sequences are primarily handled by prompt wording and API default behavior.

        # Construct the prompt using the template and provided data
        final_prompt = prompt_template.format(
            text=text,
            context_before=context.get('before', ''),
            context_after=context.get('after', '')
        )
        logger.debug(f"Using API URL: {api_url}, Model: {model}")
        logger.info(f"Final prompt being sent:\n{final_prompt}")

        parsed_url = urllib.parse.urlparse(api_url)
        hostname = parsed_url.hostname
        port = parsed_url.port
        api_path = parsed_url.path
        if not api_path or api_path == '/':
             api_path = '/api/generate' # Default for Ollama if base URL is given
        elif not api_path.endswith('/generate') and not api_path.endswith('/completions'): # OpenAI compat
            # If API path is something like /v1, append /generate or /completions based on common patterns
            # This is a heuristic. A better way would be an explicit API type setting.
            if 'openai' in api_url.lower() or 'v1' in api_url.lower():
                 api_path = os.path.join(api_path, 'chat/completions') if settings.get('apiType') == 'openai' else os.path.join(api_path, 'generate')
            else: # Default to generate if unsure
                api_path = os.path.join(api_path, 'generate')
        
        logger.debug(f"Connecting to host: {hostname}, port: {port}, path: {api_path}")

        conn = http.client.HTTPConnection(hostname, port if port else (443 if parsed_url.scheme == 'https' else 80))
        headers = {'Content-Type': 'application/json'}
        
        # Construct body according to typical Ollama /api/generate structure
        # For OpenAI compatibility, the structure would be different (e.g., messages array)
        # We will need a setting for API type (ollama vs openai) to adjust payload.
        # For now, assuming Ollama-like /api/generate or an OpenAI-like endpoint that can take a 'prompt' field.
        
        api_payload = {
            "model": model,
            "prompt": final_prompt,
            "stream": False,
            "options": { # Ollama specific way to pass parameters
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
                "repeat_penalty": repeat_penalty,
                # "stop": settings.get('stop_sequences', []) # if we add this to settings
            }
        }
        # If we wanted to support OpenAI chat/completions more directly:
        # if settings.get('apiType') == 'openai':
        #     api_payload = {
        #         "model": model,
        #         "messages": [{"role": "user", "content": final_prompt}],
        #         "temperature": temperature,
        #         "top_p": top_p,
        #         # top_k and repeat_penalty are not direct OpenAI params in chat completions
        #     }

        conn.request('POST', api_path, json.dumps(api_payload), headers)
        response = conn.getresponse()
        response_body = response.read().decode('utf-8')
        logger.debug(f"Ollama API response status: {response.status}")
        logger.debug(f"Ollama API response body: {response_body[:500]}...")

        if response.status != 200:
            error_msg = f"Ollama API error: {response.status} {response.reason}. Response: {response_body}"
            logger.error(error_msg)
            return {"error": error_msg}
        
        result_data = json.loads(response_body)
        
        # Extract translation based on typical Ollama /api/generate response or OpenAI /v1/completions
        translation = ""
        if 'response' in result_data: # Ollama style
            translation = result_data.get('response', '').strip()
        elif 'choices' in result_data and result_data['choices']:
            # OpenAI chat completion style
            if 'message' in result_data['choices'][0] and 'content' in result_data['choices'][0]['message']:
                translation = result_data['choices'][0]['message']['content'].strip()
            # OpenAI legacy completion style
            elif 'text' in result_data['choices'][0]:
                 translation = result_data['choices'][0]['text'].strip()
        else:
            logger.warning("Could not find standard 'response' or 'choices[0].text/message.content' in API output.")
            translation = response_body # Fallback to full body if unsure, might be noisy

        # Post-processing from user's previous changes
        translation = translation.split("\n\n")[-1]
        logger.info(f"Received translation from API: {translation}")
        return {"result": translation}

    except http.client.gaierror as e: # DNS resolution error
        error_msg = f"Network error (DNS resolution failed for {settings.get('ollamaApiUrl')}): {e}"
        logger.error(error_msg)
        return {"error": error_msg}
    except ConnectionRefusedError as e:
        error_msg = f"Connection refused for API URL: {settings.get('ollamaApiUrl')}. Is Ollama running and accessible? Error: {e}"
        logger.error(error_msg)
        return {"error": error_msg}
    except Exception as e:
        error_msg = f"General translation error: {e} (API URL: {settings.get('ollamaApiUrl')})"
        logger.error(error_msg, exc_info=True) # Log full traceback
        return {"error": error_msg}
    finally:
        if 'conn' in locals() and conn:
            conn.close()

def main():
    global initial_settings_applied
    logger.info("Native messaging host started. Waiting for first message to configure logging path.")
    
    # Send initial ready message (optional, but good for handshake)
    # send_message({"status": "host_ready_waiting_for_settings"})

    send_message({"status":"ready"})
    try:
        while True:
            message = read_message()
            if message is None: # Indicates pipe closed or critical read error
                logger.info("No message received or pipe closed, exiting main loop.")
                break
            
            settings_from_message = message.get('settings')
            if settings_from_message and not initial_settings_applied:
                log_path_setting = settings_from_message.get('logFilePath')
                setup_logging(log_path_setting)
                # After first setup, subsequent calls to setup_logging with the same path will do nothing.
            elif not settings_from_message and not initial_settings_applied:
                # First message didn't have settings, setup logging with default path
                logger.warning("First message did not contain settings. Setting up logging with default fallback.")
                setup_logging(None) # This will trigger fallback logging
            
            if message.get('type') == 'translate':
                text = message.get('text', '')
                context = message.get('context', {})
                
                if not settings_from_message:
                    logger.error("No settings provided in translate message. Cannot proceed.")
                    send_message({"error": "Host error: No settings provided with translation request."})
                    continue
                
                if not text:
                    logger.warning("No text provided for translation in message.")
                    send_message({"error": "No text provided for translation"})
                    continue
                
                logger.debug(f"Context: {context}")
                result = translate_text(text, context, settings_from_message)
                send_message(result)
            elif message.get('type') == 'ping': # Example: for testing connection
                 send_message({"status": "pong", "pid": os.getpid()})
            else:
                unknown_type = message.get('type', '[unknown]')
                logger.warning(f"Unknown message type received: {unknown_type}")
                send_message({"error": f"Unknown message type: {unknown_type}"})
                
    except KeyboardInterrupt:
        logger.info("Host received KeyboardInterrupt. Exiting.")
    except Exception as e:
        logger.error(f"Fatal error in main loop: {e}", exc_info=True)
    finally:
        logger.info("Native messaging host shutting down.")

if __name__ == '__main__':
    # Basic PID log at the very start to confirm script execution before full logging setup
    # This will go to stderr if no other handlers are configured yet.
    pid = os.getpid()
    sys.stderr.write(f"ollama_host.py started with PID: {pid}\n")
    sys.stderr.flush()
    main() 