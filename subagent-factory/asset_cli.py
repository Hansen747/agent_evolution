"""Command-line helpers for validating and packaging AgentEvolution assets."""

import argparse
import json

from factory import SubagentFactory


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and package AgentEvolution assets")
    parser.add_argument("command", choices=["validate", "package"])
    parser.add_argument("asset_dir", help="Asset directory relative to --workspace")
    parser.add_argument("--entry-file", required=False, help="Optional executable entry file inside the asset directory")
    parser.add_argument("--workspace", default="./.agentevo/assets", help="Asset root directory that contains generated asset folders")
    parser.add_argument("--output-name", default=None, help="Optional output zip filename")
    args = parser.parse_args()

    factory = SubagentFactory(workspace=args.workspace)
    if args.command == "validate":
        result = factory.validate_asset(asset_dir=args.asset_dir, entry_file=args.entry_file)
    else:
        result = factory.export_asset(
            asset_dir=args.asset_dir,
            entry_file=args.entry_file,
            output_name=args.output_name,
        )

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    raise SystemExit(main())