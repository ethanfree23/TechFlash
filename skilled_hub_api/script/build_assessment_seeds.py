#!/usr/bin/env python3
"""Build TechFlash V1 assessment seed JSON from structured question banks.

This script is an authoring aid. The importer contract lives in
docs/ASSESSMENTS.md; the generated files under db/assessment_seeds/ are the
supported input. Do not treat this script as a parallel seeder.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "script"))

from assessment_banks import electrical as electrical_bank  # noqa: E402
from assessment_banks import hvac as hvac_bank  # noqa: E402
from assessment_banks import plumbing as plumbing_bank  # noqa: E402

OUT_DIR = ROOT / "db" / "assessment_seeds"

SCORE_BANDS = [
    {"slug": "foundational", "label": "Foundational", "min_score": 0, "max_score": 39},
    {"slug": "developing", "label": "Developing", "min_score": 40, "max_score": 59},
    {
        "slug": "apprentice_knowledge",
        "label": "Apprentice Knowledge",
        "min_score": 60,
        "max_score": 74,
    },
    {
        "slug": "advanced_apprentice_knowledge",
        "label": "Advanced Apprentice Knowledge",
        "min_score": 75,
        "max_score": 89,
    },
    {
        "slug": "strong_trade_knowledge",
        "label": "Strong Trade Knowledge",
        "min_score": 90,
        "max_score": 100,
    },
]

BANNED_BAND_WORDS = ("journeyman", "master", "certified", "licensed", "expert")

VERSION_COMMON = {
    "version_number": 1,
    "publish": False,
    "instructions": (
        "Answer each question to the best of your knowledge. You can go back and "
        "change answers before submitting. This is a knowledge assessment, not a "
        "license or certification."
    ),
    "time_limit_minutes": 30,
    "passing_score": None,
    "max_attempts": None,
    "retake_wait_hours": 336,
    "randomize_questions": True,
    "randomize_answer_choices": True,
    "allow_resume": True,
    "allow_back_navigation": True,
    "scoring_strategy": "normalized_percent",
    "score_bands": SCORE_BANDS,
}


def numbered_questions(prefix: str, items: list[dict]) -> list[dict]:
    easy = [item for item in items if item["difficulty"] == "easy"]
    medium = [item for item in items if item["difficulty"] == "medium"]
    hard = [item for item in items if item["difficulty"] == "hard"]
    grouped = easy + medium + hard
    if len(grouped) != 24:
        raise ValueError(f"{prefix} expected 24 questions, got {len(grouped)}")
    if len(easy) != 7 or len(medium) != 12 or len(hard) != 5:
        raise ValueError(
            f"{prefix} difficulty mix must be 7/12/5, got {len(easy)}/{len(medium)}/{len(hard)}"
        )
    out = []
    for index, item in enumerate(grouped, start=1):
        question = dict(item)
        question["external_key"] = f"{prefix}-{index:03d}"
        out.append(question)
    return out


def category_document(spec: dict) -> dict:
    return {
        "slug": spec["slug"],
        "name": spec["name"],
        "description": spec["description"],
        "question_count": 8,
        "weight": 1.0,
        "questions": numbered_questions(spec["prefix"], spec["questions"]),
    }


def document(assessment: dict, categories: list[dict]) -> dict:
    return {
        "assessment": assessment,
        "version": dict(VERSION_COMMON),
        "categories": [category_document(spec) for spec in categories],
    }


def qa_document(name: str, payload: dict) -> None:
    problems = []
    if payload["version"]["retake_wait_hours"] != 336:
        problems.append(f"{name}: retake_wait_hours must be 336")
    if payload["version"]["time_limit_minutes"] != 30:
        problems.append(f"{name}: time_limit_minutes must be 30")
    if payload["version"]["publish"] is not False:
        problems.append(f"{name}: publish should be false for seed files")
    labels = " ".join(band["label"].lower() for band in payload["version"]["score_bands"])
    for word in BANNED_BAND_WORDS:
        if word in labels:
            problems.append(f"{name}: banned score-band word {word!r}")

    questions = []
    for category in payload["categories"]:
        if category["question_count"] != 8:
            problems.append(f"{name}:{category['slug']}: blueprint must be 8")
        questions.extend(category["questions"])
        mix = Counter(q["difficulty"] for q in category["questions"])
        if mix != Counter(easy=7, medium=12, hard=5):
            problems.append(f"{name}:{category['slug']}: mix {dict(mix)}")

    if len(questions) != 120:
        problems.append(f"{name}: expected 120 questions, got {len(questions)}")

    keys = [q["external_key"] for q in questions]
    if len(set(keys)) != len(keys):
        problems.append(f"{name}: duplicate external_key")

    prompts = [q["prompt"].strip().lower() for q in questions]
    if len(set(prompts)) != len(prompts):
        problems.append(f"{name}: duplicate prompt")

    for question in questions:
        choices = question["choices"]
        correct = [c for c in choices if c["correct"] is True]
        if len(choices) != 4:
            problems.append(f"{question['external_key']}: expected 4 choices")
        if len(correct) != 1:
            problems.append(f"{question['external_key']}: expected one correct choice")
        if not question.get("explanation"):
            problems.append(f"{question['external_key']}: missing explanation")
        bodies = [c["body"].strip().lower() for c in choices]
        if len(set(bodies)) != len(bodies):
            problems.append(f"{question['external_key']}: duplicate choice text")

    if problems:
        raise SystemExit("QA failed:\n  " + "\n  ".join(problems))

    mix = Counter(q["difficulty"] for q in questions)
    print(
        f"{name}: 120 questions, difficulty {dict(mix)}, "
        f"categories={len(payload['categories'])}"
    )


def dump(name: str, payload: dict) -> Path:
    qa_document(name, payload)
    path = OUT_DIR / name
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n")
    return path


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    banks = [
        ("hvac_knowledge.json", hvac_bank.ASSESSMENT, hvac_bank.CATEGORIES),
        ("plumbing_knowledge.json", plumbing_bank.ASSESSMENT, plumbing_bank.CATEGORIES),
        ("electrical_knowledge.json", electrical_bank.ASSESSMENT, electrical_bank.CATEGORIES),
    ]
    for filename, assessment, categories in banks:
        dump(filename, document(assessment, categories))
    print(f"Wrote {len(banks)} seed files to {OUT_DIR}")


if __name__ == "__main__":
    main()
