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
pnpm audit --audit-level=moderate || {
    echo "⚠️  Some vulnerabilities found. Review the output above."
    echo "   Run 'pnpm audit --fix' to attempt automatic fixes."
}

echo ""
echo "✅ Security audit completed!"
echo ""
echo "📋 Next steps:"
echo "   1. Review any vulnerabilities found above"
echo "   2. Update dependencies: pnpm update"
echo "   3. Fix vulnerabilities: pnpm audit --fix"
echo "   4. Review the security report: docs/SECURITY_AUDIT_REPORT.md"
