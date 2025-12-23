#!/usr/bin/env node

/**
 * Script to prefix unused variables with underscore
 * This tells ESLint that the variable is intentionally unused
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get lint output
const lintOutput = execSync('npm run lint 2>&1', {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024
});

// Parse lint errors for unused variables
const fixes = [];
let currentFile = null;

for (const line of lintOutput.split('\n')) {
        // Check if this is a file path
        const fileMatch = line.match(/^\/.*\.(tsx?|jsx?)$/);
        if (fileMatch) {
                currentFile = fileMatch[0];
                continue;
        }

        // Check for unused variable error
        const match = line.match(/'([^']+)' is assigned a value but never used/);
        if (match && currentFile) {
                const varName = match[1];
                const lineMatch = line.match(/^\s*(\d+):/);
                if (lineMatch) {
                        const lineNum = parseInt(lineMatch[1]);
                        fixes.push({
                                file: currentFile,
                                line: lineNum,
                                varName: varName,
                        });
                }
        }
}

console.log(`Found ${fixes.length} unused variables to fix\n`);

// Group fixes by file
const fileGroups = {};
for (const fix of fixes) {
        if (!fileGroups[fix.file]) {
                fileGroups[fix.file] = [];
        }
        fileGroups[fix.file].push(fix);
}

let totalFixed = 0;

// Process each file
for (const [filePath, fileFixes] of Object.entries(fileGroups)) {
        try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const lines = content.split('\n');
                let modified = false;

                // Sort fixes by line number (descending) to avoid line number shifts
                fileFixes.sort((a, b) => b.line - a.line);

                for (const fix of fileFixes) {
                        const lineIndex = fix.line - 1;
                        if (lineIndex < 0 || lineIndex >= lines.length) continue;

                        const line = lines[lineIndex];
                        const varName = fix.varName;

                        // Skip if already prefixed
                        if (varName.startsWith('_')) continue;

                        // Try to replace the variable name with underscore prefix
                        // Handle different declaration patterns
                        const patterns = [
                                // const varName = ...
                                new RegExp(`\\bconst\\s+${varName}\\b`, 'g'),
                                // let varName = ...
                                new RegExp(`\\blet\\s+${varName}\\b`, 'g'),
                                // var varName = ...
                                new RegExp(`\\bvar\\s+${varName}\\b`, 'g'),
                                // { varName } = ...
                                new RegExp(`\\{\\s*${varName}\\s*\\}`, 'g'),
                                // [varName, ...] = ...
                                new RegExp(`\\[([^\\]]*\\b)${varName}(\\b[^\\]]*)\\]`, 'g'),
                        ];

                        let replaced = false;
                        for (const pattern of patterns) {
                                if (pattern.test(line)) {
                                        lines[lineIndex] = line.replace(pattern, (match) => {
                                                return match.replace(new RegExp(`\\b${varName}\\b`), `_${varName}`);
                                        });
                                        replaced = true;
                                        modified = true;
                                        break;
                                }
                        }

                        if (replaced) {
                                console.log(`✓ ${path.relative(process.cwd(), filePath)}:${fix.line} - ${varName} → _${varName}`);
                                totalFixed++;
                        }
                }

                if (modified) {
                        fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
                }
        } catch (error) {
                console.error(`Error processing ${filePath}:`, error.message);
        }
}

console.log(`\n✓ Fixed ${totalFixed} unused variables`);
