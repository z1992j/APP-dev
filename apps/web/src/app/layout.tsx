import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '@/lib/providers';
import { ToastViewport } from '@/components/ui/toast';

export const metadata: Metadata = {
  title: 'RedMatrix · 小红书矩阵协作工作台',
  description: '面向博主与轻量 MCN 的 AI 协作 + 半自动发布工具',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
        <ToastViewport />
      </body>
    </html>
  );
}
