import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { ApiResponse } from "@/lib/api/api-response";

const updateProfileSchema = z.object({
  name: z.string().min(2, "姓名至少需要2个字符").optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return ApiResponse.error("请先登录", 401);
    }

    const body = await request.json();
    const validatedData = updateProfileSchema.parse(body);

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: validatedData.name,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return ApiResponse.success({
      message: "个人信息已更新",
      user: updatedUser,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError<unknown>;
      const firstError = zodError.issues[0];
      return ApiResponse.error(firstError?.message || "验证失败", 400);
    }

    console.error("更新个人信息失败:", error);
    return ApiResponse.error("更新失败，请稍后重试");
  }
}

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return ApiResponse.error("请先登录", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return ApiResponse.error("用户不存在", 404);
    }

    return ApiResponse.success({ user });
  } catch (error) {
    console.error("获取个人信息失败:", error);
    return ApiResponse.error("获取失败，请稍后重试");
  }
}
