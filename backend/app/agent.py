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

    def extract_json(self, text: str) -> Dict[str, Any]:
        # Try to find JSON block
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except:
                pass
        
        # Try simple cleanup
        text = text.strip()
        if text.startswith("```json"):
            text = text.split("```json")[1].split("```")[0].strip()
        elif text.startswith("```"):
            text = text.split("```")[1].split("```")[0].strip()
        
        try:
            return json.loads(text)
        except Exception as e:
            raise ValueError(f"Failed to parse JSON: {str(e)}\nRaw: {text[:200]}")

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
            return json.loads(response.choices[0].message.content)

        elif self.provider == "gemini":
            full_prompt = f"{system_prompt}\n\n{user_content}"
            response = self.model.generate_content(
                full_prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=8192,
                    temperature=0.1
                )
            )
            return self.extract_json(response.text)

        return {"error": "Invalid provider"}
