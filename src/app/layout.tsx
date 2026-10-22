import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { Logo } from "@/components/logo";
import { SideNav, TopNav } from "@/components/nav";
import { ThemeToggle, THEME_SCRIPT } from "@/components/theme-toggle";
import { getConfig } from "@/lib/config";
import { AUTHOR, IS_STATIC } from "@/lib/mode";
import "./globals.css";

const instrument = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "AI Radar: el mejor open source para crear con IA", template: "%s · AI Radar" },
  description:
    "AI Radar ayuda a creadores digitales a encontrar los repositorios, herramientas y lanzamientos open source más fiables para construir mejores soluciones con IA.",
  authors: [{ name: AUTHOR.handle, url: AUTHOR.profile }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1520" },
  ],
};

function Credits({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`text-xs leading-relaxed text-ink-3 ${compact ? "" : "max-w-xl"}`}>
      Creado por{" "}
      <a href={AUTHOR.profile} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-2 underline decoration-line underline-offset-2 hover:text-ink">
        @{AUTHOR.handle}
      </a>
      . Código abierto en{" "}
      <a href={AUTHOR.repo} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-2 underline decoration-line underline-offset-2 hover:text-ink">
        github.com/{AUTHOR.handle}/airadar
      </a>
      .
    </p>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = getConfig();
  const planned = [
    ...(config.X_BEARER_TOKEN ? [] : ["/x"]),
    ...(config.REDDIT_CLIENT_ID ? [] : ["/reddit"]),
    ...(config.YOUTUBE_API_KEY ? [] : ["/youtube"]),
  ];
  const showAdmin = !IS_STATIC;
  return (
    <html lang="es" className={instrument.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Saltar al contenido
        </a>
        {config.DEMO_MODE && (
          <div className="bg-warn px-4 py-1.5 text-center text-sm font-medium text-white">
            Modo demostración: los datos mostrados son de prueba y no reflejan señales reales.
          </div>
        )}
        <div className="mx-auto flex max-w-[1440px]">
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-8 overflow-y-auto border-r border-line px-4 py-6 lg:flex">
            <Logo />
            <SideNav planned={planned} showAdmin={showAdmin} />
            <div className="mt-auto space-y-4">
              <ThemeToggle />
              <Credits compact />
            </div>
          </aside>
          <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 border-b border-line bg-bg/95 px-4 pb-2 pt-3 backdrop-blur supports-[backdrop-filter]:bg-bg/85 lg:hidden">
              <div className="mb-2 flex items-center justify-between gap-3">
                <Logo />
                <ThemeToggle />
              </div>
              <TopNav showAdmin={showAdmin} />
            </header>
            <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
              {children}
            </main>
            <footer className="border-t border-line px-4 py-6 sm:px-6 lg:hidden">
              <Credits />
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
