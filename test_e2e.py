"""
End-to-end test for the AgentEvolution platform.

Tests the full workflow:
  1. Register two users
  2. Register an agent
  3. Create & publish a subagent asset (zip upload)
  4. Search & browse assets
  5. Post a bounty
  6. Submit a solution
  7. Accept the solution
  8. Purchase a paid asset
  9. Check trade history
  10. Record operation logs
"""

import io
import importlib.util
import json
import time
import subprocess
import sys
import os
import signal
import zipfile
import requests

BASE_URL = "http://localhost:8765"
API = f"{BASE_URL}/api/v1"


def wait_for_server(url, timeout=10):
    """Wait for the server to be ready."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(f"{url}/health", timeout=2)
            if r.status_code == 200:
                return True
        except requests.ConnectionError:
            time.sleep(0.3)
    return False


def make_zip(files: dict[str, str]) -> bytes:
    """Create an in-memory zip archive from a dict of {filename: content}."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


SUBAGENT_CODE = '''\
"""Web researcher subagent."""
import os

def call_llm(system, messages, max_tokens=4000):
    return "FINAL ANSWER: This is a test answer"

def main(query):
    """Main entry point."""
    try:
        response = call_llm("You are a researcher.", [{"role": "user", "content": query}])
        answer = response.split("FINAL ANSWER:")[-1].strip() if "FINAL ANSWER:" in response else response
        summary = call_llm("Summarise.", [{"role": "user", "content": f"Query: {query}, Answer: {answer}"}])
        return {"answer": answer, "summary": summary}
    except Exception as e:
        return {"answer": f"Error: {e}", "summary": str(e)}
'''

SKILL_MD = "# web_researcher\\nResearch subagent that searches and synthesises web information."


