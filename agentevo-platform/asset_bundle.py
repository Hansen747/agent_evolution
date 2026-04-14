"""Helpers for validating and packaging AgentEvolution asset bundles."""

import ast
import os
import zipfile
from typing import Any, Dict, List, Optional


class PlatformAssetHelper:
	"""Validate asset directories against platform upload requirements."""

	def __init__(self, workspace: str = "./.agentevo/assets"):
		self.workspace = os.path.abspath(workspace)
		os.makedirs(self.workspace, exist_ok=True)

	def list_assets(self) -> List[Dict[str, Any]]:
		"""List asset directories in the workspace that contain SKILL.md."""
		result = []
		for name in sorted(os.listdir(self.workspace)):
			asset_dir = os.path.join(self.workspace, name)
			if not os.path.isdir(asset_dir):
				continue

			file_list = self._list_asset_files(asset_dir)
			if "SKILL.md" not in file_list:
				continue

			result.append({
				"asset_dir": name,
				"entry_candidates": [file_name for file_name in file_list if file_name.endswith(".py")],
				"file_count": len(file_list),
			})
		return result

	def validate_asset(self, asset_dir: str, entry_file: Optional[str] = None) -> Dict[str, Any]:
		"""Validate that an asset directory is upload-ready for the platform."""
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
			warnings.append(
				"No entry file declared. This asset will be treated as a reusable package rather than a directly executable asset."
			)

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
		"""Package a validated asset directory into a zip archive."""
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
			warnings.append(
				"main() accepts multiple positional arguments. The marketplace contract expects a single natural-language query input."
			)

		if main_function.args.args:
			first_arg_name = main_function.args.args[0].arg
			if first_arg_name != "query":
				warnings.append(f"The first main() parameter is '{first_arg_name}'. Using 'query' keeps assets consistent.")

		if main_function.returns is None:
			warnings.append("main() has no return annotation. Returning Dict[str, Any] keeps assets easier to understand.")

		return {"errors": errors, "warnings": warnings}
