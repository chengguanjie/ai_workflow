import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/api/api-response";
import {
  SHENSUAN_MODELS,
  SHENSUAN_DEFAULT_MODELS,
  type ModelModality,
} from "@/lib/ai/types";
import {
  getCachedProviders,
  setCachedProviders,
} from "@/lib/ai/provider-cache";


// ============================================
// API 路由处理
// ============================================

// GET: 获取当前企业可用的 AI 服务商配置列表（供节点选择）
// 支持 ?modality=text|image-gen|video-gen|... 参数过滤模型
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[AI Providers][${requestId}] 开始处理请求`);

  try {
    // 1. 认证
    const authStartTime = Date.now();
    const session = await auth();
    const authDuration = Date.now() - authStartTime;
    console.log(`[AI Providers][${requestId}] 认证耗时: ${authDuration}ms`);

    if (!session?.user?.organizationId) {
      console.error(`[AI Providers][${requestId}] 未授权访问，session:`, {
        hasSession: !!session,
        hasUser: !!session?.user,
        organizationId: session?.user?.organizationId,
      });
      return ApiResponse.error("未授权", 401);
    }

    const organizationId = session.user.organizationId;

    // 2. 获取模态过滤参数
    const { searchParams } = new URL(request.url);
    const modality = searchParams.get("modality") as ModelModality | null;
    console.log(
      `[AI Providers][${requestId}] 组织ID: ${organizationId}, 模态: ${modality || "all"}`,
    );

    // 3. 检查缓存
    const cachedData = getCachedProviders(organizationId, modality);
    if (cachedData) {
      const totalDuration = Date.now() - startTime;
      console.log(
        `[AI Providers][${requestId}] 命中缓存，总耗时: ${totalDuration}ms`,
      );
      return ApiResponse.success({
        ...(cachedData as object),
        _debug: {
          ...(cachedData as { _debug?: object })._debug,
          fromCache: true,
          totalDuration,
        },
      });
    }

    // 4. 数据库查询
    const dbStartTime = Date.now();
    const configs = await prisma.apiKey.findMany({
      where: {
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        provider: true,
        baseUrl: true,
        defaultModel: true,
        defaultModels: true,
        models: true,
        isDefault: true,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    const dbDuration = Date.now() - dbStartTime;
    console.log(
      `[AI Providers][${requestId}] 数据库查询耗时: ${dbDuration}ms, 配置数量: ${configs.length}`,
    );

    // 5. 处理数据
    const processStartTime = Date.now();
    const providers = configs.map((config) => {
      let models = (config.models as string[]) || [];
      let defaultModel = config.defaultModel;
      const configDefaultModels =
        (config.defaultModels as Record<string, string>) || {};

      // 如果是胜算云，根据模态过滤模型列表
      if (config.provider === "SHENSUAN" && modality) {
        const modalityModels = SHENSUAN_MODELS[modality] || [];
        models = modalityModels as unknown as string[];
        // 优先使用用户配置的模态默认模型，其次使用系统默认
        defaultModel =
          configDefaultModels[modality] ||
          SHENSUAN_DEFAULT_MODELS[modality] ||
          modalityModels[0] ||
          "";
      } else if (config.provider === "SHENSUAN" && !modality) {
        // 没有指定模态时，返回文本模型作为默认
        models = SHENSUAN_MODELS.text as unknown as string[];
        defaultModel = configDefaultModels.text || SHENSUAN_DEFAULT_MODELS.text;
      } else if (modality && configDefaultModels[modality]) {
        // 其他服务商，如果有配置的模态默认模型，使用它
        defaultModel = configDefaultModels[modality];
      }

      return {
        id: config.id,
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        defaultModel,
        models,
        isDefault: config.isDefault,
        // 显示名称：配置名称 (服务商)
        displayName: `${config.name} (${getProviderDisplayName(config.provider)})`,
      };
    });
    const processDuration = Date.now() - processStartTime;

    // 6. 构建响应数据
    const responseData = {
      providers,
      defaultProvider:
        providers.find((p) => p.isDefault) || providers[0] || null,
      _debug: {
        organizationId,
        configCount: configs.length,
        providerCount: providers.length,
        fromCache: false,
        timing: {
          auth: authDuration,
          db: dbDuration,
          process: processDuration,
        },
      },
    };

    // 7. 存入缓存
    setCachedProviders(organizationId, modality, responseData);

    const totalDuration = Date.now() - startTime;
    console.log(
      `[AI Providers][${requestId}] 请求完成，总耗时: ${totalDuration}ms (认证: ${authDuration}ms, 数据库: ${dbDuration}ms, 处理: ${processDuration}ms)`,
    );

    return ApiResponse.success({
      ...responseData,
      _debug: {
        ...responseData._debug,
        totalDuration,
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(
      `[AI Providers][${requestId}] 请求失败，耗时: ${totalDuration}ms, 错误:`,
      error,
    );

    // 提供更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : "未知错误";
    const errorStack = error instanceof Error ? error.stack : undefined;

    // 检查是否是数据库连接错误
    if (
      errorMessage.includes("Connection") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("ECONNREFUSED")
    ) {
      console.error(`[AI Providers][${requestId}] 数据库连接错误:`, {
        message: errorMessage,
        stack: errorStack,
      });
      return ApiResponse.error("数据库连接失败，请稍后重试", 503);
    }

    return ApiResponse.error("获取服务商列表失败", 500);
  }
}

function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    OPENROUTER: "OpenRouter",
    SHENSUAN: "胜算云",
    OPENAI: "OpenAI兼容",
    ANTHROPIC: "Anthropic",
  };
  return names[provider] || provider;
}
