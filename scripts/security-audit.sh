#!/bin/bash

# Security Audit Script for AI Workflow
# This script performs dependency vulnerability scanning and generates a report
# Requirements: 8.1, 8.2

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Output file
REPORT_FILE="security-audit-report.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Security Audit - AI Workflow${NC}"
echo -e "${BLUE}  ${TIMESTAMP}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Initialize report file
{
    echo "Security Audit Report"
    echo "Generated: ${TIMESTAMP}"
    echo "========================================"
    echo ""
} > "${REPORT_FILE}"

# Function to log to both console and file
log() {
    echo -e "$1"
    echo -e "$1" | sed 's/\x1b\[[0-9;]*m//g' >> "${REPORT_FILE}"
}

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for pnpm
if ! command_exists pnpm; then
    log "${RED}Error: pnpm is not installed${NC}"
    log "Please install pnpm: npm install -g pnpm"
    exit 1
fi

log "${GREEN}✓ pnpm found${NC}"
log ""

# Run pnpm audit
log "${BLUE}Running dependency vulnerability scan...${NC}"
log ""

# Capture audit output
AUDIT_OUTPUT=$(pnpm audit 2>&1 || true)
AUDIT_EXIT_CODE=$?

# Parse and display results
echo "${AUDIT_OUTPUT}" >> "${REPORT_FILE}"

# Count vulnerabilities by severity
CRITICAL_COUNT=$(echo "${AUDIT_OUTPUT}" | grep -c "critical" || echo "0")
HIGH_COUNT=$(echo "${AUDIT_OUTPUT}" | grep -c "high" || echo "0")
MODERATE_COUNT=$(echo "${AUDIT_OUTPUT}" | grep -c "moderate" || echo "0")
LOW_COUNT=$(echo "${AUDIT_OUTPUT}" | grep -c "low" || echo "0")

log ""
log "${BLUE}========================================${NC}"
log "${BLUE}  Vulnerability Summary${NC}"
log "${BLUE}========================================${NC}"
log ""

if [ "${CRITICAL_COUNT}" -gt 0 ]; then
    log "${RED}Critical: ${CRITICAL_COUNT}${NC}"
else
    log "${GREEN}Critical: 0${NC}"
fi

if [ "${HIGH_COUNT}" -gt 0 ]; then
    log "${RED}High: ${HIGH_COUNT}${NC}"
else
    log "${GREEN}High: 0${NC}"
fi

if [ "${MODERATE_COUNT}" -gt 0 ]; then
    log "${YELLOW}Moderate: ${MODERATE_COUNT}${NC}"
else
    log "${GREEN}Moderate: 0${NC}"
fi

if [ "${LOW_COUNT}" -gt 0 ]; then
    log "${YELLOW}Low: ${LOW_COUNT}${NC}"
else
    log "${GREEN}Low: 0${NC}"
fi

log ""

# Check for outdated packages
log "${BLUE}Checking for outdated packages...${NC}"
log ""

OUTDATED_OUTPUT=$(pnpm outdated 2>&1 || true)
echo "${OUTDATED_OUTPUT}" >> "${REPORT_FILE}"

if [ -n "${OUTDATED_OUTPUT}" ] && [ "${OUTDATED_OUTPUT}" != "No outdated packages" ]; then
    log "${YELLOW}Some packages are outdated. Consider updating them.${NC}"
    log ""
    echo "${OUTDATED_OUTPUT}"
else
    log "${GREEN}All packages are up to date.${NC}"
fi

log ""
log "${BLUE}========================================${NC}"
log "${BLUE}  Recommendations${NC}"
log "${BLUE}========================================${NC}"
log ""

# Provide recommendations based on findings
if [ "${CRITICAL_COUNT}" -gt 0 ] || [ "${HIGH_COUNT}" -gt 0 ]; then
    log "${RED}⚠ URGENT: Critical or high severity vulnerabilities found!${NC}"
    log ""
    log "Recommended actions:"
    log "1. Run 'pnpm audit --fix' to automatically fix vulnerabilities"
    log "2. Review the audit report for manual fixes if needed"
    log "3. Update vulnerable packages to their latest secure versions"
    log "4. Consider using 'pnpm update' to update all packages"
    log ""
elif [ "${MODERATE_COUNT}" -gt 0 ] || [ "${LOW_COUNT}" -gt 0 ]; then
    log "${YELLOW}⚠ Some vulnerabilities found, but not critical.${NC}"
    log ""
    log "Recommended actions:"
    log "1. Review the vulnerabilities and assess their impact"
    log "2. Plan updates during your next maintenance window"
    log "3. Run 'pnpm audit --fix' to attempt automatic fixes"
    log ""
else
    log "${GREEN}✓ No known vulnerabilities found!${NC}"
    log ""
    log "Best practices:"
    log "1. Continue running security audits regularly"
    log "2. Keep dependencies up to date"
    log "3. Monitor security advisories for your dependencies"
    log ""
fi

log "${BLUE}========================================${NC}"
log "${BLUE}  Report saved to: ${REPORT_FILE}${NC}"
log "${BLUE}========================================${NC}"

# Exit with appropriate code
if [ "${CRITICAL_COUNT}" -gt 0 ] || [ "${HIGH_COUNT}" -gt 0 ]; then
    log ""
    log "${RED}Audit failed: Critical or high severity vulnerabilities found${NC}"
    exit 1
elif [ "${MODERATE_COUNT}" -gt 0 ]; then
    log ""
    log "${YELLOW}Audit completed with warnings${NC}"
    exit 0
else
    log ""
    log "${GREEN}Audit passed${NC}"
    exit 0
fi
