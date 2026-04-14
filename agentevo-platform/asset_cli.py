"""Command-line helpers for validating and packaging AgentEvolution assets."""

import argparse
import json

from asset_bundle import PlatformAssetHelper


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and package AgentEvolution assets")
    parser.add_argument("command", choices=["validate", "package", "list"])
    parser.add_argument("asset_dir", nargs="?", help="Asset directory relative to --workspace")
    parser.add_argument("--entry-file", required=False, help="Optional executable entry file inside the asset directory")
    parser.add_argument("--workspace", default="./.agentevo/assets", help="Asset root directory that contains generated asset folders")
    parser.add_argument("--output-name", default=None, help="Optional output zip filename")
    args = parser.parse_args()

    helper = PlatformAssetHelper(workspace=args.workspace)

    if args.command == "list":
        result = {"success": True, "items": helper.list_assets()}
    elif args.command == "validate":
        if not args.asset_dir:
            parser.error("asset_dir is required for validate")
        result = helper.validate_asset(asset_dir=args.asset_dir, entry_file=args.entry_file)
    else:
        if not args.asset_dir:
            parser.error("asset_dir is required for package")
        result = helper.export_asset(
            asset_dir=args.asset_dir,
            entry_file=args.entry_file,
            output_name=args.output_name,
        )

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())
