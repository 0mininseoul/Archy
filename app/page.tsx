"use client";

import { GoogleLoginButton } from "@/components/google-login-button";
import { useI18n } from "@/lib/i18n";

export default function Home() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Navbar - 모바일 최적화 */}
      <nav className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center text-white font-bold text-sm">
              F
            </div>
            <span className="text-lg sm:text-xl font-bold text-slate-900">Flownote</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* 모바일에서는 네비게이션 링크 숨김 */}
            <a href="#features" className="hidden sm:block text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              {t.landing.nav.features}
            </a>
            <a href="#how-it-works" className="hidden sm:block text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              {t.landing.nav.howItWorks}
            </a>
            <GoogleLoginButton variant="nav" />
          </div>
        </div>
      </nav>

      {/* Hero Section - 모바일 최적화 */}
      <section className="pt-12 sm:pt-20 pb-16 sm:pb-24 overflow-hidden px-4">
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-slate-100 text-slate-700 text-xs sm:text-sm font-medium animate-fade-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              {t.landing.hero.badge}
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold tracking-tight text-slate-900 leading-[1.15] animate-slide-up">
              {t.landing.hero.title} <br />
              <span className="text-transparent bg-clip-text bg-gradient-primary">{t.landing.hero.titleHighlight}</span>
            </h1>

            <p className="text-base sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed animate-slide-up" style={{ animationDelay: "0.1s" }}>
              {t.landing.hero.description}
            </p>

            <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:pt-4 animate-slide-up" style={{ animationDelay: "0.2s" }}>
              <GoogleLoginButton variant="cta" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section - 모바일 최적화 */}
      <section id="features" className="py-16 sm:py-24 bg-slate-50 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3 sm:mb-4">
              {t.landing.features.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              {t.landing.features.description}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
            {[
              {
                icon: "🎙️",
                title: t.landing.features.recording.title,
                description: t.landing.features.recording.description,
                color: "bg-slate-100 text-slate-700"
              },
              {
                icon: "⚡",
                title: t.landing.features.transcription.title,
                description: t.landing.features.transcription.description,
                color: "bg-blue-50 text-blue-600"
              },
              {
                icon: "✨",
                title: t.landing.features.summarization.title,
                description: t.landing.features.summarization.description,
                color: "bg-slate-800 text-white"
              },
            ].map((feature, idx) => (
              <div key={idx} className="card p-5 sm:p-8 hover:-translate-y-1 transition-transform duration-300">
                <div className={`w-10 sm:w-12 h-10 sm:h-12 rounded-xl ${feature.color} flex items-center justify-center text-xl sm:text-2xl mb-4 sm:mb-6`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-2 sm:mb-3">
                  {feature.title}
                </h3>
                <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section - 모바일 최적화 */}
      <section id="how-it-works" className="py-16 sm:py-24 bg-white px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3 sm:mb-4">
              {t.landing.howItWorks.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              {t.landing.howItWorks.description}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8">
            {[
              {
                step: "01",
                title: t.landing.howItWorks.steps.record.title,
                description: t.landing.howItWorks.steps.record.description,
                icon: "🎤"
              },
              {
                step: "02",
                title: t.landing.howItWorks.steps.transcribe.title,
                description: t.landing.howItWorks.steps.transcribe.description,
                icon: "📝"
              },
              {
                step: "03",
                title: t.landing.howItWorks.steps.organize.title,
                description: t.landing.howItWorks.steps.organize.description,
                icon: "✨"
              },
              {
                step: "04",
                title: t.landing.howItWorks.steps.share.title,
                description: t.landing.howItWorks.steps.share.description,
                icon: "🚀"
              },
            ].map((item, idx) => (
              <div key={idx} className="text-center group">
                <div className="relative mb-4 sm:mb-6">
                  <div className="w-12 sm:w-16 h-12 sm:h-16 mx-auto rounded-xl sm:rounded-2xl bg-gradient-primary flex items-center justify-center text-2xl sm:text-3xl shadow-lg shadow-slate-900/20 group-hover:scale-110 transition-transform duration-300">
                    {item.icon}
                  </div>
                  <span className="absolute -top-1 sm:-top-2 -right-1 sm:-right-2 w-6 sm:w-8 h-6 sm:h-8 rounded-full bg-blue-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-sm sm:text-lg font-bold text-slate-900 mb-1 sm:mb-2">
                  {item.title}
                </h3>
                <p className="text-slate-600 text-xs sm:text-sm">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations Section - 모바일 최적화 */}
      <section className="py-16 sm:py-24 bg-slate-50 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3 sm:mb-4">
              {t.landing.integrations.title}
            </h2>
            <p className="text-base sm:text-lg text-slate-600">
              {t.landing.integrations.description}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:justify-center sm:gap-8">
            {[
              { name: "Notion", icon: "📓", description: t.landing.integrations.notion },
              { name: "Slack", icon: "💬", description: t.landing.integrations.slack },
              { name: "Google", icon: "🔐", description: t.landing.integrations.google },
            ].map((integration, idx) => (
              <div key={idx} className="card p-4 sm:p-8 text-center sm:min-w-[200px] hover:-translate-y-1 transition-transform duration-300">
                <div className="text-2xl sm:text-4xl mb-2 sm:mb-4">{integration.icon}</div>
                <h3 className="text-sm sm:text-lg font-bold text-slate-900 mb-0.5 sm:mb-1">{integration.name}</h3>
                <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">{integration.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - 모바일 최적화 */}
      <section className="py-16 sm:py-24 bg-gradient-primary px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4 sm:mb-6">
            {t.landing.cta.title}
          </h2>
          <p className="text-base sm:text-lg text-white/80 max-w-2xl mx-auto mb-6 sm:mb-8">
            {t.landing.cta.description}
          </p>
          <GoogleLoginButton variant="cta" />
        </div>
      </section>

      {/* Footer - 모바일 최적화 */}
      <footer className="bg-white border-t border-slate-100 py-8 sm:py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-6 sm:flex-row sm:justify-between sm:items-start sm:gap-8">
            {/* Left side - Company info */}
            <div className="text-xs sm:text-sm text-slate-500 space-y-1">
              <p className="font-medium text-slate-700">{t.landing.footer.rights}</p>
              <p>{t.landing.footer.ceo}</p>
              <p>BNN : 478-59-01063</p>
              <p>tnsb5373@gmail.com</p>
            </div>

            {/* Right side - Links */}
            <div className="flex items-center gap-6 sm:gap-8">
              <a href="/privacy" className="text-xs sm:text-sm text-slate-500 hover:text-slate-900 transition-colors">{t.landing.footer.privacy}</a>
              <a href="/terms" className="text-xs sm:text-sm text-slate-500 hover:text-slate-900 transition-colors">{t.landing.footer.terms}</a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
