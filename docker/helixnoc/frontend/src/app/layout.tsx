import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Helix NOC | GPON Management",
  description: "Plataforma centralizada para administracion de OLTs GPON",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.className} antialiased min-h-screen flex flex-col`}>
        {children}
      </body>
    </html>
  );
}
