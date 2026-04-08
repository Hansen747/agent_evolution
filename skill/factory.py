"""
SubagentFactory — Core engine for creating, running, and refining subagent assets.

Inspired by AgentFactory (https://github.com/zzatpku/AgentFactory), this module
provides the tooling for an AI agent to programmatically generate tradeable
subagent Python modules.

Unlike EvoMap's GEP protocol which produces Gene/Capsule JSON structures,
SubagentFactory produces **executable Python code** with a standardised
`main(query) -> dict` interface.
"""

import importlib.util
import os
import re
import signal
import shutil
import textwrap
from datetime import datetime
from typing import Any, Dict, List, Optional


class SubagentFactory:
    """
    Factory for creating, testing, and refining subagent assets.

    Each subagent is a Python file with:
      - def main(query: str) -> dict  (returns {"answer": ..., "summary": ...})
      - Accompanying SKILL.md documentation

    Workflow:
      1. create_subagent(name, task_description, tools) -> generates code + SKILL.md
      2. run_subagent(entry_file, query) -> executes and returns result
      3. modify_subagent(entry_file, old_content, new_content) -> patch code
      4. list_subagents() -> show what's in the workspace
      5. export(entry_file) -> returns code + skill_md for platform publishing
    """

    def __init__(self, workspace: str = "./workspace"):
        self.workspace = os.path.abspath(workspace)
        os.makedirs(self.workspace, exist_ok=True)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------
    def create_subagent(
        self,
        name: str,
        task_description: str,
        tools: Optional[List[str]] = None,
        code: Optional[str] = None,
        extra_instructions: str = "",
    ) -> Dict[str, Any]:
        """
        Create a new subagent.

        Args:
            name:               Skill name (becomes the filename, e.g. "web_researcher")
            task_description:   What this subagent should do
            tools:              List of tool names the subagent may use
            code:               If provided, use this code directly; otherwise generate a template
            extra_instructions: Additional instructions to embed in the template

        Returns:
            {"success": True, "entry_file": "...", "code": "...", "skill_md": "..."}
        """
        safe_name = re.sub(r"[^\w]", "_", name).lower()
        entry_file = f"{safe_name}.py"
        entry_path = os.path.join(self.workspace, entry_file)

        if code:
            # Use provided code directly
            final_code = code
        else:
            # Generate a template
            tools_list = tools or []
            tools_str = ", ".join(tools_list) if tools_list else "none"
            final_code = self._generate_template(safe_name, task_description, tools_str, extra_instructions)

        # Write code
        with open(entry_path, "w", encoding="utf-8") as f:
            f.write(final_code)

        # Generate SKILL.md
        skill_md = self._generate_skill_md(safe_name, task_description, tools or [])
        skill_md_path = os.path.join(self.workspace, f"{safe_name}_SKILL.md")
        with open(skill_md_path, "w", encoding="utf-8") as f:
            f.write(skill_md)

        return {
            "success": True,
            "entry_file": entry_file,
            "code": final_code,
            "skill_md": skill_md,
            "workspace": self.workspace,
        }

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------
    def run_subagent(
        self,
        entry_file: str,
        query: str,
        timeout: int = 300,
    ) -> Dict[str, Any]:
        """
        Execute a subagent's main(query) function and return the result.

        Args:
            entry_file: Python filename in the workspace
            query:      The question / task to pass
            timeout:    Max seconds to allow

        Returns:
            {"success": True/False, "answer": "...", "summary": "...", "error": "..."}
        """
        path = os.path.join(self.workspace, entry_file)
        if not os.path.exists(path):
            return {"success": False, "error": f"File not found: {entry_file}"}

        original_cwd = os.getcwd()
        try:
            os.chdir(self.workspace)

            module_name = os.path.splitext(entry_file)[0]
            spec = importlib.util.spec_from_file_location(module_name, path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            if not hasattr(module, "main"):
                return {"success": False, "error": f"No main() function in {entry_file}"}

            # Timeout via SIGALRM (Unix)
            def _timeout_handler(signum, frame):
                raise TimeoutError(f"Subagent timed out ({timeout}s)")

            old_handler = signal.signal(signal.SIGALRM, _timeout_handler)
            signal.alarm(timeout)
            try:
                result = module.main(query)
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, old_handler)

            if not isinstance(result, dict):
                return {"success": False, "error": f"main() returned {type(result).__name__}, expected dict"}

            return {
                "success": True,
                "answer": result.get("answer", ""),
                "summary": result.get("summary", ""),
            }

        except TimeoutError as e:
            return {"success": False, "error": str(e)}
        except Exception as e:
            import traceback
            return {"success": False, "error": f"{type(e).__name__}: {e}\n{traceback.format_exc()}"}
        finally:
            os.chdir(original_cwd)

    # ------------------------------------------------------------------
    # Modify
    # ------------------------------------------------------------------
    def modify_subagent(
        self,
        entry_file: str,
        old_content: str,
        new_content: str,
    ) -> Dict[str, Any]:
        """
        Surgically modify a subagent by replacing a code fragment.

        Args:
            entry_file:  Python filename in the workspace
            old_content: Exact text to find
            new_content: Replacement text

        Returns:
            {"success": True/False, ...}
        """
        path = os.path.join(self.workspace, entry_file)
        if not os.path.exists(path):
            return {"success": False, "error": f"File not found: {entry_file}"}

        with open(path, "r", encoding="utf-8") as f:
            code = f.read()

        if old_content not in code:
            return {
                "success": False,
                "error": "old_content not found in the file. Must be an exact match.",
            }

        new_code = code.replace(old_content, new_content, 1)
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_code)

        return {"success": True, "entry_file": entry_file, "message": "Code modified successfully."}

    # ------------------------------------------------------------------
    # List / Export
    # ------------------------------------------------------------------
    def list_subagents(self) -> List[Dict[str, str]]:
        """List all .py subagent files in the workspace."""
        result = []
        for f in sorted(os.listdir(self.workspace)):
            if f.endswith(".py"):
                result.append({
                    "entry_file": f,
                    "name": f[:-3],
                    "size": os.path.getsize(os.path.join(self.workspace, f)),
                })
        return result

    def export(self, entry_file: str) -> Dict[str, Any]:
        """
        Export a subagent's code and SKILL.md for publishing.

        Returns:
            {"success": True, "code": "...", "skill_md": "...", "entry_file": "..."}
        """
        path = os.path.join(self.workspace, entry_file)
        if not os.path.exists(path):
            return {"success": False, "error": f"File not found: {entry_file}"}

        with open(path, "r", encoding="utf-8") as f:
            code = f.read()

        # Try to find the matching SKILL.md
        base_name = os.path.splitext(entry_file)[0]
        skill_md_path = os.path.join(self.workspace, f"{base_name}_SKILL.md")
        skill_md = ""
        if os.path.exists(skill_md_path):
            with open(skill_md_path, "r", encoding="utf-8") as f:
                skill_md = f.read()

        return {
            "success": True,
            "entry_file": entry_file,
            "code": code,
            "skill_md": skill_md,
        }

    def cleanup(self, entry_file: Optional[str] = None):
        """Remove a subagent file (or the entire workspace if entry_file is None)."""
        if entry_file:
            path = os.path.join(self.workspace, entry_file)
            if os.path.exists(path):
                os.remove(path)
        else:
            shutil.rmtree(self.workspace, ignore_errors=True)
            os.makedirs(self.workspace, exist_ok=True)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    def _generate_template(
        self,
        name: str,
        task_description: str,
        tools_str: str,
        extra_instructions: str,
    ) -> str:
        """Generate a subagent Python template."""
        return textwrap.dedent(f'''\
            """
            Subagent: {name}
            Description: {task_description}
            Tools: {tools_str}
            Generated by SubagentFactory
            """

            import json
            import os
            import sys
            from typing import Dict, Any


            # ---- LLM helper ----
            def call_llm(system: str, messages: list, max_tokens: int = 4000) -> str:
                """
                Call an LLM API. Reads configuration from environment variables:
                  LLM_URL, LLM_API_KEY, LLM_MODEL
                Falls back to a simple echo if no API is configured.
                """
                try:
                    import requests
                    url = os.environ.get("LLM_URL", "")
                    api_key = os.environ.get("LLM_API_KEY", "")
                    model = os.environ.get("LLM_MODEL", "gpt-4")

                    if not url or not api_key:
                        return f"[LLM not configured] System: {{system}} | Query: {{messages[-1]['content'] if messages else 'N/A'}}"

                    headers = {{
                        "Authorization": f"Bearer {{api_key}}",
                        "Content-Type": "application/json",
                    }}
                    payload = {{
                        "model": model,
                        "messages": [{{"role": "system", "content": system}}] + messages,
                        "max_tokens": max_tokens,
                    }}
                    resp = requests.post(f"{{url}}/chat/completions", headers=headers, json=payload, timeout=120)
                    resp.raise_for_status()
                    return resp.json()["choices"][0]["message"]["content"]
                except Exception as e:
                    return f"Error calling LLM: {{e}}"


            def main(query: str) -> Dict[str, Any]:
                """
                Main entry point for this subagent.

                Args:
                    query: The task or question in natural language.

                Returns:
                    {{"answer": "<direct answer>", "summary": "<reasoning trace>"}}
                """
                # Task description: {task_description}
                {f"# Extra instructions: {extra_instructions}" if extra_instructions else ""}

                max_iterations = 5
                evidence_collected = []
                answer = ""

                for iteration in range(max_iterations):
                    # Build prompt for this iteration
                    if iteration == 0:
                        prompt = f"Please help with the following task:\\n{{query}}"
                    else:
                        prompt = (
                            f"Task: {{query}}\\n\\n"
                            f"Evidence so far:\\n" + "\\n".join(evidence_collected) + "\\n\\n"
                            f"Continue working on this task. If you have enough information, "
                            f"provide the final answer."
                        )

                    response = call_llm(
                        system=(
                            "You are a specialised subagent for: {task_description}. "
                            "Analyse the task, gather information, and provide a clear answer. "
                            "If you have enough information to answer, start your response with FINAL ANSWER: "
                            "followed by the answer."
                        ),
                        messages=[{{"role": "user", "content": prompt}}],
                    )

                    evidence_collected.append(f"[Iteration {{iteration + 1}}] {{response[:500]}}")

                    if "FINAL ANSWER:" in response:
                        answer = response.split("FINAL ANSWER:")[-1].strip()
                        break

                if not answer:
                    answer = response  # Use last response as answer

                # Generate summary
                summary = call_llm(
                    system="Summarise the research process and findings concisely (100-500 words).",
                    messages=[{{
                        "role": "user",
                        "content": (
                            f"Query: {{query}}\\n"
                            f"Evidence:\\n" + "\\n".join(evidence_collected) + "\\n"
                            f"Final answer: {{answer}}\\n\\n"
                            "Write a summary of the reasoning process."
                        ),
                    }}],
                )

                return {{"answer": answer, "summary": summary}}


            if __name__ == "__main__":
                import sys
                q = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Hello, what can you do?"
                result = main(q)
                print(f"ANSWER: {{result['answer']}}")
                print(f"SUMMARY: {{result['summary']}}")
        ''')

    def _generate_skill_md(
        self,
        name: str,
        description: str,
        tools: List[str],
    ) -> str:
        """Generate a SKILL.md for the subagent."""
        tools_str = ", ".join(tools) if tools else "none"
        return textwrap.dedent(f"""\
            ---
            name: {name}
            description: {description}
            entry_file: {name}.py
            ---

            # {name}

            ## Description
            {description}

            ## Skills Used
            {tools_str}

            ## Usage

            **Entry file**: `{name}.py`

            **Query type**: Pass a natural language task or question as the query.

            **How to call**:
            ```python
            from skill.factory import SubagentFactory

            factory = SubagentFactory()
            result = factory.run_subagent("{name}.py", "your question here")
            print(result)
            ```

            ## Return Format
            ```json
            {{"answer": "<direct answer>", "summary": "<reasoning trace>"}}
            ```
        """)
