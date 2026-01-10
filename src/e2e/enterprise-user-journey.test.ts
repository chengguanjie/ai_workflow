import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('bcryptjs', () => ({
  hash: async (value: string) => `__test_hash__:${value}`,
  compare: async (plain: string, hashed: string) => hashed === `__test_hash__:${plain}`,
}))

// ----------------------------
// Shared in-memory "database"
// ----------------------------

type OrgStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DISABLED'
type Role = 'OWNER' | 'ADMIN' | 'EDITOR' | 'MEMBER' | 'VIEWER'
type InvitationType = 'EMAIL' | 'LINK'

type Organization = {
  id: string
  name: string
  status: OrgStatus
  plan: 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
  apiQuota: number
  securitySettings: any
}

type User = {
  id: string
  email: string
  name: string | null
  avatar: string | null
  passwordHash: string
  role: Role
  isActive: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
  organizationId: string
  departmentId: string | null
  mustChangePassword: boolean
  loginAttempts: number
  lockedUntil: Date | null
}

type OrgApplication = {
  id: string
  orgName: string
  industry: string | null
  website: string | null
  phone: string | null
  address: string | null
  description: string | null
  contactName: string
  contactEmail: string
  contactPhone: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectReason: string | null
  createdAt: Date
  reviewedAt: Date | null
  reviewedById: string | null
  organizationId: string | null
}

type Department = {
  id: string
  name: string
  description: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  parentId: string | null
  organizationId: string
  level: number
  managerId: string | null
  path: string
  _count: { users: number }
}

type Invitation = {
  id: string
  email: string | null
  role: Role
  token: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
  organizationId: string
  invitedById: string | null
  maxUses: number
  type: InvitationType
  usedCount: number
  departmentId: string | null
}

