import os
import json
import re
import logging
from typing import Dict, Any
import openai
import google.generativeai as genai

logger = logging.getLogger(__name__)

# ─── DeepSeek client (OpenAI-compatible) ────────────────────────
def _get_deepseek_client():
    return openai.OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url="https://api.deepseek.com/v1",
        timeout=90,
    )


class DocumentationAgent:
    def __init__(self, provider: str = None):
        self.provider = provider or os.getenv("LLM_PROVIDER", "gemini")

        if self.provider == "openai":
            self.client = openai.OpenAI(
                api_key=os.getenv("OPENAI_API_KEY"),
                timeout=90,
            )
        elif self.provider == "gemini":
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            # Prefer gemini-1.5-flash — faster and cheaper than 2.5-flash
            self.model_name = "gemini-1.5-flash"
            try:
                available = [
                    m.name for m in genai.list_models()
                    if "generateContent" in m.supported_generation_methods
                ]
                flash_models = [m for m in available if "flash" in m and "1.5" in m]
                if flash_models:
                    name = flash_models[0]
                    self.model_name = name.replace("models/", "") if name.startswith("models/") else name
            except Exception:
                pass  # Stick with default
            self.model = genai.GenerativeModel(self.model_name)
            logger.info(f"[Agent] Using Gemini model: {self.model_name}")

    # ─── JSON utilities ────────────────────────────────────────────
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
        for _ in range(100):
            temp_str = temp_str.strip()
            if not temp_str:
                break
            if temp_str.endswith(','):
                temp_str = temp_str[:-1].strip()
                continue

            new_stack = []
            in_s = esc = False
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
                    elif c in ('}', ']') and new_stack:
                        new_stack.pop()

            closing = "".join("}" if c == "{" else "]" for c in reversed(new_stack))
            try:
                return json.loads(temp_str + closing)
            except Exception:
                if temp_str.endswith('"'):
                    idx = temp_str[:-1].rfind('"')
                    if idx != -1:
                        temp_str = temp_str[:idx].strip()
                        continue
                temp_str = temp_str[:-1].strip()

        raise ValueError("Could not repair JSON")

    def extract_json(self, text: str) -> Dict[str, Any]:
        text = text.strip()
        cleaned = text
        if cleaned.startswith("```json"):
            cleaned = cleaned.split("```json")[1].split("```")[0].strip()
        elif cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1].split("```")[0].strip()

        try:
            return json.loads(cleaned)
        except Exception:
            pass

        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass

        start = cleaned.find('{')
        if start != -1:
            return self.repair_json(cleaned[start:])

        raise ValueError(f"No valid JSON found. Snippet: {text[:200]}")

    # ─── DeepSeek fallback ─────────────────────────────────────────
    def _generate_with_deepseek(self, system_prompt: str, user_content: str) -> Dict[str, Any]:
        logger.info("[Agent] Falling back to DeepSeek")
        client = _get_deepseek_client()
        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            response_format={"type": "json_object"},
            max_tokens=4096,
            temperature=0.1,
        )
        return self.extract_json(response.choices[0].message.content)

    # ─── Main generation ───────────────────────────────────────────
    def generate_documentation(self, codebase_context: Dict[str, Any]) -> Dict[str, Any]:
        # NOTE: We intentionally omit "inline_comments" — it's the biggest token consumer
        # and not needed for the preview. It can be added as a separate "Deep Mode" later.
        system_prompt = """
You are an expert senior documentation engineer.
Generate professional documentation for the provided codebase.

Return a VALID JSON object with EXACTLY these three keys:
1. "readme": A high-quality README.md with:
   - Professional badges (build status, license, tech stack)
   - Clear project overview
   - Quick Start / Installation instructions
   - Project structure table
   - Rich markdown formatting
2. "api_docs": Comprehensive API/function documentation for all public endpoints and functions.
3. "mermaid_diagram": A valid Mermaid.js diagram (flowchart or sequence) showing the architecture.

CRITICAL RULES:
- Output ONLY raw JSON — no markdown fences, no explanation text.
- Keep each value concise but complete.
- Be technical, clear, and professional.
"""
        user_content = f"Codebase Context:\n{json.dumps(codebase_context, indent=2)}"

        if self.provider == "openai":
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",  # faster + cheaper than gpt-4o
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                response_format={"type": "json_object"},
                max_tokens=4096,
                temperature=0.1,
            )
            return self.extract_json(response.choices[0].message.content)

        elif self.provider == "gemini":
            try:
                model = genai.GenerativeModel(
                    model_name=self.model_name,
                    system_instruction=system_prompt,
                )
                response = model.generate_content(
                    user_content,
                    generation_config=genai.types.GenerationConfig(
                        response_mime_type="application/json",
                        max_output_tokens=4096,
                        temperature=0.1,
                    ),
                    request_options={"timeout": 90},
                )
                logger.info(f"[Agent] Gemini generation successful")
                return self.extract_json(response.text)

            except Exception as gemini_err:
                err_str = str(gemini_err)
                is_rate_limit = any(kw in err_str for kw in ["429", "quota", "rate", "ResourceExhausted", "RESOURCE_EXHAUSTED"])

                if is_rate_limit:
                    logger.warning(f"[Agent] Gemini quota exceeded, switching to DeepSeek")
                else:
                    logger.warning(f"[Agent] Gemini failed ({type(gemini_err).__name__}), trying fallback prompt")
                    # Try plain-prompt style before giving up on Gemini
                    try:
                        response = self.model.generate_content(
                            f"{system_prompt}\n\n{user_content}",
                            generation_config=genai.types.GenerationConfig(
                                max_output_tokens=4096,
                                temperature=0.1,
                            ),
                        )
                        return self.extract_json(response.text)
                    except Exception as fallback_err:
                        logger.warning(f"[Agent] Gemini fallback also failed: {fallback_err}")

                # DeepSeek as final fallback
                if os.getenv("DEEPSEEK_API_KEY"):
                    return self._generate_with_deepseek(system_prompt, user_content)

                raise RuntimeError(f"All AI providers failed. Last error: {err_str[:200]}")

        raise RuntimeError("Invalid LLM provider configured.")
