#!/usr/bin/env bash
# e2e-test.sh — End-to-end integration test for OpenBrowserMCP server
#
# Tests the MCP protocol WITHOUT a Chrome extension connected.
# This validates:
#   a. MCP initialize + get sessionId
#   b. tools/list (verify ≥ 17 tools)
#   c. tools/call computer/screenshot (no extension) → verify isError=true with 'No extension' message
#   d. tools/call javascript_tool with invalid code → verify isError=true
#   e. GET /status → verify connectedExtensions field exists
#   f. DELETE /mcp → verify session terminated, next request returns 400
#
# NOTE: Tests requiring Chrome extension (VAL-CROSS-001, VAL-CROSS-002) are not
# included here. They require manual testing with the extension loaded in Chrome.
# See docs/manual-testing.md for extension-dependent test procedures.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PORT=3500
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_DIST="$(cd "$(dirname "$0")/.." && pwd)/dist/index.js"
PASS=0
FAIL=0
SERVER_PID=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
red()   { printf '\033[0;31m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[0;33m%s\033[0m\n' "$*"; }

pass() {
  green "  ✓ PASS: $1"
  PASS=$((PASS + 1))
}

fail() {
  red "  ✗ FAIL: $1"
  red "         $2"
  FAIL=$((FAIL + 1))
}

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Build server if needed
# ---------------------------------------------------------------------------
echo ""
yellow "=== OpenBrowserMCP E2E Integration Tests ==="
yellow "=== (No extension required — protocol-level tests) ==="
echo ""

if [ ! -f "$SERVER_DIST" ]; then
  echo "Building server..."
  (cd "$(dirname "$0")/.." && pnpm run build) || { red "Build failed"; exit 1; }
fi

# ---------------------------------------------------------------------------
# Start server in background
# ---------------------------------------------------------------------------
echo "Starting MCP server on port ${PORT}..."
PORT=${PORT} node "$SERVER_DIST" &
SERVER_PID=$!

# Wait for server to be ready (up to 10 seconds)
WAIT=0
until curl -sf "${BASE_URL}/health" >/dev/null 2>&1; do
  if [ $WAIT -ge 10 ]; then
    red "Server failed to start within 10 seconds"
    exit 1
  fi
  sleep 1
  WAIT=$((WAIT + 1))
done
echo "Server ready (pid=${SERVER_PID})"
echo ""

# ---------------------------------------------------------------------------
# Helper: Parse JSON from either raw JSON or SSE response body
# ---------------------------------------------------------------------------
parse_mcp_json() {
  local response="$1"
  # If the response contains SSE data lines, extract the first data line
  if echo "$response" | grep -q "^data:"; then
    echo "$response" | grep "^data:" | head -1 | sed 's/^data: //'
  else
    echo "$response"
  fi
}