function createMemoryPrisma() {
  let seq = 0
  const nextId = (prefix: string) => `${prefix}_${++seq}`

  const organizations = new Map<string, Organization>()
  const users = new Map<string, User>()
  const orgApplications = new Map<string, OrgApplication>()
  const departments = new Map<string, Department>()
  const invitations = new Map<string, Invitation>()

  const now = () => new Date()

  const getOrgById = (id: string) => organizations.get(id) || null
  const getDeptById = (id: string) => departments.get(id) || null

  const prisma = {
    orgApplication: {
      findFirst: async (args: any) => {
        const where = args?.where || {}
        for (const app of orgApplications.values()) {
          if (where.contactEmail && app.contactEmail !== where.contactEmail) continue
          if (where.status && app.status !== where.status) continue
          return app
        }
        return null
      },
      findMany: async (args: any) => {
        const where = args?.where || {}
        const orderBy = args?.orderBy
        let list = Array.from(orgApplications.values())
        if (where.contactEmail) list = list.filter(a => a.contactEmail === where.contactEmail)
        if (orderBy?.createdAt === 'desc') list = list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        if (args?.select) {
          return list.map(a => ({
            id: a.id,
            orgName: a.orgName,
            status: a.status,
            rejectReason: a.rejectReason,
            createdAt: a.createdAt,
            reviewedAt: a.reviewedAt,
          }))
        }
        return list
      },
      findUnique: async (args: any) => {
        const id = args?.where?.id
        if (!id) return null
        return orgApplications.get(id) || null
      },
      create: async (args: any) => {
        const data = args.data
        const id = nextId('app')
        const app: OrgApplication = {
          id,
          orgName: data.orgName,
          industry: data.industry ?? null,
          website: data.website ?? null,
          phone: data.phone ?? null,
          address: data.address ?? null,
          description: data.description ?? null,
          contactName: data.contactName,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone ?? null,
          status: data.status ?? 'PENDING',
          rejectReason: null,
          createdAt: now(),
          reviewedAt: null,
          reviewedById: null,
          organizationId: null,
        }
        orgApplications.set(id, app)
        return app
      },
      update: async (args: any) => {
        const id = args?.where?.id
        const existing = orgApplications.get(id)
        if (!existing) throw new Error('orgApplication not found')
        const updated = { ...existing, ...args.data }
        orgApplications.set(id, updated)
        return updated
      },
    },

    organization: {
      findUnique: async (args: any) => {
        const id = args?.where?.id
        if (!id) return null
        const org = organizations.get(id) || null
        if (!org) return null
        if (args?.include?._count) {
          const workflows = 0
          const userCount = Array.from(users.values()).filter(u => u.organizationId === id && u.isActive).length
          return { ...org, _count: { workflows, users: userCount } }
        }
        return org
      },
      create: async (args: any) => {
        const data = args.data
        const orgId = nextId('org')
        const org: Organization = {
          id: orgId,
          name: data.name,
          status: data.status ?? 'ACTIVE',
          plan: data.plan ?? 'FREE',
          apiQuota: data.apiQuota ?? 10000,
          securitySettings: data.securitySettings ?? {},
        }
        organizations.set(orgId, org)

        // Nested create: users
        if (data.users?.create) {
          const u = data.users.create
          const userId = nextId('user')
          const user: User = {
            id: userId,
            email: u.email,
            name: u.name ?? null,
            avatar: null,
            passwordHash: u.passwordHash,
            role: u.role,
            isActive: u.isActive ?? true,
            lastLoginAt: null,
            createdAt: now(),
            updatedAt: now(),
            organizationId: orgId,
            departmentId: null,
            mustChangePassword: false,
            loginAttempts: 0,
            lockedUntil: null,
          }
          users.set(userId, user)
        }

        // include: users where role OWNER
        if (args.include?.users) {
          const owner = Array.from(users.values()).find(
            u => u.organizationId === orgId && u.role === 'OWNER'
          )
          const select = args.include.users.select
          const shapedOwner = owner
            ? {
                ...(select?.id ? { id: owner.id } : {}),
                ...(select?.email ? { email: owner.email } : {}),
                ...(select?.name ? { name: owner.name } : {}),
              }
            : null
          return { ...org, users: shapedOwner ? [shapedOwner] : [] }
        }

        return org
      },
    },

    user: {
      findUnique: async (args: any) => {
        const where = args?.where || {}
        let user: User | null = null
        if (where.id) user = users.get(where.id) || null
        if (where.email) {
          const email = where.email
          user = Array.from(users.values()).find(u => u.email === email) || null
        }
        if (!user) return null
        if (args?.include?.organization) {
          const org = getOrgById(user.organizationId)
          if (!org) return null
          return { ...user, organization: org }
        }
        return user
      },
      findFirst: async (args: any) => {
        const where = args?.where || {}
        for (const user of users.values()) {
          if (where.id && user.id !== where.id) continue
          if (where.email && user.email !== where.email) continue
          if (where.organizationId && user.organizationId !== where.organizationId) continue
          if (where.isActive !== undefined && user.isActive !== where.isActive) continue
          return user
        }
        return null
      },
      findMany: async (args: any) => {
        const where = args?.where || {}
        let list = Array.from(users.values())

        if (where.id?.in) {
          const set = new Set(where.id.in as string[])
          list = list.filter(u => set.has(u.id))
        }
        if (where.organizationId) list = list.filter(u => u.organizationId === where.organizationId)
        if (where.managerId) {
          // This is for department.findMany, not user.findMany; kept for safety.
          list = list
        }
        if (args?.select) {
          return list.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
          }))
        }
        return list
      },
      create: async (args: any) => {
        const data = args.data
        const id = nextId('user')
        const user: User = {
          id,
          email: data.email,
          name: data.name ?? null,
          avatar: null,
          passwordHash: data.passwordHash,
          role: data.role ?? 'MEMBER',
          isActive: data.isActive ?? true,
          lastLoginAt: null,
          createdAt: now(),
          updatedAt: now(),
          organizationId: data.organizationId,
          departmentId: data.departmentId ?? null,
          mustChangePassword: data.mustChangePassword ?? false,
          loginAttempts: 0,
          lockedUntil: null,
        }
        users.set(id, user)
        if (args?.select) {
          const dept = user.departmentId ? getDeptById(user.departmentId) : null
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            departmentId: user.departmentId,
            department: dept ? { id: dept.id, name: dept.name } : null,
          }
        }
        return user
      },
      update: async (args: any) => {
        const where = args?.where || {}
        const id = where.id
        const existing = users.get(id)
        if (!existing) throw new Error('user not found')
        const data = args?.data || {}
        const updated: User = {
          ...existing,
          ...data,
          updatedAt: now(),
        }
        users.set(id, updated)
        return updated
      },
    },

    department: {
      findFirst: async (args: any) => {
        const where = args?.where || {}
        for (const dept of departments.values()) {
          if (where.id && dept.id !== where.id) continue
          if (where.organizationId && dept.organizationId !== where.organizationId) continue
          if (where.managerId && dept.managerId !== where.managerId) continue
          return args?.select ? { level: dept.level } : dept
        }
        return null
      },
      findUnique: async (args: any) => {
        const id = args?.where?.id
        if (!id) return null
        const dept = departments.get(id) || null
        if (!dept) return null
        if (args?.select) {
          return { name: dept.name }
        }
        return dept
      },
      findMany: async (args: any) => {
        const where = args?.where || {}
        let list = Array.from(departments.values())
        if (where.organizationId) list = list.filter(d => d.organizationId === where.organizationId)
        if (where.managerId) list = list.filter(d => d.managerId === where.managerId)
        if (args?.select) {
          return list.map(d => ({ id: d.id }))
        }
        return list
      },
      create: async (args: any) => {
        const data = args.data
        const id = nextId('dept')
        const dept: Department = {
          id,
          name: data.name,
          description: data.description ?? null,
          sortOrder: data.sortOrder ?? 0,
          createdAt: now(),
          updatedAt: now(),
          parentId: data.parentId ?? null,
          organizationId: data.organizationId,
          level: data.level ?? 0,
          managerId: data.managerId ?? null,
          path: '',
          _count: { users: 0 },
        }
        departments.set(id, dept)
        return dept
      },
    },

    invitation: {
      findFirst: async (args: any) => {
        const where = args?.where || {}
        for (const inv of invitations.values()) {
          if (where.email && inv.email !== where.email) continue
          if (where.organizationId && inv.organizationId !== where.organizationId) continue
          if (where.acceptedAt === null && inv.acceptedAt !== null) continue
          if (where.expiresAt?.gt && !(inv.expiresAt > where.expiresAt.gt)) continue
          return inv
        }
        return null
      },
      findUnique: async (args: any) => {
        const where = args?.where || {}
        let inv: Invitation | null = null
        if (where.id) inv = invitations.get(where.id) || null
        if (where.token) {
          inv = Array.from(invitations.values()).find(i => i.token === where.token) || null
        }
        if (!inv) return null
        if (args?.include?.organization || args?.include?.department) {
          const org = getOrgById(inv.organizationId)
          const dept = inv.departmentId ? getDeptById(inv.departmentId) : null
          return {
            ...inv,
            ...(args.include.organization ? { organization: org } : {}),
            ...(args.include.department ? { department: dept } : {}),
          }
        }
        return inv
      },
      findMany: async (args: any) => {
        const where = args?.where || {}
        let list = Array.from(invitations.values())
        if (where.organizationId) list = list.filter(i => i.organizationId === where.organizationId)
        if (where.acceptedAt === null) list = list.filter(i => i.acceptedAt === null)
        if (args?.select) {
          return list.map(i => ({
            id: i.id,
            email: i.email,
            role: i.role,
            type: i.type,
            token: i.token,
            expiresAt: i.expiresAt,
            maxUses: i.maxUses,
            usedCount: i.usedCount,
            createdAt: i.createdAt,
            invitedById: i.invitedById,
          }))
        }
        return list
      },
      create: async (args: any) => {
        const data = args.data
        const id = nextId('inv')
        const inv: Invitation = {
          id,
          email: data.email ?? null,
          role: data.role ?? 'MEMBER',
          token: data.token,
          expiresAt: data.expiresAt,
          acceptedAt: null,
          createdAt: now(),
          organizationId: data.organizationId,
          invitedById: data.invitedById ?? null,
          maxUses: data.maxUses ?? 1,
          type: data.type ?? 'EMAIL',
          usedCount: 0,
          departmentId: data.departmentId ?? null,
        }
        invitations.set(id, inv)
        return inv
      },
      update: async (args: any) => {
        const id = args?.where?.id
        const existing = invitations.get(id)
        if (!existing) throw new Error('invitation not found')
        const data = args?.data || {}
        const updated: Invitation = {
          ...existing,
          ...data,
          usedCount:
            data.usedCount?.increment !== undefined
              ? existing.usedCount + data.usedCount.increment
              : (data.usedCount ?? existing.usedCount),
        }
        invitations.set(id, updated)
        return updated
      },
    },

    auditLog: {
      create: async () => ({ id: nextId('audit') }),
    },
    platformAuditLog: {
      create: async () => ({ id: nextId('paudit') }),
    },
  }

  return {
    prisma,
    reset() {
      organizations.clear()
      users.clear()
      orgApplications.clear()
      departments.clear()
      invitations.clear()
      seq = 0
    },
  }
}

