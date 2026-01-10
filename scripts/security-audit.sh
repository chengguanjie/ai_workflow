#!/bin/bash

# Security Audit Script
# Runs dependency vulnerability scans and security checks

set -e

echo "🔒 Starting Security Audit..."
echo ""

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first."
    exit 1
fi

# Run pnpm audit
echo "📦 Running dependency vulnerability scan..."
STRICT_MODE="${SECURITY_AUDIT_STRICT:-false}"

run_audit() {
  local registry_arg="$1"
  if [[ -n "$registry_arg" ]]; then
    pnpm audit --audit-level=moderate --registry="$registry_arg"
  else
    pnpm audit --audit-level=moderate
  fi
}

set +e
AUDIT_OUTPUT="$(run_audit "" 2>&1)"
AUDIT_CODE=$?

# Some registries (e.g. npmmirror) do not implement the audit endpoint.
if echo "$AUDIT_OUTPUT" | grep -q "ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS"; then
  echo "⚠️  pnpm audit endpoint not available for current registry; retrying with registry.npmjs.org"
  AUDIT_OUTPUT="$(run_audit "https://registry.npmjs.org" 2>&1)"
  AUDIT_CODE=$?
fi
set -e

echo "$AUDIT_OUTPUT"

if [[ $AUDIT_CODE -ne 0 ]]; then
  if [[ "$STRICT_MODE" == "true" ]]; then
    echo ""
    echo "❌ Security audit failed (strict mode)."
    exit $AUDIT_CODE
  fi
  echo ""
  echo "⚠️  Some vulnerabilities found or audit failed. Review the output above."
  echo "   Run 'pnpm audit --fix' to attempt automatic fixes."
fi

echo ""
echo "✅ Security audit completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Review any vulnerabilities found above"
echo "   2. Update dependencies: pnpm update"
echo "   3. Fix vulnerabilities: pnpm audit --fix"
echo "   4. Review the security report: docs/SECURITY_AUDIT_REPORT.md"
