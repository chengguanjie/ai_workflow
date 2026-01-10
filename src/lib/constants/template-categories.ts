/**
 * 模板分类常量定义
 * 包含两个维度：部门分类和技能分类
 */

import {
  TrendingUp,
  Megaphone,
  Users,
  Calculator,
  Activity,
  Lightbulb,
  Building,
  Scale,
  Brain,
  BarChart,
  FileText,
  PenTool,
  Image,
  Globe,
  Zap,
  MessageCircle,
  MoreHorizontal,
  Briefcase,
  Code,
  Factory,
  ClipboardList,
  Share2,
  ShoppingCart,
  Headphones,
  Settings,
  Truck,
  Wrench,
  GraduationCap
} from 'lucide-react'

// 分类类型
export type CategoryType = 'department' | 'skill'

// 单个分类定义
export interface Category {
  id: string
  name: string
  icon: React.ElementType
  type: CategoryType
  description?: string
}

// 分类组定义
export interface CategoryGroup {
  id: string
  name: string
  icon: React.ElementType
  type: CategoryType
  categories: Category[]
}

// 技能类分类
export const SKILL_CATEGORIES: Category[] = [
  {
    id: 'ai-processing',
    name: 'AI处理',
    icon: Brain,
    type: 'skill',
    description: '人工智能相关处理，包括机器学习、自然语言处理等'
  },
  {
    id: 'data-analysis',
    name: '数据分析',
    icon: BarChart,
    type: 'skill',
    description: '数据处理、统计分析、报表生成等'
  },
  {
    id: 'document-generation',
    name: '文档生成',
    icon: FileText,
    type: 'skill',
    description: '文档创建、报告生成、文书处理等'
  },
  {
    id: 'content-creation',
    name: '内容创作',
    icon: PenTool,
    type: 'skill',
    description: '文案创作、营销内容、创意写作等'
  },
  {
    id: 'image-processing',
    name: '图像处理',
    icon: Image,
    type: 'skill',
    description: '图片编辑、图像识别、视觉处理等'
  },
  {
    id: 'translation',
    name: '翻译',
    icon: Globe,
    type: 'skill',
    description: '多语言翻译、本地化处理等'
  },
  {
    id: 'automation',
    name: '自动化',
    icon: Zap,
    type: 'skill',
    description: '流程自动化、任务自动执行等'
  },
  {
    id: 'qa',
    name: '问答',
    icon: MessageCircle,
    type: 'skill',
    description: '智能问答、客服机器人等'
  }
]

// 部门类分类
export const DEPARTMENT_CATEGORIES: Category[] = [
  {
    id: 'sales',
    name: '销售',
    icon: TrendingUp,
    type: 'department',
    description: '销售团队相关工作流'
  },
  {
    id: 'sales-support',
    name: '销售内勤',
    icon: Headphones,
    type: 'department',
    description: '销售内勤支持相关工作流'
  },
  {
    id: 'marketing',
    name: '市场',
    icon: Megaphone,
    type: 'department',
    description: '市场营销相关工作流'
  },
  {
    id: 'new-media',
    name: '新媒体',
    icon: Share2,
    type: 'department',
    description: '新媒体运营相关工作流'
  },
  {
    id: 'hr',
    name: '人力资源',
    icon: Users,
    type: 'department',
    description: '人力资源管理相关工作流'
  },
  {
    id: 'finance',
    name: '财务',
    icon: Calculator,
    type: 'department',
    description: '财务管理相关工作流'
  },
  {
    id: 'operation',
    name: '运营',
    icon: Activity,
    type: 'department',
    description: '运营管理相关工作流'
  },
  {
    id: 'product',
    name: '产品',
    icon: Lightbulb,
    type: 'department',
    description: '产品管理相关工作流'
  },
  {
    id: 'production',
    name: '生产',
    icon: Factory,
    type: 'department',
    description: '生产制造相关工作流'
  },
  {
    id: 'project',
    name: '项目管理',
    icon: ClipboardList,
    type: 'department',
    description: '项目管理相关工作流'
  },
  {
    id: 'procurement',
    name: '采购',
    icon: ShoppingCart,
    type: 'department',
    description: '采购管理相关工作流'
  },
  {
    id: 'logistics',
    name: '物流仓储',
    icon: Truck,
    type: 'department',
    description: '物流仓储相关工作流'
  },
  {
    id: 'tech',
    name: '技术研发',
    icon: Wrench,
    type: 'department',
    description: '技术研发相关工作流'
  },
  {
    id: 'quality',
    name: '质量管理',
    icon: Settings,
    type: 'department',
    description: '质量管理相关工作流'
  },
  {
    id: 'customer-service',
    name: '客服',
    icon: MessageCircle,
    type: 'department',
    description: '客户服务相关工作流'
  },
  {
    id: 'admin',
    name: '行政',
    icon: Building,
    type: 'department',
    description: '行政管理相关工作流'
  },
  {
    id: 'legal',
    name: '法务',
    icon: Scale,
    type: 'department',
    description: '法务合规相关工作流'
  },
  {
    id: 'training',
    name: '培训',
    icon: GraduationCap,
    type: 'department',
    description: '培训发展相关工作流'
  },
  {
    id: 'other',
    name: '其他',
    icon: MoreHorizontal,
    type: 'department',
    description: '其他类型工作流'
  }
]

// 分类组
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    id: 'skill-group',
    name: '按技能',
    icon: Code,
    type: 'skill',
    categories: SKILL_CATEGORIES
  },
  {
    id: 'department-group',
    name: '按部门',
    icon: Briefcase,
    type: 'department',
    categories: DEPARTMENT_CATEGORIES
  }
]

// 所有分类的平面列表（保持向后兼容）
export const ALL_CATEGORIES: Category[] = [
  ...SKILL_CATEGORIES,
  ...DEPARTMENT_CATEGORIES
]

// 原始的平面分类列表（用于向后兼容）
export const TEMPLATE_CATEGORIES = ALL_CATEGORIES.map(cat => ({
  id: cat.id,
  name: cat.name
}))

// 分类图标映射（用于向后兼容）
export const CATEGORY_ICONS: Record<string, React.ElementType> = ALL_CATEGORIES.reduce(
  (acc, cat) => ({
    ...acc,
    [cat.id]: cat.icon
  }),
  {}
)

// 获取分类信息的辅助函数
export const getCategoryById = (categoryId: string): Category | undefined => {
  return ALL_CATEGORIES.find(cat => cat.id === categoryId)
}

export const getCategoryName = (categoryId: string): string => {
  const category = getCategoryById(categoryId)
  return category?.name || categoryId
}

export const getCategoryIcon = (categoryId: string): React.ElementType => {
  const category = getCategoryById(categoryId)
  return category?.icon || MoreHorizontal
}

export const getCategoryType = (categoryId: string): CategoryType | undefined => {
  const category = getCategoryById(categoryId)
  return category?.type
}