const memory = vi.hoisted(() => createMemoryPrisma())

// ----------------------------
// Module mocks (auth/db/etc.)
// ----------------------------

const sessions = vi.hoisted(() => ({
  app: null as any,
  console: null as any,
}))

vi.mock('@/lib/db', () => ({ prisma: memory.prisma }))
vi.mock('@/lib/auth', () => ({ auth: () => sessions.app }))
vi.mock('@/lib/console-auth', () => ({ consoleAuth: () => sessions.console }))

vi.mock('@/lib/permissions/department', () => ({
  updateDepartmentPath: async () => {},
}))
vi.mock('@/lib/permissions/department-visibility', () => ({
  filterVisibleDepartments: async (_userId: string, _orgId: string, departments: any[]) => departments,
}))
vi.mock('@/lib/audit', () => ({
  logDepartmentChange: async () => {},
}))

// Import after mocks
import { POST as submitApplication, GET as queryApplications } from '@/app/api/applications/route'
import { PUT as approveApplication } from '@/app/api/console/applications/[id]/route'
import { POST as createDepartment } from '@/app/api/settings/departments/route'
import { POST as createInvitation } from '@/app/api/settings/invitations/route'
import { POST as acceptInvitation } from '@/app/api/invite/accept/route'
import { authorizeCredentials } from '@/lib/auth/credentials-authorize'