# ---------------------------------------------------------------------------
# Test a: MCP initialize — get sessionId
# ---------------------------------------------------------------------------
echo "--- Test a: MCP initialize ---"
INIT_RESPONSE=$(curl -s -D /tmp/e2e-headers.txt \
  -X POST "${BASE_URL}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"e2e-test","version":"1.0"}},"id":1}')

SESSION_ID=$(grep -i "^mcp-session-id:" /tmp/e2e-headers.txt 2>/dev/null | tr -d '\r' | awk '{print $2}')

if [ -z "$SESSION_ID" ]; then
  fail "MCP initialize" "No mcp-session-id header in response. Headers: $(cat /tmp/e2e-headers.txt)"
else
  INIT_JSON=$(parse_mcp_json "$INIT_RESPONSE")
  SERVER_NAME=$(echo "$INIT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('result',{}).get('serverInfo',{}).get('name',''))" 2>/dev/null || echo "")
  if [ "$SERVER_NAME" = "openbrowsermcp" ]; then
    pass "MCP initialize — sessionId=${SESSION_ID}, serverInfo.name=${SERVER_NAME}"
  else
    fail "MCP initialize" "Expected serverInfo.name=openbrowsermcp, got: ${SERVER_NAME}. Response: ${INIT_RESPONSE}"
  fi
fi

# ---------------------------------------------------------------------------
# Test b: tools/list — verify ≥ 17 tools
# ---------------------------------------------------------------------------
echo "--- Test b: tools/list ---"
if [ -z "$SESSION_ID" ]; then
  fail "tools/list" "Skipped — no session ID from previous step"
else
  TOOLS_RESPONSE=$(curl -s \
    -X POST "${BASE_URL}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}')

  # Parse SSE if needed (response may be text/event-stream)
  if echo "$TOOLS_RESPONSE" | grep -q "^data:"; then
    TOOLS_JSON=$(echo "$TOOLS_RESPONSE" | grep "^data:" | head -1 | sed 's/^data: //')
  else
    TOOLS_JSON="$TOOLS_RESPONSE"
  fi

  TOOL_COUNT=$(echo "$TOOLS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('result',{}).get('tools',[])))" 2>/dev/null || echo "0")
  if [ "$TOOL_COUNT" -ge 17 ] 2>/dev/null; then
    pass "tools/list — found ${TOOL_COUNT} tools (≥ 17 required)"
  else
    fail "tools/list" "Expected ≥ 17 tools, got ${TOOL_COUNT}. Response: ${TOOLS_RESPONSE}"
  fi
fi

# ---------------------------------------------------------------------------
# Test c: tools/call computer/screenshot (no extension) → isError=true
# ---------------------------------------------------------------------------
echo "--- Test c: computer/screenshot without extension ---"
if [ -z "$SESSION_ID" ]; then
  fail "computer/screenshot no extension" "Skipped — no session ID"
else
  SCREENSHOT_RESPONSE=$(curl -s \
    -X POST "${BASE_URL}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"computer","arguments":{"action":"screenshot"}},"id":3}')

  if echo "$SCREENSHOT_RESPONSE" | grep -q "^data:"; then
    SCREENSHOT_JSON=$(echo "$SCREENSHOT_RESPONSE" | grep "^data:" | head -1 | sed 's/^data: //')
  else
    SCREENSHOT_JSON="$SCREENSHOT_RESPONSE"
  fi

  IS_ERROR=$(echo "$SCREENSHOT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(str(r.get('isError',False)).lower())" 2>/dev/null || echo "false")
  ERROR_TEXT=$(echo "$SCREENSHOT_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); c=r.get('content',[]); print(c[0].get('text','') if c else '')" 2>/dev/null || echo "")

  if [ "$IS_ERROR" = "true" ] && echo "$ERROR_TEXT" | grep -qi "extension\|not connected\|no extension"; then
    pass "computer/screenshot without extension — isError=true, message: ${ERROR_TEXT}"
  else
    fail "computer/screenshot without extension" "Expected isError=true with 'extension' mention. isError=${IS_ERROR}, text=${ERROR_TEXT}. Response: ${SCREENSHOT_RESPONSE}"
  fi
fi

# ---------------------------------------------------------------------------
# Test d: tools/call javascript_tool with invalid code → isError=true
# ---------------------------------------------------------------------------
echo "--- Test d: javascript_tool with invalid code ---"
# Note: javascript_tool requires extension to execute. Without extension,
# it returns isError=true due to no extension connected. But we also test
# that the protocol handles the error gracefully.
# VAL-CROSS-003: Error recovery — invalid JS → isError, server continues working
if [ -z "$SESSION_ID" ]; then
  fail "javascript_tool invalid code" "Skipped — no session ID"
else
  JS_RESPONSE=$(curl -s \
    -X POST "${BASE_URL}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: ${SESSION_ID}" \
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"javascript_tool","arguments":{"code":"this is not valid javascript !!!"}},"id":4}')

  if echo "$JS_RESPONSE" | grep -q "^data:"; then
    JS_JSON=$(echo "$JS_RESPONSE" | grep "^data:" | head -1 | sed 's/^data: //')
  else
    JS_JSON="$JS_RESPONSE"
  fi

  IS_ERROR=$(echo "$JS_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); print(str(r.get('isError',False)).lower())" 2>/dev/null || echo "false")

  if [ "$IS_ERROR" = "true" ]; then
    pass "javascript_tool with invalid code — isError=true (VAL-CROSS-003 error recovery verified)"

    # Verify server still responds after error (VAL-CROSS-003: continuation)
    HEALTH_AFTER=$(curl -s "${BASE_URL}/health")
    if echo "$HEALTH_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'status' in d" 2>/dev/null; then
      pass "Server continues operating after isError response (VAL-CROSS-003)"
    else
      fail "Server health after error" "Server did not respond correctly after tool error. Response: ${HEALTH_AFTER}"
    fi
  else
    fail "javascript_tool with invalid code" "Expected isError=true. Response: ${JS_RESPONSE}"
  fi
fi

# ---------------------------------------------------------------------------
# Test e: GET /status → verify connectedExtensions field exists
# ---------------------------------------------------------------------------
echo "--- Test e: GET /status ---"
STATUS_RESPONSE=$(curl -s "${BASE_URL}/status")

HAS_EXTENSIONS=$(echo "$STATUS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'connectedExtensions' in d else 'no')" 2>/dev/null || echo "no")
if [ "$HAS_EXTENSIONS" = "yes" ]; then
  EXT_COUNT=$(echo "$STATUS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('connectedExtensions',[])))" 2>/dev/null || echo "?")
  pass "GET /status — connectedExtensions field present (count=${EXT_COUNT}, no extension expected=0)"
else
  fail "GET /status" "connectedExtensions field missing. Response: ${STATUS_RESPONSE}"
fi

# Also verify /health extensionCount field
echo "--- Test e (bonus): GET /health ---"
HEALTH_RESPONSE=$(curl -s "${BASE_URL}/health")
HAS_EXT_COUNT=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'extensionCount' in d else 'no')" 2>/dev/null || echo "no")
if [ "$HAS_EXT_COUNT" = "yes" ]; then
  pass "GET /health — extensionCount field present"
else
  fail "GET /health" "extensionCount field missing. Response: ${HEALTH_RESPONSE}"
fi

# ---------------------------------------------------------------------------
# Test f: DELETE /mcp → verify session terminated, next request returns 400
# ---------------------------------------------------------------------------
echo "--- Test f: DELETE /mcp session termination ---"
if [ -z "$SESSION_ID" ]; then
  fail "DELETE /mcp" "Skipped — no session ID"
else
  DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X DELETE "${BASE_URL}/mcp" \
    -H "mcp-session-id: ${SESSION_ID}")

  if [ "$DELETE_STATUS" = "200" ]; then
    pass "DELETE /mcp — returned 200"

    # Next request with same session ID should return 400
    AFTER_DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${BASE_URL}/mcp" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json, text/event-stream" \
      -H "mcp-session-id: ${SESSION_ID}" \
      -d '{"jsonrpc":"2.0","method":"ping","id":99}')

    if [ "$AFTER_DELETE_STATUS" = "400" ] || [ "$AFTER_DELETE_STATUS" = "404" ]; then
      pass "POST /mcp after DELETE — returned ${AFTER_DELETE_STATUS} (session correctly terminated)"
    else
      fail "POST /mcp after DELETE" "Expected 400/404, got ${AFTER_DELETE_STATUS}"
    fi
  else
    fail "DELETE /mcp" "Expected 200, got ${DELETE_STATUS}"
  fi
fi

# ---------------------------------------------------------------------------
# NOTE: Extension-dependent tests (VAL-CROSS-001, VAL-CROSS-002)
# ---------------------------------------------------------------------------
echo ""
yellow "--- NOTE: Extension-dependent tests NOT run (require Chrome + extension) ---"
yellow "    VAL-CROSS-001: Full agent workflow (navigate, screenshot, interact)"
yellow "    VAL-CROSS-002: Multi-tab workflow (create tab, use it, return)"
yellow "    Run manually: pnpm --filter extension build, load in Chrome, then test"
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$((PASS + FAIL))
echo "=== Results: ${PASS}/${TOTAL} passed ==="
if [ $FAIL -eq 0 ]; then
  green "All tests PASSED ✓"
  exit 0
else
  red "${FAIL} test(s) FAILED ✗"
  exit 1
fi
