#!/usr/bin/env node
/**
 * Zeabur 部署启动脚本
 *
 * 功能：
 * 1. 等待数据库就绪
 * 2. 运行 Prisma 数据库迁移
 * 3. 启动 Next.js 应用
 */

const { execSync, spawn } = require('child_process');
const { existsSync, mkdirSync } = require('fs');

const MAX_RETRIES = 10;
const RETRY_DELAY = 3000;

function log(message) {
    console.log(`[Deploy] ${new Date().toISOString()} - ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDatabase() {
    log('Waiting for database connection...');

    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            execSync('npx prisma db push --skip-generate', {
                stdio: 'inherit',
                timeout: 60000
            });
            log('Database connection successful!');
            return true;
        } catch (error) {
            log(`Database connection attempt ${i}/${MAX_RETRIES} failed`);
            if (i < MAX_RETRIES) {
                log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
                await sleep(RETRY_DELAY);
            }
        }
    }

    throw new Error('Failed to connect to database after maximum retries');
}

function ensureUploadDir() {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    if (!existsSync(uploadDir)) {
        log(`Creating upload directory: ${uploadDir}`);
        mkdirSync(uploadDir, { recursive: true });
    }
}

function startNextApp() {
    log('Starting Next.js application...');

    // 使用 npx next start 启动应用
    const nextProcess = spawn('npx', ['next', 'start', '-p', process.env.PORT || '3000', '-H', '0.0.0.0'], {
        stdio: 'inherit',
        env: {
            ...process.env,
            PORT: process.env.PORT || '3000',
            HOSTNAME: '0.0.0.0'
        }
    });

    nextProcess.on('error', (error) => {
        log(`Failed to start application: ${error.message}`);
        process.exit(1);
    });

    nextProcess.on('exit', (code) => {
        log(`Application exited with code ${code}`);
        process.exit(code || 0);
    });

    // 处理进程信号
    ['SIGINT', 'SIGTERM'].forEach(signal => {
        process.on(signal, () => {
            log(`Received ${signal}, shutting down...`);
            nextProcess.kill(signal);
        });
    });
}

async function main() {
    log('='.repeat(50));
    log('AI Workflow - Zeabur Deployment');
    log('='.repeat(50));

    try {
        // 检查必要的环境变量
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is required');
        }

        // 等待数据库并运行迁移
        await waitForDatabase();

        // 确保上传目录存在
        ensureUploadDir();

        // 启动应用
        startNextApp();

    } catch (error) {
        log(`Deployment failed: ${error.message}`);
        process.exit(1);
    }
}

main();
