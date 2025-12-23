#!/usr/bin/env node

/**
 * Script to remove unused NextResponse imports from API route files
 */

const fs = require('fs');
const path = require('path');

function findRouteFiles(dir, fileList = []) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                        findRouteFiles(filePath, fileList);
                } else if (file === 'route.ts') {
                        fileList.push(filePath);
                }
        }

        return fileList;
}

function removeUnusedNextResponse() {
        const apiDir = path.join(process.cwd(), 'src/app/api');
        const files = findRouteFiles(apiDir);

        console.log(`Found ${files.length} route files to check`);

        let fixedCount = 0;

        for (const file of files) {
                const content = fs.readFileSync(file, 'utf-8');

                // Check if file imports NextResponse
                if (!content.includes('NextResponse')) {
                        continue;
                }

                // Check if NextResponse is actually used (not just imported)
                const lines = content.split('\n');
                const importLine = lines.findIndex(line =>
                        line.includes('import') && line.includes('NextResponse') && line.includes('next/server')
                );

                if (importLine === -1) continue;

                // Check if NextResponse is used anywhere else in the file
                const usedInCode = lines.some((line, index) =>
                        index !== importLine &&
                        line.includes('NextResponse') &&
                        !line.trim().startsWith('//')
                );

                if (!usedInCode) {
                        // Remove the unused import
                        const originalImport = lines[importLine].trim();
                        let newImport = originalImport;

                        // Handle different import patterns
                        if (originalImport.includes('{') && originalImport.includes('}')) {
                                // Extract the imports between braces
                                const match = originalImport.match(/import\s+\{([^}]+)\}\s+from/);
                                if (match) {
                                        const imports = match[1]
                                                .split(',')
                                                .map(i => i.trim())
                                                .filter(i => i !== 'NextResponse');

                                        if (imports.length === 0) {
                                                // No other imports, remove the entire line
                                                lines.splice(importLine, 1);
                                                fixedCount++;
                                        } else if (imports.length < match[1].split(',').length) {
                                                // Some imports remain
                                                newImport = `import { ${imports.join(', ')} } from 'next/server'`;
                                                lines[importLine] = newImport;
                                                fixedCount++;
                                        }
                                }
                        } else if (originalImport === "import { NextResponse } from 'next/server'") {
                                // Single import: remove entire line
                                lines.splice(importLine, 1);
                                fixedCount++;
                        }

                        if (fixedCount > 0 || newImport !== originalImport) {
                                const newContent = lines.join('\n');
                                fs.writeFileSync(file, newContent, 'utf-8');
                                console.log(`✓ Fixed: ${path.relative(process.cwd(), file)}`);
                        }
                }
        }

        console.log(`\nFixed ${fixedCount} files`);
}

removeUnusedNextResponse();
