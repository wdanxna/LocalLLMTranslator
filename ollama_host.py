#!/usr/bin/env python3
import sys
import json
import struct
import http.client
import urllib.parse
import logging

# Set up logging
logging.basicConfig(
    filename='/tmp/ollama_translator.log',
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

import os
logging.info(f"script started - PID: {os.getpid()}")

def read_message():
    try:
        # Read the message length (first 4 bytes)
        text_length_bytes = sys.stdin.buffer.read(4)
        if len(text_length_bytes) == 0:
            logging.info("No message length bytes received")
            return None
        
        # Unpack message length as 32-bit integer
        text_length = struct.unpack('I', text_length_bytes)[0]
        logging.debug(f"Received message length: {text_length}")
        
        # Read the text of the message
        text = sys.stdin.buffer.read(text_length).decode('utf-8')
        message = json.loads(text)
        logging.info(f"Received message: {message}")
        return message
    except Exception as e:
        logging.error(f"Error reading message: {str(e)}")
        return None

def send_message(message):
    try:
        # Convert the message to JSON
        message_json = json.dumps(message)
        message_bytes = message_json.encode('utf-8')
        
        # Pack message length as 32-bit integer
        sys.stdout.buffer.write(struct.pack('I', len(message_bytes)))
        sys.stdout.buffer.write(message_bytes)
        sys.stdout.buffer.flush()
        logging.info(f"Sent message: {message}")
    except Exception as e:
        logging.error(f"Error sending message: {str(e)}")

def translate_text(text, context=None):
    try:
        logging.info(f"Attempting to translate text: {text}")
        logging.info(f"Context: {context}")
        
        # Prepare the request to Ollama
        conn = http.client.HTTPConnection('localhost', 11434)
        headers = {'Content-Type': 'application/json'}
        
        # Create a prompt that includes context
        prompt = f"""You are a precise Chinese translator. Your task is to translate the text between <translate> tags into Chinese.

Rules:
1. Use the context between <context> tags to ensure accurate, authentic and natural translation
2. Output ONLY the Chinese translation
3. Do not add any explanations, comments, or parentheses
4. Do not include the original text
5. Do not add any additional text
6. Only translate the text between <translate> tags, nothing else

<context>
{context.get('before', '')} {text} {context.get('after', '')}
</context>
<translate>{text}</translate>

Translation:/no_think"""
        logging.info(f"Prompt: {prompt}")
        body = json.dumps({
            "model": "qwen3:4b",
            "prompt": prompt,
            "stream": False,
            # "temperature": 0.12,  # Lower temperature for more focused output
            # "top_p": 0.1,       # More conservative sampling
            "top_k": 5,        # Limit token choices
            "repeat_penalty": 1.15,  # Slightly penalize repetition
            # "stop": ["</context>", "\n","(", "（", "【", "「", "『", "（", "）", "】", "」", "』", "）", "Translation:", "翻译：", "译文："]  # Stop at these tokens
        })
        
        # Send request to Ollama
        logging.debug("Sending request to Ollama")
        conn.request('POST', '/api/generate', body, headers)
        response = conn.getresponse()
        
        if response.status != 200:
            error_msg = f"Ollama API error: {response.status} {response.reason}"
            logging.error(error_msg)
            return {"error": error_msg}
        
        # Parse response
        result = json.loads(response.read().decode('utf-8'))
        translation = result.get('response', '').strip()
        logging.info(f"Received translation: {translation}")
        translation = translation.split("\n\n")[-1]
        
        return {"result": translation}
    except Exception as e:
        error_msg = str(e)
        logging.error(f"Translation error: {error_msg}")
        return {"error": error_msg}
    finally:
        conn.close()

def main():
    logging.info("Native messaging host started")
    send_message({"status": "ready"})
    try:
        while True:
            message = read_message()
            if message is None:
                logging.info("No message received, exiting")
                break
                
            if message.get('type') == 'translate':
                text = message.get('text', '')
                context = message.get('context', {})
                if not text:
                    logging.warning("No text provided for translation")
                    send_message({"error": "No text provided for translation"})
                    continue
                    
                result = translate_text(text, context)
                send_message(result)
            else:
                logging.warning(f"Unknown message type: {message.get('type')}")
                send_message({"error": "Unknown message type"})
    except Exception as e:
        logging.error(f"Main loop error: {str(e)}")
    finally:
        logging.info("Native messaging host stopped")

if __name__ == '__main__':
    main() 