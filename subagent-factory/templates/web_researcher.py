"""
Subagent template: Web Researcher

A general-purpose web research subagent that searches the web,
reads pages, and synthesises information into structured answers.
"""

import json
import os
from typing import Dict, Any


def call_llm(system: str, messages: list, max_tokens: int = 4000) -> str:
    """Call an LLM API. Reads config from environment variables."""
    try:
        import requests
        url = os.environ.get("LLM_URL", "")
        llm_api_key = os.environ.get("LLM_API_KEY", "")
        model = os.environ.get("LLM_MODEL", "gpt-4")

        if not url or not llm_api_key:
            return f"[LLM not configured] System: {system}"

        headers = {
            "Authorization": f"Bearer {llm_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system}] + messages,
            "max_tokens": max_tokens,
        }
        resp = requests.post(f"{url}/chat/completions", headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"Error calling LLM: {e}"


def main(query: str) -> Dict[str, Any]:
    """
    Research a topic by planning search queries, reading sources, and
    synthesising findings.

    Args:
        query: Research question or topic in natural language.

    Returns:
        {"answer": "<synthesised answer>", "summary": "<research process trace>"}
    """
    max_iterations = 5
    evidence = []
    answer = ""

    for i in range(max_iterations):
        if i == 0:
            prompt = (
                f"Research task: {query}\n\n"
                "Plan your approach: what questions need answering? "
                "What search queries would help? List your plan."
            )
        else:
            prompt = (
                f"Research task: {query}\n\n"
                f"Evidence gathered so far:\n" + "\n".join(evidence) + "\n\n"
                "Based on the evidence, either:\n"
                "1. Identify gaps and plan next steps, OR\n"
                "2. If you have enough information, provide FINAL ANSWER: <answer>"
            )

        response = call_llm(
            system=(
                "You are a thorough web research agent. Analyse tasks carefully, "
                "plan search strategies, evaluate evidence critically, and provide "
                "well-sourced answers. When you have enough evidence, begin your "
                "response with 'FINAL ANSWER:' followed by the answer."
            ),
            messages=[{"role": "user", "content": prompt}],
        )

        evidence.append(f"[Step {i + 1}] {response[:800]}")

        if "FINAL ANSWER:" in response:
            answer = response.split("FINAL ANSWER:")[-1].strip()
            break

    if not answer:
        answer = response

    # Generate structured summary
    summary = call_llm(
        system="Summarise the research process concisely (100-500 words).",
        messages=[{
            "role": "user",
            "content": (
                f"Query: {query}\n"
                f"Evidence:\n" + "\n".join(evidence) + "\n"
                f"Final answer: {answer}\n\n"
                "Summarise the reasoning chain and key evidence."
            ),
        }],
    )

    return {"answer": answer, "summary": summary}


if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "What is quantum computing?"
    result = main(q)
    print(f"ANSWER: {result['answer']}")
    print(f"SUMMARY: {result['summary']}")
