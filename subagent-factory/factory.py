"""
SubagentFactory — helpers for evolving reusable EvoPacks.

This module focuses on scaffolding and smoke-testing reusable EvoPacks.
Platform-facing validation and packaging automation now live under the
agentevo-platform skill.
"""

import importlib.util
import os
import re
import signal
import textwrap
import traceback
from typing import Any, Dict, List, Optional


class SubagentFactory:
    """
        Helpers for scaffolding and executing evolving EvoPacks.

        Recommended workflow:
            1. Create an EvoPack directory with SKILL.md and any supporting files.
            2. Add any prompts, configs, tests, or helper modules the EvoPack needs.
            3. Refine the package until another agent could reuse it.
            4. Hand off to the platform skill for upload-readiness checks and packaging.
    """

    def __init__(self, workspace: str = "./.agentevo/assets"):
        self.workspace = os.path.abspath(workspace)
        os.makedirs(self.workspace, exist_ok=True)

    # ------------------------------------------------------------------
    # Create
    # ------------------------------------------------------------------
    def scaffold_asset(
        self,
        name: str,
        task_description: str,
        tools: Optional[List[str]] = None,
        entry_file: Optional[str] = None,
        code: Optional[str] = None,
        extra_instructions: str = "",
        supporting_files: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Scaffold a directory-based EvoPack.

        The resulting directory is ready for direct editing by the agent and can
        later be handed off to the platform skill for upload checks and packaging.
        """
        safe_name = self._safe_name(name)
        asset_dir = os.path.join(self.workspace, safe_name)
        os.makedirs(asset_dir, exist_ok=True)

        asset_entry_file = entry_file or ("main.py" if code else None)
        if asset_entry_file:
            entry_path = os.path.join(asset_dir, asset_entry_file)
            os.makedirs(os.path.dirname(entry_path), exist_ok=True)

            if code:
                final_code = code
            else:
                tools_list = tools or []
                tools_str = ", ".join(tools_list) if tools_list else "none"
                final_code = self._generate_template(safe_name, task_description, tools_str, extra_instructions)

            with open(entry_path, "w", encoding="utf-8") as f:
                f.write(final_code)

        skill_md = self._generate_skill_md(safe_name, task_description, tools or [], asset_entry_file)
        with open(os.path.join(asset_dir, "SKILL.md"), "w", encoding="utf-8") as f:
            f.write(skill_md)

        if supporting_files:
            for relative_path, content in supporting_files.items():
                target_path = os.path.join(asset_dir, relative_path)
                os.makedirs(os.path.dirname(target_path), exist_ok=True)
                with open(target_path, "w", encoding="utf-8") as f:
                    f.write(content)

        return {
            "success": True,
            "asset_dir": asset_dir,
            "entry_file": asset_entry_file,
            "skill_md": skill_md,
            "file_list": self._list_asset_files(asset_dir),
        }

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------
    def run_subagent(
        self,
        entry_file: str,
        query: str,
        timeout: int = 300,
        asset_dir: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute an EvoPack entry's main(query) function and return the result.

        Args:
            entry_file: Python filename relative to the workspace or asset directory
            query: The question / task to pass
            timeout: Max seconds to allow
            asset_dir: Optional asset directory relative to the workspace

        Returns:
            {"success": True/False, "answer": "...", "summary": "...", "error": "..."}
        """
        base_dir = self.workspace if asset_dir is None else self._resolve_asset_dir(asset_dir)
        path = os.path.join(base_dir, entry_file)
        if not os.path.exists(path):
            return {"success": False, "error": f"File not found: {entry_file}"}

        original_cwd = os.getcwd()
        try:
            os.chdir(base_dir)

            module_name = os.path.splitext(entry_file)[0]
            spec = importlib.util.spec_from_file_location(module_name, path)
            if spec is None or spec.loader is None:
                return {"success": False, "error": f"Could not load module spec for {entry_file}"}
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
            return {"success": False, "error": f"{type(e).__name__}: {e}\n{traceback.format_exc()}"}
        finally:
            os.chdir(original_cwd)

    # ------------------------------------------------------------------
    # List
    # ------------------------------------------------------------------
    def list_assets(self) -> List[Dict[str, Any]]:
        """List directory-based EvoPacks in the workspace."""
        result = []
        for name in sorted(os.listdir(self.workspace)):
            asset_dir = os.path.join(self.workspace, name)
            if not os.path.isdir(asset_dir):
                continue

            file_list = self._list_asset_files(asset_dir)
            if "SKILL.md" not in file_list:
                continue

            entry_candidates = [file_name for file_name in file_list if file_name.endswith(".py")]
            result.append({
                "asset_dir": name,
                "entry_candidates": entry_candidates,
                "file_count": len(file_list),
            })
        return result

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
        entry_file: Optional[str],
    ) -> str:
        """Generate a SKILL.md for an EvoPack."""
        tools_str = ", ".join(tools) if tools else "none"
        frontmatter = [
            "---",
            f"name: {name}",
            f"description: {description}",
        ]
        if entry_file:
            frontmatter.append(f"entry_file: {entry_file}")
        frontmatter.append("---")

        included_files = ["- `SKILL.md`: public capability description for marketplace preview"]
        usage_section = ""
        return_format_section = ""
        if entry_file:
            included_files.insert(0, f"- `{entry_file}`: executable entry point")
            usage_section = textwrap.dedent(f"""
                ## Usage

                **Entry file**: `{entry_file}`

                **Query type**: Pass a natural language task or question as the query.

                **How to run locally**:
                ```bash
                python {entry_file} \"your question here\"
                ```
            """)
            return_format_section = textwrap.dedent("""
                ## Return Format
                ```json
                {"answer": "<direct answer>", "summary": "<reasoning trace>"}
                ```
            """)

        return textwrap.dedent(f"""\
            {'\n'.join(frontmatter)}

            # {name}

            ## Capability
            {description}

            ## Included Files
            {'\n'.join(included_files)}

            ## Tools Used
            {tools_str}

            {usage_section.rstrip()}

            {return_format_section.rstrip()}

            ## Reuse Notes
            - Keep `SKILL.md` at the package root.
            - Add prompts, configs, tests, or helper modules when they are part of the reusable capability.
            - Document external APIs, dependencies, and limitations clearly.
        """)

    def _safe_name(self, name: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        return normalized or "asset"

    def _resolve_asset_dir(self, asset_dir: str) -> str:
        if os.path.isabs(asset_dir):
            return asset_dir
        return os.path.join(self.workspace, asset_dir)

    def _list_asset_files(self, asset_dir: str) -> List[str]:
        file_list: List[str] = []
        for root, dirs, files in os.walk(asset_dir):
            dirs[:] = [directory for directory in dirs if directory not in {"__pycache__", ".git"}]
            for filename in sorted(files):
                if filename.endswith((".pyc", ".pyo", ".zip")):
                    continue
                if filename in {".DS_Store"}:
                    continue
                absolute_path = os.path.join(root, filename)
                relative_path = os.path.relpath(absolute_path, asset_dir).replace(os.sep, "/")
                file_list.append(relative_path)
        return sorted(file_list)

