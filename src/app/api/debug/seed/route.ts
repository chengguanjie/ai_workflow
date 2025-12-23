import { NextResponse } from 'next/server';
import { seedOfficialTemplates } from '@/lib/templates/official-templates';
import { ApiResponse } from '@/lib/api/api-response';

export async function GET() {
  try {
    await seedOfficialTemplates();
    return ApiResponse.success({ message: '官方模板库已成功重构并同步！' });
  } catch (error) {
    console.error('同步失败:', error);
    return ApiResponse.error('同步失败: ' + String(error), 500);
  }
}
