#!/usr/bin/env node

function parseNodeVersion(version) {
  const [major, minor, patch] = version.split('.').map((v) => Number(v))
  return { major, minor, patch }
}

function isAtLeast(actual, required) {
  if (actual.major !== required.major) return actual.major > required.major
  if (actual.minor !== required.minor) return actual.minor > required.minor
  return actual.patch >= required.patch
}

const required = { major: 20, minor: 19, patch: 0 }
const actual = parseNodeVersion(process.versions.node)

if (process.env.SKIP_NODE_VERSION_CHECK === '1' || process.env.SKIP_NODE_VERSION_CHECK === 'true') {
  process.exit(0)
}

if (isAtLeast(actual, required)) {
  process.exit(0)
}

console.error(
  `[check:node] Node.js ${required.major}.${required.minor}.${required.patch}+ is required (current: ${process.versions.node}).\n` +
    `Please upgrade Node (e.g. via nvm: "nvm install ${required.major}.${required.minor}.${required.patch}" && "nvm use").`
)
process.exit(1)