def test_full_workflow():
    print("=" * 60)
    print("AgentEvolution Platform — End-to-End Test")
    print("=" * 60)

    # ---- 1. Register users ----
    print("\n[1] Register users...")
    r = requests.post(f"{API}/auth/register", json={
        "username": "alice", "email": "alice@test.com", "password": "alice123",
        "display_name": "Alice"
    })
    assert r.status_code == 201, f"Register alice failed: {r.text}"
    alice_token = r.json()["access_token"]
    alice_id = r.json()["user_id"]
    print(f"    Alice registered: {alice_id}")

    r = requests.post(f"{API}/auth/register", json={
        "username": "bob", "email": "bob@test.com", "password": "bob12345",
        "display_name": "Bob"
    })
    assert r.status_code == 201, f"Register bob failed: {r.text}"
    bob_token = r.json()["access_token"]
    bob_id = r.json()["user_id"]
    print(f"    Bob registered: {bob_id}")

    alice_h = {"Authorization": f"Bearer {alice_token}"}
    bob_h = {"Authorization": f"Bearer {bob_token}"}

    # ---- 2. Login test ----
    print("\n[2] Login test...")
    r = requests.post(f"{API}/auth/login", json={"username": "alice", "password": "alice123"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    print("    Login OK")

    # ---- 3. Get profile ----
    print("\n[3] Get profile...")
    r = requests.get(f"{API}/auth/me", headers=alice_h)
    assert r.status_code == 200
    profile = r.json()
    print(f"    Profile: {profile['username']}, credits={profile['credits']}")
    assert profile["credits"] == 100.0

    # ---- 4. Register agent ----
    print("\n[4] Register agent...")
    r = requests.post(f"{API}/agents/", json={
        "name": "AliceBot",
        "description": "Alice's research agent",
        "agent_type": "openclaw",
        "capabilities": ["research", "code_generation"]
    }, headers=alice_h)
    assert r.status_code == 201, f"Register agent failed: {r.text}"
    agent = r.json()
    agent_id = agent["id"]
    print(f"    Agent registered: {agent['name']} (id={agent_id}, api_key={agent['api_key'][:16]}...)")

    # ---- 5. Publish subagent asset (zip upload) ----
    print("\n[5] Publish subagent asset (zip upload)...")
    free_zip = make_zip({
        "web_researcher.py": SUBAGENT_CODE,
        "SKILL.md": SKILL_MD,
    })
    r = requests.post(
        f"{API}/assets/",
        params={"agent_id": agent_id},
        files={"file": ("web_researcher.zip", free_zip, "application/zip")},
        data={
            "name": "web_researcher",
            "description": "A general-purpose web research subagent that searches and synthesises information",
            "tags": json.dumps(["research", "web", "search"]),
            "entry_file": "web_researcher.py",
            "dependencies": json.dumps(["requests"]),
            "tools_used": json.dumps(["web_search", "web_reading"]),
            "price": "0.0",
        },
        headers=alice_h,
    )
    assert r.status_code == 201, f"Publish asset failed: {r.text}"
    asset = r.json()
    free_asset_id = asset["id"]
    print(f"    Asset published: {asset['name']} (id={free_asset_id}, quality={asset['quality_score']:.2f}, composite={asset['composite_score']:.2f})")
    assert "web_researcher.py" in asset["file_list"]
    assert "SKILL.md" in asset["file_list"]
    assert len(asset["skill_md"]) > 0, "SKILL.md should be extracted as public preview"

    # Publish a PAID non-executable asset
    paid_zip = make_zip({
        "SKILL.md": "# premium_prompt_pack\nPremium prompt pack with reusable analysis workflows",
        "prompts/system.txt": "You are a premium analysis assistant.",
        "examples/sample_output.md": "Example structured analysis output",
    })
    r = requests.post(
        f"{API}/assets/",
        files={"file": ("analyser.zip", paid_zip, "application/zip")},
        data={
            "name": "premium_prompt_pack",
            "description": "Advanced reusable prompt pack for analysis workflows",
            "tags": json.dumps(["analysis", "ml", "premium"]),
            "price": "10.0",
        },
        headers=alice_h,
    )
    assert r.status_code == 201, f"Publish paid asset failed: {r.text}"
    paid_asset = r.json()
    paid_asset_id = paid_asset["id"]
    assert paid_asset["entry_file"] is None
    assert "SKILL.md" in paid_asset["file_list"]
    print(f"    Paid asset published: premium_prompt_pack (id={paid_asset_id}, price=10.0)")

    # ---- 6. Search assets ----
    print("\n[6] Search assets...")
    r = requests.get(f"{API}/assets/", params={"search": "research"})
    assert r.status_code == 200
    results = r.json()
    print(f"    Search 'research': {results['total']} results")
    assert results["total"] >= 1

    r = requests.get(f"{API}/assets/", params={"tag": "ml"})
    assert r.status_code == 200
    print(f"    Search tag 'ml': {r.json()['total']} results")

    # ---- 7. Get asset details ----
    print("\n[7] Get asset details...")
    r = requests.get(f"{API}/assets/{free_asset_id}")
    assert r.status_code == 200
    detail = r.json()
    print(f"    Asset detail: {detail['name']}, file_list={detail['file_list']}, skill_md_len={len(detail['skill_md'])}")

    # ---- 8. Download free asset (Bob) ----
    print("\n[8] Download free asset...")
    r = requests.post(f"{API}/assets/{free_asset_id}/download", headers=bob_h)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("application/zip") or "zip" in r.headers.get("content-type", "")
    # Verify it's a valid zip with the expected files
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert "web_researcher.py" in zf.namelist()
    print(f"    Bob downloaded zip: {len(r.content)} bytes, files={zf.namelist()}")

    # ---- 9. Rate asset ----
    print("\n[9] Rate asset...")
    r = requests.post(f"{API}/assets/{free_asset_id}/rate", json={"rating": 4.5}, headers=bob_h)
    assert r.status_code == 200
    print(f"    Rating result: {r.json()['message']}")

    # ---- 10. Post bounty ----
    print("\n[10] Post bounty...")
    r = requests.post(f"{API}/bounties/", json={
        "title": "Need a web scraper for news sites",
        "description": "Looking for a subagent that can scrape and summarise news from major news sites. Must handle paywalls gracefully.",
        "tags": ["scraping", "web", "news"],
        "reward": 20.0,
    }, headers=alice_h)
    assert r.status_code == 201, f"Create bounty failed: {r.text}"
    bounty = r.json()
    bounty_id = bounty["id"]
    print(f"    Bounty posted: '{bounty['title']}' (id={bounty_id}, reward={bounty['reward']})")

    # Check Alice's credits decreased
    r = requests.get(f"{API}/auth/me", headers=alice_h)
    print(f"    Alice credits after bounty: {r.json()['credits']}")

    # ---- 11. Submit solution (Bob) ----
    print("\n[11] Submit solution...")
    r = requests.post(f"{API}/bounties/{bounty_id}/solutions", json={
        "content": "I built a news scraper subagent that handles 5 major news sites including paywall detection via headless browser.",
        "asset_id": None,
    }, headers=bob_h)
    assert r.status_code == 201, f"Submit solution failed: {r.text}"
    solution = r.json()
    solution_id = solution["id"]
    print(f"    Solution submitted by Bob: {solution_id}")

    # ---- 12. List solutions ----
    print("\n[12] List solutions...")
    r = requests.get(f"{API}/bounties/{bounty_id}/solutions")
    assert r.status_code == 200
    solutions = r.json()
    print(f"    Solutions for bounty: {len(solutions)}")

    # ---- 13. Accept solution ----
    print("\n[13] Accept solution...")
    r = requests.post(f"{API}/bounties/{bounty_id}/solutions/{solution_id}/accept", headers=alice_h)
    assert r.status_code == 200, f"Accept failed: {r.text}"
    print(f"    Solution accepted: {r.json()['message']}")

    # Check Bob's credits increased (reward)
    r = requests.get(f"{API}/auth/me", headers=bob_h)
    bob_credits = r.json()["credits"]
    print(f"    Bob credits after reward: {bob_credits}")
    assert bob_credits == 120.0  # 100 initial + 20 reward

    # ---- 14. Purchase paid asset (Bob buys Alice's) ----
    print("\n[14] Purchase paid asset...")
    r = requests.post(f"{API}/trades/purchase", json={
        "asset_id": paid_asset_id,
    }, headers=bob_h)
    assert r.status_code == 201, f"Purchase failed: {r.text}"
    trade = r.json()
    print(f"    Trade completed: id={trade['id']}, price={trade['price']}, fee={trade['platform_fee']}")

    # Check credits
    r = requests.get(f"{API}/auth/me", headers=bob_h)
    print(f"    Bob credits after purchase: {r.json()['credits']}")
    r = requests.get(f"{API}/auth/me", headers=alice_h)
    print(f"    Alice credits after sale: {r.json()['credits']}")

    # ---- 14b. Download purchased paid asset (Bob) ----
    print("\n[14b] Download purchased paid asset...")
    r = requests.post(f"{API}/assets/{paid_asset_id}/download", headers=bob_h)
    assert r.status_code == 200, f"Download paid asset failed: {r.status_code}"
    print(f"    Bob downloaded paid asset zip: {len(r.content)} bytes")

    # ---- 14c. View file from asset (Bob — purchased) ----
    print("\n[14c] View file from asset...")
    r = requests.get(f"{API}/assets/{paid_asset_id}/files/analyser.py", headers=bob_h)
    assert r.status_code == 200, f"View file failed: {r.status_code}"
    print(f"    File content length: {len(r.text)} chars")
    assert "def main(" in r.text

    # ---- 15. Trade history ----
    print("\n[15] Trade history...")
    r = requests.get(f"{API}/trades/history", headers=bob_h)
    assert r.status_code == 200
    history = r.json()
    print(f"    Bob's trades: {history['total']}")

    # ---- 16. Record operation log ----
    print("\n[16] Record operation log...")
    r = requests.post(f"{API}/agents/logs", json={
        "agent_id": agent_id,
        "action": "create_subagent",
        "target_type": "subagent_asset",
        "target_id": free_asset_id,
        "details": {"method": "factory", "template": "web_researcher"},
        "status": "success",
    }, headers=alice_h)
    assert r.status_code == 201, f"Log failed: {r.text}"
    print(f"    Operation logged: {r.json()['action']}")

    # ---- 17. List operation logs ----
    print("\n[17] List operation logs...")
    r = requests.get(f"{API}/agents/logs/{agent_id}", headers=alice_h)
    assert r.status_code == 200
    logs = r.json()
    print(f"    Logs for agent: {logs['total']}")

    # ---- 18. My assets ----
    print("\n[18] My published assets...")
    r = requests.get(f"{API}/assets/me/published", headers=alice_h)
    assert r.status_code == 200
    my_assets = r.json()
    print(f"    Alice's assets: {len(my_assets)}")

    # ---- 19. Agent heartbeat ----
    print("\n[19] Agent heartbeat...")
    r = requests.post(f"{API}/agents/{agent_id}/heartbeat", json={"status": "active"}, headers=alice_h)
    assert r.status_code == 200
    print(f"    Heartbeat: {r.json()['message']}")

    # ---- 20. Test SubagentFactory locally ----
    print("\n[20] Test SubagentFactory locally...")
    factory_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "subagent-factory", "factory.py")
    spec = importlib.util.spec_from_file_location("subagent_factory_skill", factory_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    SubagentFactory = module.SubagentFactory

    bundle_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agentevo-platform", "asset_bundle.py")
    bundle_spec = importlib.util.spec_from_file_location("agentevo_platform_skill", bundle_path)
    assert bundle_spec is not None and bundle_spec.loader is not None
    bundle_module = importlib.util.module_from_spec(bundle_spec)
    bundle_spec.loader.exec_module(bundle_module)
    PlatformAssetHelper = bundle_module.PlatformAssetHelper

    factory = SubagentFactory(workspace="/tmp/agent_evo_test_workspace")
    platform_helper = PlatformAssetHelper(workspace="/tmp/agent_evo_test_workspace")

    result = factory.scaffold_asset(
        name="test-researcher",
        task_description="Search and compile information on any topic",
        tools=["web_search"],
        entry_file="runner.py",
        supporting_files={
            "prompts/system.txt": "You are a careful research assistant.",
        },
    )
    assert result["success"]
    print(f"    Asset scaffolded: {result['asset_dir']}")

    assets = factory.list_assets()
    print(f"    Workspace assets: {len(assets)}")

    validation = platform_helper.validate_asset("test-researcher", entry_file="runner.py")
    assert validation["success"], validation
    assert "prompts/system.txt" in validation["file_list"]

    run_result = factory.run_subagent(
        entry_file="runner.py",
        query="Latest AI news",
        asset_dir="test-researcher",
    )
    assert run_result["success"], run_result

    export = platform_helper.export_asset("test-researcher", entry_file="runner.py")
    assert export["success"]
    assert export["zip_path"].endswith(".zip")
    # Verify the zip is valid
    with zipfile.ZipFile(export["zip_path"], "r") as zf:
        assert "runner.py" in zf.namelist()
        assert "SKILL.md" in zf.namelist()
        assert "prompts/system.txt" in zf.namelist()
    print(f"    Exported zip: {export['zip_path']}, files={export['file_list']}")

    import shutil
    shutil.rmtree("/tmp/agent_evo_test_workspace", ignore_errors=True)

    print("\n" + "=" * 60)
    print("ALL TESTS PASSED")
    print("=" * 60)


if __name__ == "__main__":
    # Start the server
    print("Starting AgentEvolution server...")
    # Clean up any old database
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_evolution.db")
    if os.path.exists(db_path):
        os.remove(db_path)

    # Clean up any old storage
    storage_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "storage")
    import shutil
    if os.path.exists(storage_path):
        shutil.rmtree(storage_path)

    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "agentevo.main:app", "--port", "8765", "--log-level", "warning"],
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )

    try:
        if not wait_for_server(BASE_URL):
            print("ERROR: Server failed to start!")
            server.terminate()
            sys.exit(1)

        print("Server ready.\n")
        test_full_workflow()
    finally:
        server.terminate()
        server.wait()
        # Cleanup test db and storage
        if os.path.exists(db_path):
            os.remove(db_path)
        if os.path.exists(storage_path):
            shutil.rmtree(storage_path, ignore_errors=True)
