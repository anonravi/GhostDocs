import os
import json
import re
import time
import logging
from typing import Dict, Any
import openai
import google.generativeai as genai

logger = logging.getLogger(__name__)


def _get_deepseek_client():
    return openai.OpenAI(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        base_url="https://api.deepseek.com/v1",
    )


class DocumentationAgent:
    def __init__(self, provider: str = None):
        self.provider = provider or os.getenv("LLM_PROVIDER", "gemini")

        if self.provider == "openai":
            self.client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        elif self.provider == "gemini":
            genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
            # Try to pick the fastest available flash model
            self.model_name = "gemini-1.5-flash"
            try:
                available = [
                    m.name for m in genai.list_models()
                    if "generateContent" in m.supported_generation_methods
                ]
                # Prefer 1.5-flash (fastest), fall back to any flash
                flash_15 = [m for m in available if "1.5-flash" in m]
                flash_any = [m for m in available if "flash" in m]
                chosen = flash_15 or flash_any
                if chosen:
                    name = chosen[0]
                    self.model_name = name.replace("models/", "")
            except Exception as e:
                logger.warning(f"[Agent] Could not list Gemini models: {e}")
            logger.info(f"[Agent] Gemini model selected: {self.model_name}")

    # ─── JSON extraction ──────────────────────────────────────────
    def extract_json(self, text: str) -> Dict[str, Any]:
        if not text:
            raise ValueError("Empty response from AI")

        text = text.strip()
        # Strip markdown fences
        for fence in ("```json", "```"):
            if text.startswith(fence):
                text = text.split(fence, 1)[1].rsplit("```", 1)[0].strip()
                break

        # Direct parse
        try:
            return json.loads(text)
        except Exception:
            pass

        # Find first { ... }
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(text[start:end])
            except Exception:
                pass

        # Repair incomplete JSON
        try:
            return self._repair_json(text[start:] if start != -1 else text)
        except Exception:
            pass

        raise ValueError(f"No valid JSON in response. Snippet: {text[:300]}")

    def _repair_json(self, s: str) -> Dict[str, Any]:
        """Close any unclosed brackets/braces."""
        stack = []
        in_str = esc = False
        for ch in s:
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
            else:
                if ch == '"':
                    in_str = True
                elif ch in ("{", "["):
                    stack.append("}" if ch == "{" else "]")
                elif ch in ("}", "]") and stack:
                    stack.pop()
        closing = "".join(reversed(stack))
        return json.loads(s.rstrip(",") + closing)

    # ─── DeepSeek fallback ────────────────────────────────────────
    def _generate_with_deepseek(self, system_prompt: str, user_content: str) -> Dict[str, Any]:
        key = os.getenv("DEEPSEEK_API_KEY")
        if not key:
            raise RuntimeError(
                "DeepSeek API key not configured. "
                "Add DEEPSEEK_API_KEY to Render environment variables."
            )
        logger.info("[Agent] Using DeepSeek as AI provider")
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

    # ─── Gemini call (single attempt) ─────────────────────────────
    def _call_gemini(self, system_prompt: str, user_content: str) -> Dict[str, Any]:
        """Call Gemini once. Raises on any error so caller can handle."""
        model = genai.GenerativeModel(
            model_name=self.model_name,
            system_instruction=system_prompt,
        )
        # NOTE: Do NOT pass request_options — not supported in all SDK versions
        response = model.generate_content(
            user_content,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                max_output_tokens=4096,
                temperature=0.1,
            ),
        )
        return self.extract_json(response.text)

    # ─── Main generation ──────────────────────────────────────────
    def generate_documentation(self, codebase_context: Dict[str, Any]) -> Dict[str, Any]:
        system_prompt = (
            "You are an expert senior documentation engineer.\n"
            "Generate professional documentation for the provided codebase.\n\n"
            "Return a VALID JSON object with EXACTLY these three keys:\n"
            '1. "readme": A high-quality README.md with professional badges, '
            "clear project overview, Quick Start, installation instructions, "
            "project structure table, and rich markdown formatting.\n"
            '2. "api_docs": Comprehensive API/function documentation for all '
            "public endpoints and functions.\n"
            '3. "mermaid_diagram": A valid Mermaid.js diagram (flowchart or '
            "sequence) showing the architecture.\n\n"
            "CRITICAL: Output ONLY raw JSON — no markdown fences, no explanation."
        )
        user_content = f"Codebase Context:\n{json.dumps(codebase_context, indent=2)}"

        # ── OpenAI path ──────────────────────────────────────────
        if self.provider == "openai":
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                response_format={"type": "json_object"},
                max_tokens=4096,
                temperature=0.1,
            )
            return self.extract_json(response.choices[0].message.content)

        # ── Gemini path with automatic DeepSeek fallback ─────────
        elif self.provider == "gemini":
            last_error = None

            # Attempt 1: Gemini with JSON mime type
            try:
                result = self._call_gemini(system_prompt, user_content)
                logger.info("[Agent] Gemini succeeded on first attempt")
                return result
            except Exception as e1:
                last_error = e1
                err_str = str(e1)
                logger.warning(f"[Agent] Gemini attempt 1 failed ({type(e1).__name__}): {err_str[:200]}")

            # Attempt 2: Gemini plain text (no JSON mime type) — helps with some errors
            is_quota = any(kw in str(last_error) for kw in ["429", "quota", "ResourceExhausted", "RESOURCE_EXHAUSTED"])
            if not is_quota:
                try:
                    logger.info("[Agent] Retrying Gemini without JSON mime type...")
                    model = genai.GenerativeModel(
                        model_name=self.model_name,
                        system_instruction=system_prompt,
                    )
                    response = model.generate_content(
                        user_content,
                        generation_config=genai.types.GenerationConfig(
                            max_output_tokens=4096,
                            temperature=0.1,
                        ),
                    )
                    result = self.extract_json(response.text)
                    logger.info("[Agent] Gemini succeeded on second attempt (plain)")
                    return result
                except Exception as e2:
                    last_error = e2
                    logger.warning(f"[Agent] Gemini attempt 2 failed: {str(e2)[:200]}")
            else:
                # Rate-limited — short wait before trying DeepSeek
                logger.warning("[Agent] Gemini quota exceeded, switching to DeepSeek immediately")
                time.sleep(2)

            # Attempt 3: DeepSeek fallback (always try — any Gemini failure)
            try:
                result = self._generate_with_deepseek(system_prompt, user_content)
                logger.info("[Agent] DeepSeek succeeded")
                return result
            except Exception as e3:
                logger.error(f"[Agent] DeepSeek also failed: {e3}")
                raise RuntimeError(
                    f"All AI providers failed. "
                    f"Gemini: {str(last_error)[:150]} | "
                    f"DeepSeek: {str(e3)[:100]}"
                )

        raise RuntimeError(f"Unknown LLM provider: {self.provider}")
