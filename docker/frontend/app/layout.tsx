import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import Sidebar from "@/components/Sidebar";
import TopNav from "@/components/TopNav";
import { Toaster } from "react-hot-toast";
import { NavProvider } from "@/context/NavContext";

export const metadata: Metadata = {
  title: "NexusOps - Docker Infrastructure",
  description: "Docker infrastructure management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex bg-[#0B1120] text-gray-200 overflow-hidden">
        <NavProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 h-screen">
            <TopNav />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
              <div className="max-w-screen-2xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </NavProvider>
        <Toaster 
          position="bottom-right" 
          toastOptions={{
            style: {
              background: '#1E293B',
              color: '#fff',
              border: '1px solid #374151',
              borderRadius: '12px'
            },
            success: {
              iconTheme: { primary: '#10B981', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: '#fff' },
            },
          }} 
        />
      </body>
    </html>
  );
}
