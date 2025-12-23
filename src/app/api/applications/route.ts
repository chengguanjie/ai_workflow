import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { ApiResponse } from '@/lib/api/api-response'

// POST - 提交企业入驻申请（无需登录）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      orgName,
      industry,
      website,
      phone,
      address,
      description,
      contactName,
      contactEmail,
      contactPhone,
    } = body

    // 验证必填字段
    if (!orgName || !contactName || !contactEmail) {
      return ApiResponse.error('企业名称、联系人姓名和邮箱为必填项', 400)
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(contactEmail)) {
      return ApiResponse.error('邮箱格式不正确', 400)
    }

    // 检查该邮箱是否已有待审批的申请
    const existingApplication = await prisma.orgApplication.findFirst({
      where: {
        contactEmail,
        status: 'PENDING',
      },
    })

    if (existingApplication) {
      return ApiResponse.error('您已提交过申请，请等待审批结果', 400)
    }

    // 检查该邮箱是否已注册
    const existingUser = await prisma.user.findUnique({
      where: { email: contactEmail },
    })

    if (existingUser) {
      return ApiResponse.error('该邮箱已注册，请直接登录', 400)
    }

    // 创建申请
    const application = await prisma.orgApplication.create({
      data: {
        orgName,
        industry,
        website,
        phone,
        address,
        description,
        contactName,
        contactEmail,
        contactPhone,
        status: 'PENDING',
      },
    })

    return ApiResponse.created({
      id: application.id,
      message: '申请已提交，请等待审批',
    })
  } catch (error) {
    console.error('提交申请失败:', error)
    return ApiResponse.error('提交申请失败', 500)
  }
}

// GET - 查询申请状态（通过邮箱）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return ApiResponse.error('请提供邮箱', 400)
  }

  const applications = await prisma.orgApplication.findMany({
    where: { contactEmail: email },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orgName: true,
      status: true,
      rejectReason: true,
      createdAt: true,
      reviewedAt: true,
    },
  })

  return ApiResponse.success(applications)
}
