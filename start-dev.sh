#!/bin/bash

# 清除代理设置以避免干扰本地开发
unset http_proxy
unset https_proxy
unset HTTP_PROXY
unset HTTPS_PROXY

# 启动开发服务器
pnpm dev
