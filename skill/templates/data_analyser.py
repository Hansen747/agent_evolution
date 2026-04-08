"""
Subagent template: Data Analyser

A general-purpose data analysis subagent that processes structured data,
runs computations, and generates insights.
"""

import json
import os
from typing import Dict, Any


def call_llm(system: str, messages: list, max_tokens: int = 4000) -> str:
    """Call an LLM API."""
    try:
        import requests
        url = os.environ.get("LLM_URL", "")
        api_key = os.environ.get("LLM_API_KEY", "")
        model = os.environ.get("LLM_MODEL", "gpt-4")

        if not url or not api_key:
            return f"[LLM not configured] System: {system}"

        headers = {
            "Authorization": f"Bearer {api_key}",
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
    Analyse data based on a natural language query.

    The LLM determines what analysis to perform, generates Python code
    to execute it, and interprets the results.

    Args:
        query: Analysis task description (may include file paths, data descriptions, etc.)

    Returns:
        {"answer": "<analysis result>", "summary": "<methodology and findings>"}
    """
    max_iterations = 5
    evidence = []
    answer = ""

    for i in range(max_iterations):
        if i == 0:
            prompt = (
                f"Data analysis task: {query}\n\n"
                "Plan the analysis:\n"
                "1. What data is involved?\n"
                "2. What computations or transformations are needed?\n"
                "3. What Python code would perform the analysis?\n\n"
                "Provide your plan and any initial code."
            )
        else:
            prompt = (
                f"Task: {query}\n\n"
                f"Progress:\n" + "\n".join(evidence) + "\n\n"
                "Continue the analysis. If complete, state FINAL ANSWER: <result>"
            )

        response = call_llm(
            system=(
                "You are a data analysis expert. Given a task, plan the approach, "
                "write Python code for computations, interpret results, and provide "
                "clear findings. When analysis is complete, start with 'FINAL ANSWER:'"
            ),
            messages=[{"role": "user", "content": prompt}],
        )

        evidence.append(f"[Step {i + 1}] {response[:800]}")

        if "FINAL ANSWER:" in response:
            answer = response.split("FINAL ANSWER:")[-1].strip()
            break

    if not answer:
        answer = response

    summary = call_llm(
        system="Summarise the data analysis methodology and findings (100-500 words).",
        messages=[{
            "role": "user",
            "content": (
                f"Task: {query}\nProcess:\n" + "\n".join(evidence) +
                f"\nAnswer: {answer}\n\nSummarise the methodology and key findings."
            ),
        }],
    )

    return {"answer": answer, "summary": summary}


if __name__ == "__main__":
    import sys
    q = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Analyse a sample dataset"
    result = main(q)
    print(f"ANSWER: {result['answer']}")
    print(f"SUMMARY: {result['summary']}")
