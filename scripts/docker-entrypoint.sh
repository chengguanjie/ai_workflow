#!/bin/bash
set -e

echo "==================================="
echo "AI Workflow - Starting Application"
echo "==================================="

# 等待数据库就绪
echo "Waiting for database to be ready..."
sleep 5

# 运行数据库迁移
echo "Running database migrations..."
npx prisma db push --skip-generate || {
    echo "Warning: Database migration failed, retrying in 5 seconds..."
    sleep 5
    npx prisma db push --skip-generate
}

echo "Database ready!"

# 创建上传目录（如果不存在）
mkdir -p /app/uploads

# 启动应用
echo "Starting Next.js server..."
exec node server.js
