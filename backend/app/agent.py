import os
import json
import re
from typing import Dict, Any
import openai
import google.generativeai as genai

class DocumentationAgent:
    def __init__(self, provider: str = None):
        self.provider = provider or os.getenv("LLM_PROVIDER", "openai")
        
        if self.provider == "openai":
            self.client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        elif self.provider == "gemini":
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            try:
                available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
                if available_models:
                    self.model_name = next((m for m in available_models if 'flash' in m), available_models[0])
                    if self.model_name.startswith("models/"):
                        self.model_name = self.model_name.replace("models/", "")
                else:
                    self.model_name = 'gemini-1.5-flash'
            except:
                self.model_name = 'gemini-1.5-flash'
            
            self.model = genai.GenerativeModel(self.model_name)

    def repair_json(self, s: str) -> Dict[str, Any]:
        s = s.strip()
        if not s:
            return {}
        
        in_string = False
        escape = False
        stack = []
        repaired = []
        
        for char in s:
            if in_string:
                if escape:
                    escape = False
                    repaired.append(char)
                elif char == '\\':
                    escape = True
                    repaired.append(char)
                elif char == '"':
                    in_string = False
                    repaired.append(char)
                else:
                    repaired.append(char)
            else:
                if char == '"':
                    in_string = True
                    repaired.append(char)
                elif char in ('{', '['):
                    stack.append(char)
                    repaired.append(char)
                elif char in ('}', ']'):
                    if stack:
                        stack.pop()
                    repaired.append(char)
                else:
                    repaired.append(char)
                    
        if in_string and escape:
            repaired.pop()
        if in_string:
            repaired.append('"')
            
        temp_str = "".join(repaired).strip()
        
        for attempt in range(100):
            temp_str = temp_str.strip()
            if not temp_str:
                break
            if temp_str.endswith(','):
                temp_str = temp_str[:-1].strip()
                continue
                
            new_stack = []
            in_s = False
            esc = False
            for c in temp_str:
                if in_s:
                    if esc:
                        esc = False
                    elif c == '\\':
                        esc = True
                    elif c == '"':
                        in_s = False
                else:
                    if c == '"':
                        in_s = True
                    elif c in ('{', '['):
                        new_stack.append(c)
                    elif c in ('}', ']'):
                        if new_stack:
                            new_stack.pop()
                            
            closing = ""
            for char in reversed(new_stack):
                if char == '{':
                    closing += '}'
                elif char == '[':
                    closing += ']'
                    
            try:
                return json.loads(temp_str + closing)
            except Exception:
                if temp_str.endswith('"'):
                    last_quote_idx = temp_str[:-1].rfind('"')
                    if last_quote_idx != -1:
                        temp_str = temp_str[:last_quote_idx].strip()
                        continue
                temp_str = temp_str[:-1].strip()
                
        raise ValueError("Could not repair JSON")

    def extract_json(self, text: str) -> Dict[str, Any]:
        text = text.strip()
        
        # 1. Try standard cleanup of markdown blocks if present
        cleaned_text = text
        if cleaned_text.startswith("```json"):
            cleaned_text = cleaned_text.split("```json")[1].split("```")[0].strip()
        elif cleaned_text.startswith("```"):
            cleaned_text = cleaned_text.split("```")[1].split("```")[0].strip()
            
        # Try to parse standard JSON
        try:
            return json.loads(cleaned_text)
        except Exception:
            pass
            
        # Try to find standard JSON block using regex if there was wrapping text
        match = re.search(r'\{.*\}', cleaned_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
                
        # If all else fails, use our highly robust partial JSON repair function!
        try:
            # We want to find the first `{` and repair from there
            start_idx = cleaned_text.find('{')
            if start_idx != -1:
                return self.repair_json(cleaned_text[start_idx:])
        except Exception as e:
            # Re-raise with descriptive message
            raise ValueError(f"Failed to parse JSON (repair attempted): {str(e)}\nRaw snippet: {text[:200]}")
            
        raise ValueError(f"Failed to parse JSON: No valid JSON object start found.\nRaw snippet: {text[:200]}")

    def generate_documentation(self, codebase_context: Dict[str, Any]) -> Dict[str, Any]:
        system_prompt = """
        You are an expert senior documentation engineer. 
        Your task is to generate industry-standard, professional documentation for a codebase.
        
        You MUST return a VALID JSON object with exactly these four keys:
        1. "readme": A high-quality, professional README.md. Include:
           - Professional badges (Status, License, Tech stack).
           - Clear project overview and "What It Does".
           - Detailed "Quick Start" and installation instructions.
           - Project structure table.
           - Rich markdown formatting (tables, bold text, etc.).
        2. "api_docs": Comprehensive API documentation including all functions and endpoints.
        3. "inline_comments": A list of { "file_path": str, "code_with_comments": str } adding JSDoc/Docstring style comments.
        4. "mermaid_diagram": A beautiful Mermaid.js diagram representing the code flow or architecture.

        Rules:
        - Output ONLY valid JSON.
        - Be technical, clear, and extremely professional.
        """

        user_content = f"Codebase Context:\n{json.dumps(codebase_context, indent=2)}"

        if self.provider == "openai":
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                response_format={"type": "json_object"}
            )
            return self.extract_json(response.choices[0].message.content)

        elif self.provider == "gemini":
            try:
                # Use native JSON mode and system instruction for maximum reliability
                model = genai.GenerativeModel(
                    model_name=self.model_name,
                    system_instruction=system_prompt
                )
                response = model.generate_content(
                    user_content,
                    generation_config=genai.types.GenerationConfig(
                        response_mime_type="application/json",
                        max_output_tokens=8192,
                        temperature=0.1
                    )
                )
                text = response.text
            except Exception:
                # Fallback to the original prompting style if native JSON mode / system instruction fails
                full_prompt = f"{system_prompt}\n\n{user_content}"
                response = self.model.generate_content(
                    full_prompt,
                    generation_config=genai.types.GenerationConfig(
                        max_output_tokens=8192,
                        temperature=0.1
                    )
                )
                text = response.text
            
            return self.extract_json(text)

        return {"error": "Invalid provider"}
