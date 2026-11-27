/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { Component, useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './context/AuthContext';
import { DynamicTranslationProvider } from './context/DynamicTranslationContext';
import { getNormalizedLang } from './translations/i18n';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/HomePage';
import { SchemesPage } from './pages/SchemesPage';
import { SchemeDetailPage } from './pages/SchemeDetailPage';
import { EligibilityPage } from './pages/EligibilityPage';
import { AgriculturePage } from './pages/AgriculturePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { ChatbotPage } from './pages/ChatbotPage';
import { AboutPage } from './pages/AboutPage';
import { ContactPage } from './pages/ContactPage';
import { AgriMapPage } from './pages/AgriMapPage';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'Unexpected application error.' };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F5F8F5] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-[#E5E7EB] rounded-xl p-6 text-center space-y-3">
            <h1 className="text-lg font-bold text-[#17613A]">Something went wrong</h1>
            <p className="text-xs text-[#303030]/80 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#17613A] hover:bg-[#207747] text-white text-sm font-semibold rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const lang = getNormalizedLang(i18n.language);
    document.documentElement.lang = lang;
    document.title = t('header.title');
  }, [i18n.language, t]);

  return (
    <AppErrorBoundary>
      <AuthProvider>
      <DynamicTranslationProvider>
        <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <MainLayout>
                <HomePage />
              </MainLayout>
            }
          />
          <Route
            path="/schemes"
            element={
              <MainLayout>
                <SchemesPage />
              </MainLayout>
            }
          />
          <Route
            path="/schemes/:slug"
            element={
              <MainLayout>
                <SchemeDetailPage />
              </MainLayout>
            }
          />
          <Route
            path="/eligibility"
            element={
              <MainLayout>
                <EligibilityPage />
              </MainLayout>
            }
          />
          <Route
            path="/agriculture/:section"
            element={
              <MainLayout>
                <AgriculturePage />
              </MainLayout>
            }
          />
          <Route
            path="/agriculture"
            element={
              <MainLayout>
                <AgriculturePage />
              </MainLayout>
            }
          />
          <Route
            path="/login"
            element={
              <MainLayout>
                <LoginPage />
              </MainLayout>
            }
          />
          <Route
            path="/register"
            element={
              <MainLayout>
                <RegisterPage />
              </MainLayout>
            }
          />
          <Route
            path="/dashboard"
            element={
              <MainLayout>
                <DashboardPage />
              </MainLayout>
            }
          />
          <Route
            path="/admin"
            element={
              <MainLayout>
                <AdminDashboardPage />
              </MainLayout>
            }
          />
          <Route
            path="/agri-map"
            element={
              <MainLayout>
                <AgriMapPage />
              </MainLayout>
            }
          />
          <Route
            path="/chatbot"
            element={
              <MainLayout hideFloatingChat>
                <ChatbotPage />
              </MainLayout>
            }
          />
          <Route
            path="/about"
            element={
              <MainLayout>
                <AboutPage />
              </MainLayout>
            }
          />
          <Route
            path="/contact"
            element={
              <MainLayout>
                <ContactPage />
              </MainLayout>
            }
          />
          <Route
            path="*"
            element={
              <MainLayout>
                <HomePage />
              </MainLayout>
            }
          />
        </Routes>
      </BrowserRouter>
      </DynamicTranslationProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