function req(method: string, url: string, body?: object) {
  const init: { method: string; body?: string; headers?: Record<string, string> } = { method }
  if (body) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  return new NextRequest(url, init)
}

describe('Enterprise user journey: apply -> console approve -> org setup -> employee join -> login', () => {
  beforeEach(() => {
    memory.reset()
    sessions.app = null
    sessions.console = null
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  it('runs the full happy-path flow end-to-end', async () => {
    // 1) 企业用户提交入驻申请（无需登录）
    const applicantEmail = 'owner@example.com'
    const orgName = 'Acme Corp'

    const submitRes = await submitApplication(
      req('POST', 'http://localhost:3000/api/applications', {
        orgName,
        contactName: 'Owner',
        contactEmail: applicantEmail,
      })
    )
    expect(submitRes.status).toBe(201)
    const submitJson = await submitRes.json()
    expect(submitJson.success).toBe(true)
    const applicationId = submitJson.data.id as string
    expect(applicationId).toMatch(/^app_/)

    // 申请状态查询
    const queryRes = await queryApplications(
      req('GET', `http://localhost:3000/api/applications?email=${encodeURIComponent(applicantEmail)}`)
    )
    expect(queryRes.status).toBe(200)
    const queryJson = await queryRes.json()
    expect(queryJson.success).toBe(true)
    expect(queryJson.data[0]?.status).toBe('PENDING')

    // 2) 平台后台管理员审批通过（Console）
    sessions.console = {
      user: { id: 'platform_admin_1', role: 'SUPER_ADMIN' },
    }

    const approveRes = await approveApplication(
      req('PUT', `http://localhost:3000/api/console/applications/${applicationId}`, {
        action: 'approve',
        plan: 'FREE',
        apiQuota: 10000,
      }),
      { params: Promise.resolve({ id: applicationId }) }
    )
    expect(approveRes.status).toBe(200)
    const approveJson = await approveRes.json()
    expect(approveJson.success).toBe(true)
    expect(approveJson.data.status).toBe('APPROVED')
    const owner = approveJson.data.owner as { id: string; email: string; tempPassword: string }
    expect(owner.email).toBe(applicantEmail)
    expect(owner.tempPassword).toBeTruthy()

    // 3) 企业管理员（Owner）首次登录（Credentials authorize 逻辑）
    const ownerSessionUser = await authorizeCredentials({
      email: owner.email,
      password: owner.tempPassword,
    })
    expect(ownerSessionUser).not.toBeNull()
    expect(ownerSessionUser!.organizationName).toBe(orgName)
    expect(ownerSessionUser!.role).toBe('OWNER')

    // 4) 企业管理员设置组织架构（创建部门）
    sessions.app = { user: ownerSessionUser }

    const deptRes = await createDepartment(
      new Request('http://localhost:3000/api/settings/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '研发部', sortOrder: 1 }),
      })
    )
    expect(deptRes.status).toBe(201)
    const deptJson = await deptRes.json()
    expect(deptJson.success).toBe(true)
    const deptId = deptJson.data.department.id as string
    expect(deptId).toMatch(/^dept_/)

    // 5) 企业管理员邀请员工加入部门
    const inviteRes = await createInvitation(
      req('POST', 'http://localhost:3000/api/settings/invitations', {
        type: 'EMAIL',
        email: 'employee1@example.com',
        role: 'MEMBER',
        departmentId: deptId,
      })
    )
    expect(inviteRes.status).toBe(200)
    const inviteJson = await inviteRes.json()
    expect(inviteJson.success).toBe(true)
    const inviteUrl = inviteJson.data.invitation.inviteUrl as string
    const token = inviteUrl.split('/invite/')[1]
    expect(token).toBeTruthy()

    // 6) 员工接受邀请并设置密码
    const employeeEmail = 'employee1@example.com'
    const employeePassword = 'Employee@123456'
    const acceptRes = await acceptInvitation(
      req('POST', 'http://localhost:3000/api/invite/accept', {
        token,
        email: employeeEmail,
        password: employeePassword,
        name: 'Employee One',
      })
    )
    expect(acceptRes.status).toBe(201)
    const acceptJson = await acceptRes.json()
    expect(acceptJson.success).toBe(true)
    expect(acceptJson.data.user.email).toBe(employeeEmail)
    expect(acceptJson.data.user.departmentId).toBe(deptId)
    expect(acceptJson.data.user.organizationName).toBe(orgName)

    // 7) 员工登录（Credentials authorize 逻辑）
    const employeeSessionUser = await authorizeCredentials({
      email: employeeEmail,
      password: employeePassword,
    })
    expect(employeeSessionUser).not.toBeNull()
    expect(employeeSessionUser!.organizationName).toBe(orgName)
    expect(employeeSessionUser!.departmentId).toBe(deptId)
  }, 30_000)
})
