#!/usr/bin/env bash
# Tests for block_bean_validation.py. Run: .claude/hooks/block_bean_validation.test.sh
# Exit 0 = the edit is allowed through, exit 2 = blocked.
set -u

HOOK="$(cd "$(dirname "$0")" && pwd)/block_bean_validation.py"
pass=0
fail=0

# check <expected-exit> <name> <json-payload>
check() {
  local expected="$1" name="$2" payload="$3" actual
  printf '%s' "$payload" | python3 "$HOOK" >/dev/null 2>&1
  actual=$?
  if [ "$actual" = "$expected" ]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL: %s (expected exit %s, got %s)\n' "$name" "$expected" "$actual"
  fi
}

json() { python3 -c 'import json,sys; print(json.dumps({"tool_input":{"file_path":sys.argv[1],"content":sys.argv[2]}}))' "$1" "$2"; }
json_edit() { python3 -c 'import json,sys; print(json.dumps({"tool_input":{"file_path":sys.argv[1],"new_string":sys.argv[2]}}))' "$1" "$2"; }

API=apps/api/src/main/java/pt/ecrop/wall/Thing.java

# --- must block: real annotations in real code ---
check 2 'field annotated @NotBlank' \
  "$(json "$API" 'public record R(@NotBlank String message) {}')"
check 2 '@Size on a field' \
  "$(json "$API" 'public class C { @Size(max = 280) public String m; }')"
check 2 '@Valid on a parameter' \
  "$(json "$API" 'public Response create(@Valid Request r) { return null; }')"
check 2 'jakarta.validation import' \
  "$(json "$API" 'import jakarta.validation.constraints.NotNull;')"
check 2 'annotation arriving via an Edit, not a Write' \
  "$(json_edit "$API" '    @NotNull public String name;')"

# --- must allow: the three files that DOCUMENT the rule in javadoc ---
check 0 'javadoc {@code @NotBlank}/{@code @Size} (CreatePostRequest.java verbatim)' \
  "$(json "$API" '/**
 * No Bean Validation annotations: the message must be trimmed before its length is
 * checked, which {@code @NotBlank}/{@code @Size} do not do.
 */
public record CreatePostRequest(String name, String message, String type) {}')"
check 0 'line comment mentioning @Valid' \
  "$(json "$API" '// deliberately no @Valid here
public class C {}')"

# --- must allow: tricky lexical cases ---
check 0 'annotation name inside a string literal' \
  "$(json "$API" 'String msg = "use @NotBlank instead";')"
check 0 'block-comment opener inside a string' \
  "$(json "$API" 'String s = "/*"; // @Size mentioned after a fake comment opener')"
check 2 'quote inside a comment does not hide later real code' \
  "$(json "$API" '/* it is "unquoted */ @NotNull public String x;')"

# --- must allow: out of scope ---
check 0 'web file, not apps/api' \
  "$(json 'apps/web/src/app/post/post.ts' 'const x = "@NotBlank";')"
check 0 'non-java file under apps/api' \
  "$(json 'apps/api/src/main/resources/application.properties' '@NotBlank')"
check 0 'empty payload' "$(json "$API" '')"
check 0 'malformed json' 'not json at all'

# --- regression guard: every real file in the repo must still be editable ---
repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
while IFS= read -r f; do
  rel="${f#"$repo_root"/}"
  payload=$(python3 -c 'import json,sys; print(json.dumps({"tool_input":{"file_path":sys.argv[1],"content":open(sys.argv[2],encoding="utf-8").read()}}))' "$rel" "$f")
  check 0 "existing file stays editable: $(basename "$f")" "$payload"
done < <(find "$repo_root/apps/api/src" -name '*.java')

printf '\n%s passed, %s failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
