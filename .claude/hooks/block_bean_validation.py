#!/usr/bin/env python3
"""PreToolUse guard: keep Bean Validation annotations out of apps/api.

Validation in this codebase is manual, on purpose — a message must be *trimmed before* its
length is checked (a whitespace-only message is empty), which @NotBlank/@Size can't do in one
pass. See CLAUDE.md, "Validation in resources is manual, not Bean Validation".

The rule used to live only in prose, in two places, and drifted into saying the exact
opposite. This is the enforcement half.

Only real code counts: three files legitimately *discuss* @NotBlank/@Size in javadoc to
explain why they aren't used, so comments and string literals are stripped before the check.
Blocking edits to the files that document the rule would be a self-defeating hook.
"""

import json
import re
import sys

ANNOTATIONS = (
    "NotBlank|NotNull|NotEmpty|Size|Valid|Min|Max|Pattern|Email|AssertTrue|AssertFalse"
    "|Positive|PositiveOrZero|Negative|NegativeOrZero|Past|PastOrPresent|Future"
    "|FutureOrPresent|Digits|DecimalMin|DecimalMax"
)
BANNED = re.compile(rf"@({ANNOTATIONS})\b|\bjakarta\.validation\b")


def strip_comments_and_strings(source: str) -> str:
    """Blank out //, /* */ and "..." / '...' so only executable code is searched.

    A char scanner rather than a regex: a regex for block comments trips over "/*" inside a
    string literal, and a regex for strings trips over a quote inside a comment. Replaces
    with spaces instead of deleting so nothing accidentally joins across a removed span.
    """
    out = []
    i, n = 0, len(source)
    while i < n:
        c = source[i]
        pair = source[i : i + 2]
        if pair == "//":
            while i < n and source[i] != "\n":
                out.append(" ")
                i += 1
        elif pair == "/*":
            while i < n and source[i : i + 2] != "*/":
                out.append("\n" if source[i] == "\n" else " ")
                i += 1
            out.append("  ")
            i += 2
        elif c in "\"'":
            quote = c
            out.append(" ")
            i += 1
            while i < n and source[i] != quote:
                if source[i] == "\\":
                    out.append(" ")
                    i += 1
                if i < n:
                    out.append(" ")
                    i += 1
            out.append(" ")
            i += 1
        else:
            out.append(c)
            i += 1
    return "".join(out)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        return 0

    tool_input = payload.get("tool_input", {})
    path = tool_input.get("file_path", "")
    if not path.endswith(".java") or "apps/api/" not in path:
        return 0

    # Write sends the whole file; Edit sends only the replacement text. Either way, check
    # what is about to land, not what is already on disk.
    incoming = tool_input.get("content") or tool_input.get("new_string") or ""
    if not incoming:
        return 0

    found = BANNED.search(strip_comments_and_strings(incoming))
    if not found:
        return 0

    hit = found.group(0)
    kind = "import" if hit.startswith("jakarta") else "annotation"
    print(
        f"Blocked: '{hit}' is a Bean Validation {kind}.\n"
        "This codebase validates by hand — the message must be trimmed before its length is\n"
        "checked, which @NotBlank/@Size cannot do in one pass. Follow PostsResource.create:\n"
        "check the field yourself and return ApiError with a Portuguese message.\n"
        "See CLAUDE.md. If the rule is genuinely being changed, update CLAUDE.md and this\n"
        "hook in the same commit.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
