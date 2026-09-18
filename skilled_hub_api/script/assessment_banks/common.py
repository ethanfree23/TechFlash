from __future__ import annotations


def q(difficulty: str, prompt: str, explanation: str, correct: str, distractors: list[str]) -> dict:
    if difficulty not in {"easy", "medium", "hard"}:
        raise ValueError(f"unknown difficulty {difficulty}")
    if len(distractors) != 3:
        raise ValueError(f"expected 3 distractors for: {prompt[:80]}")
    bodies = [correct, *distractors]
    if len({body.strip() for body in bodies}) != 4:
        raise ValueError(f"duplicate choice text for: {prompt[:80]}")
    if any(not body.strip() for body in bodies + [prompt, explanation]):
        raise ValueError(f"blank field for: {prompt[:80]}")
    choices = [{"key": "a", "body": correct, "correct": True}]
    for index, body in enumerate(distractors):
        choices.append({"key": chr(ord("b") + index), "body": body, "correct": False})
    return {
        "difficulty": difficulty,
        "prompt": prompt.strip(),
        "explanation": explanation.strip(),
        "active": True,
        "choices": choices,
    }
