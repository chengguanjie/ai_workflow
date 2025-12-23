#!/usr/bin/env node

/**
 * Script to remove unused imports from TypeScript/TSX files
 * Focuses on common UI component imports that are often unused
 */

const fs = require('fs');
const path = require('path');

// Common unused imports to check
const UNUSED_IMPORTS = [
        'ChevronDown',
        'Save',
        'X',
        'Info',
        'Settings',
        'Textarea',
        'useMemo',
        'Category',
        'CategoryGroup',
        'TEMPLATE_CATEGORIES',
        'EdgeLabelRenderer',
        'cn',
        'ExecutionStatus',
        'DropdownMenuSub',
        'DropdownMenuSubTrigger',
        'DropdownMenuSubContent',
        'GitBranch'
];

function findTsFiles(dir, fileList = [], excludeDirs = ['node_modules', '.next', 'dist']) {
        const files = fs.readdirSync(dir);

        for (const file of files) {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);

                if (stat.isDirectory()) {
                        if (!excludeDirs.includes(file)) {
                                findTsFiles(filePath, fileList, excludeDirs);
                        }
                } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
                        fileList.push(filePath);
                }
        }

        return fileList;
}

function removeUnusedImport(content, importName) {
        const lines = content.split('\n');
        let modified = false;

        for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Skip if not an import line
                if (!line.trim().startsWith('import')) continue;

                // Skip if this import is not in this line
                if (!line.includes(importName)) continue;

                // Check if the import is used elsewhere in the file
                const usedInCode = lines.some((codeLine, index) =>
                        index !== i &&
                        codeLine.includes(importName) &&
                        !codeLine.trim().startsWith('//')
                );

                if (usedInCode) continue;

                // Remove the unused import
                if (line.includes('{') && line.includes('}')) {
                        // Extract imports between braces
                        const match = line.match(/import\s+\{([^}]+)\}/);
                        if (match) {
                                const imports = match[1]
                                        .split(',')
                                        .map(i => i.trim())
                                        .filter(i => i !== importName);

                                if (imports.length === 0) {
                                        // No other imports, remove the entire line
                                        lines.splice(i, 1);
                                        i--; // Adjust index after removal
                                        modified = true;
                                } else if (imports.length < match[1].split(',').length) {
                                        // Some imports remain
                                        const fromPart = line.substring(line.indexOf('from'));
                                        lines[i] = `import { ${imports.join(', ')} } ${fromPart}`;
                                        modified = true;
                                }
                        }
                } else if (line.includes(`import ${importName}`)) {
                        // Default import
                        lines.splice(i, 1);
                        i--;
                        modified = true;
                }
        }

        return { content: lines.join('\n'), modified };
}

function cleanFile(filePath) {
        let content = fs.readFileSync(filePath, 'utf-8');
        let totalModified = false;

        for (const importName of UNUSED_IMPORTS) {
                const result = removeUnusedImport(content, importName);
                if (result.modified) {
                        content = result.content;
                        totalModified = true;
                }
        }

        if (totalModified) {
                fs.writeFileSync(filePath, content, 'utf-8');
                return true;
        }

        return false;
}

function main() {
        const srcDir = path.join(process.cwd(), 'src');
        const files = findTsFiles(srcDir);

        console.log(`Found ${files.length} TypeScript files to check`);

        let fixedCount = 0;
        const fixedFiles = [];

        for (const file of files) {
                if (cleanFile(file)) {
                        fixedCount++;
                        fixedFiles.push(path.relative(process.cwd(), file));
                }
        }

        console.log(`\n✓ Fixed ${fixedCount} files:\n`);
        fixedFiles.forEach(file => console.log(`  - ${file}`));
}

main();
