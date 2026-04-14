"""
SubagentFactory — helpers for packaging reusable subagent assets.

The core platform requires SKILL.md for public preview. Assets may also include
an optional executable entry file, plus any prompts, helper modules, configs,
tests, or other resources needed by the capability.
"""

import ast
import importlib.util
import os
import re
import signal
import shutil
import textwrap
import traceback
import zipfile
from typing import Any, Dict, List, Optional


class SubagentFactory:
    """
        Helpers for scaffolding, validating, executing, and packaging subagent assets.

        Recommended workflow:
            1. Create an asset package directory with SKILL.md and any supporting files.
            2. Add any prompts, configs, tests, or helper modules the asset needs.
            3. validate_asset(...) before publishing.
            4. export_asset(...) to package the full directory as a zip archive.

        Backward-compatible single-file helpers are still available for quick
        bootstrapping, but they are no longer the preferred workflow.
    """

    def __init__(self, workspace: str = "./.agentevo/assets"):
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
        Create a legacy single-file subagent in the workspace root.

        Args:
            name: Skill name (becomes the filename, e.g. "web_researcher")
            task_description: What this subagent should do
            tools: List of tool names the subagent may use
            code: If provided, use this code directly; otherwise generate a template
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

        # Generate a legacy companion SKILL.md file in the workspace root.
        skill_md = self._generate_skill_md(safe_name, task_description, tools or [], entry_file)
        skill_md_path = os.path.join(self.workspace, f"{safe_name}_SKILL.md")
        with open(skill_md_path, "w", encoding="utf-8") as f:
            f.write(skill_md)

        return {
            "success": True,
            "entry_file": entry_file,
            "code": final_code,
            "skill_md": skill_md,
            "skill_md_path": skill_md_path,
            "workspace": self.workspace,
        }

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
        Scaffold a directory-based asset package.

        The resulting directory is ready for direct editing by the agent and can
        later be validated and zipped for upload.
        """
        safe_name = self._safe_name(name)
        asset_dir = os.path.join(self.workspace, safe_name)
        os.makedirs(asset_dir, exist_ok=True)

        asset_entry_file = entry_file or f"{safe_name}.py"
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
        Execute a subagent's main(query) function and return the result.

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
    # Modify
    # ------------------------------------------------------------------
    def modify_subagent(
        self,
        entry_file: str,
        old_content: str,
        new_content: str,
    ) -> Dict[str, Any]:
        """
        Legacy helper that replaces a code fragment in a single file.

        Args:
            entry_file: Python filename in the workspace
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
        """List legacy single-file .py subagents in the workspace root."""
        result = []
        for f in sorted(os.listdir(self.workspace)):
            if f.endswith(".py"):
                result.append({
                    "entry_file": f,
                    "name": f[:-3],
                    "size": os.path.getsize(os.path.join(self.workspace, f)),
                })
        return result

    def list_assets(self) -> List[Dict[str, Any]]:
        """List directory-based asset packages in the workspace."""
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

    def validate_asset(self, asset_dir: str, entry_file: Optional[str] = None) -> Dict[str, Any]:
        """
        Validate that a directory-based asset package is ready for publishing.
        """
        asset_root = self._resolve_asset_dir(asset_dir)
        errors: List[str] = []
        warnings: List[str] = []

        if not os.path.isdir(asset_root):
            return {
                "success": False,
                "asset_dir": asset_root,
                "entry_file": entry_file,
                "errors": [f"Asset directory not found: {asset_dir}"],
                "warnings": [],
                "file_list": [],
            }

        file_list = self._list_asset_files(asset_root)
        normalized_entry = entry_file.replace("\\", "/") if entry_file else None

        if not file_list:
            errors.append("Asset directory is empty.")

        if "SKILL.md" not in file_list:
            errors.append("Asset package must contain SKILL.md at the package root.")

        if normalized_entry:
            if normalized_entry not in file_list:
                errors.append(f"Entry file '{entry_file}' was not found in the asset package.")
            else:
                entry_path = os.path.join(asset_root, *normalized_entry.split("/"))
                if not normalized_entry.endswith(".py"):
                    errors.append("Entry file must be a Python file.")
                else:
                    signature_check = self._validate_entry_signature(entry_path)
                    errors.extend(signature_check["errors"])
                    warnings.extend(signature_check["warnings"])
        else:
            warnings.append("No entry file declared. This asset will be treated as a reusable package rather than a directly executable subagent.")

        if not any(file_name not in {normalized_entry, "SKILL.md"} for file_name in file_list):
            warnings.append(
                "Asset package only contains SKILL.md and little or no supporting material. Consider bundling prompts, tests, examples, configs, or helper files if they are part of the capability."
            )

        return {
            "success": not errors,
            "asset_dir": asset_root,
            "entry_file": normalized_entry,
            "errors": errors,
            "warnings": warnings,
            "file_list": file_list,
        }

    def export_asset(
        self,
        asset_dir: str,
        entry_file: Optional[str] = None,
        output_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Package a full asset directory into a zip archive ready for upload.
        """
        validation = self.validate_asset(asset_dir=asset_dir, entry_file=entry_file)
        if not validation["success"]:
            return validation

        asset_root = validation["asset_dir"]
        zip_name = output_name or os.path.basename(os.path.normpath(asset_root))
        if not zip_name.endswith(".zip"):
            zip_name = f"{zip_name}.zip"

        zip_path = os.path.join(self.workspace, zip_name)
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for relative_path in validation["file_list"]:
                zf.write(os.path.join(asset_root, *relative_path.split("/")), relative_path)

        return {
            "success": True,
            "zip_path": zip_path,
            "asset_dir": asset_root,
            "entry_file": validation["entry_file"],
            "file_list": validation["file_list"],
            "warnings": validation["warnings"],
        }

    def export(
        self,
        entry_file: str,
        asset_dir: Optional[str] = None,
        asset_files: Optional[List[str]] = None,
        output_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Backward-compatible export helper.

        Preferred usage is export_asset(asset_dir=..., entry_file=...). For flat
        workspaces, pass asset_files to include helper modules, prompts, configs,
        or tests alongside the entry file.

        Returns:
            {"success": True, "zip_path": "...", "entry_file": "...", "file_list": [...]}
        """
        if asset_dir is not None:
            return self.export_asset(asset_dir=asset_dir, entry_file=entry_file, output_name=output_name)

        selected_files = list(asset_files or [])
        normalized_entry = entry_file.replace("\\", "/")
        if normalized_entry not in selected_files:
            selected_files.insert(0, normalized_entry)

        base_name = os.path.splitext(os.path.basename(normalized_entry))[0]
        legacy_skill_file = f"{base_name}_SKILL.md"
        if not any(file_name == "SKILL.md" or file_name.endswith("/SKILL.md") for file_name in selected_files):
            legacy_path = os.path.join(self.workspace, legacy_skill_file)
            if os.path.exists(legacy_path):
                selected_files.append(legacy_skill_file)

        return self._build_selected_archive(
            entry_file=normalized_entry,
            file_list=selected_files,
            output_name=output_name or base_name,
            legacy_skill_file=legacy_skill_file,
        )

    def cleanup(self, entry_file: Optional[str] = None):
        """Remove a file or directory from the workspace, or clear the workspace."""
        if entry_file:
            path = os.path.join(self.workspace, entry_file)
            if os.path.exists(path):
                if os.path.isdir(path):
                    shutil.rmtree(path, ignore_errors=True)
                else:
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
        entry_file: str,
    ) -> str:
        """Generate a SKILL.md for an asset package."""
        tools_str = ", ".join(tools) if tools else "none"
        return textwrap.dedent(f"""\
            ---
            name: {name}
            description: {description}
            entry_file: {entry_file}
            ---

            # {name}

            ## Capability
            {description}

            ## Included Files
            - `{entry_file}`: executable entry point
            - `SKILL.md`: public capability description for marketplace preview

            ## Tools Used
            {tools_str}

            ## Usage

            **Entry file**: `{entry_file}`

            **Query type**: Pass a natural language task or question as the query.

            **How to run locally**:
            ```bash
            python {entry_file} "your question here"
            ```

            ## Return Format
            ```json
            {{"answer": "<direct answer>", "summary": "<reasoning trace>"}}
            ```

            ## Packaging Notes
            - Keep `SKILL.md` at the package root.
            - Add prompts, configs, tests, or helper modules when they are part of the reusable capability.
            - Document external APIs, dependencies, and limitations clearly before publishing.
        """)

    def _safe_name(self, name: str) -> str:
        return re.sub(r"[^\w]", "_", name).lower()

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

    def _validate_entry_signature(self, entry_path: str) -> Dict[str, List[str]]:
        errors: List[str] = []
        warnings: List[str] = []

        try:
            with open(entry_path, "r", encoding="utf-8") as f:
                tree = ast.parse(f.read(), filename=entry_path)
        except SyntaxError as exc:
            return {
                "errors": [f"Entry file contains invalid Python syntax: {exc.msg} (line {exc.lineno})"],
                "warnings": [],
            }

        main_function = None
        for node in tree.body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == "main":
                main_function = node
                break

        if main_function is None:
            errors.append("Entry file must define main(query).")
            return {"errors": errors, "warnings": warnings}

        positional_count = len(main_function.args.posonlyargs) + len(main_function.args.args)
        if positional_count < 1:
            errors.append("main() must accept at least one positional argument for the query.")
        elif positional_count > 1:
            warnings.append("main() accepts multiple positional arguments. The marketplace contract expects a single natural-language query input.")

        if main_function.args.args:
            first_arg_name = main_function.args.args[0].arg
            if first_arg_name != "query":
                warnings.append(f"The first main() parameter is '{first_arg_name}'. Using 'query' keeps assets consistent.")

        if main_function.returns is None:
            warnings.append("main() has no return annotation. Returning Dict[str, Any] keeps assets easier to understand.")

        return {"errors": errors, "warnings": warnings}

    def _build_selected_archive(
        self,
        entry_file: str,
        file_list: List[str],
        output_name: str,
        legacy_skill_file: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized_files: List[str] = []
        for relative_path in file_list:
            normalized = relative_path.replace("\\", "/")
            absolute_path = os.path.join(self.workspace, *normalized.split("/"))
            if not os.path.exists(absolute_path):
                return {"success": False, "error": f"File not found: {relative_path}"}
            if normalized not in normalized_files:
                normalized_files.append(normalized)

        if entry_file not in normalized_files:
            normalized_files.insert(0, entry_file)

        zip_name = output_name if output_name.endswith(".zip") else f"{output_name}.zip"
        zip_path = os.path.join(self.workspace, zip_name)
        archived_files: List[str] = []
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for relative_path in normalized_files:
                archive_name = relative_path
                if legacy_skill_file and relative_path == legacy_skill_file:
                    archive_name = "SKILL.md"
                zf.write(os.path.join(self.workspace, *relative_path.split("/")), archive_name)
                archived_files.append(archive_name)

        return {
            "success": True,
            "zip_path": zip_path,
            "entry_file": entry_file,
            "file_list": archived_files,
        }
