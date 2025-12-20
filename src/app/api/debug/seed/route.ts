
import { NextResponse } from 'next/server';
import { seedOfficialTemplates } from '@/lib/templates/official-templates';

export async function GET() {
  try {
    await seedOfficialTemplates();
    return NextResponse.json({ success: true, message: '官方模板库已成功重构并同步！' });
  } catch (error) {
    console.error('同步失败:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
