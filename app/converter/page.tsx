"use client";

import { useState, useEffect } from "react";
import {
  ConverterState,
  ConverterStep,
  WpConnection,
  WpUserProfile,
  ThemeConfig,
  UploadedFile,
  ConversionResult,
  ConversionStatus,
  PageEntry,
} from "@/types/converter";
import {
  saveConnection,
  loadConnection,
  saveUserProfile,
  loadUserProfile,
  clearConnection,
} from "@/lib/converter/storage";

import StepIndicator from "@/components/converter/StepIndicator";
import Step1Connect from "@/components/converter/Step1Connect";
import Step2Upload from "@/components/converter/Step2Upload";
import Step3Convert from "@/components/converter/Step3Convert";
import Step4Deploy from "@/components/converter/Step4Deploy";

const defaultConnection: WpConnection = {
  siteUrl: "",
  username: "",
  appPassword: "",
  isConnected: false,
};

const defaultThemeConfig: ThemeConfig = {
  themeName: "",
  themeSlug: "",
  author: "",
  description: "",
  version: "1.0.0",
};

const initialState: ConverterState = {
  currentStep: 1,
  wpConnection: defaultConnection,
  userProfile: null,
  uploadedFiles: [],
  themeConfig: defaultThemeConfig,
  conversionStatus: "idle",
  conversionResult: null,
  error: null,
  pages: [],
  activePageId: null,
};

export default function ConverterPage() {
  const [state, setState] = useState<ConverterState>(initialState);
  const [welcomeNote, setWelcomeNote] = useState<string | null>(null);

  // Load persisted connection on mount
  useEffect(() => {
    const savedConnection = loadConnection();
    const savedProfile = loadUserProfile();

    if (savedConnection && savedProfile) {
      setState((prev) => ({
        ...prev,
        wpConnection: { ...savedConnection, isConnected: true },
        userProfile: savedProfile,
        currentStep: 2,
      }));
      setWelcomeNote(`Welcome back, ${savedProfile.name}`);
      const timer = setTimeout(() => setWelcomeNote(null), 4000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Listen for logout event dispatched by ProfileBar
  useEffect(() => {
    function onLogout() {
      setState(initialState);
    }
    window.addEventListener("wp_logout", onLogout);
    return () => window.removeEventListener("wp_logout", onLogout);
  }, []);

  function goToStep(step: ConverterStep) {
    setState((prev) => ({ ...prev, currentStep: step }));
  }

  function updateWpConnection(data: Partial<WpConnection>) {
    setState((prev) => ({
      ...prev,
      wpConnection: { ...prev.wpConnection, ...data },
    }));
  }

  function updateThemeConfig(data: Partial<ThemeConfig>) {
    setState((prev) => ({
      ...prev,
      themeConfig: { ...prev.themeConfig, ...data },
    }));
  }

  function addFiles(files: UploadedFile[]) {
    setState((prev) => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, ...files],
    }));
  }

  function removeFile(id: string) {
    setState((prev) => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.filter((f) => f.id !== id),
    }));
  }

  // ── Multi-page handlers ────────────────────────────────────────────────────

  function handlePagesReady(pages: PageEntry[], thenGoToStep3 = false) {
    const firstId = pages[0]?.id ?? null;
    setState((prev) => ({
      ...prev,
      pages,
      activePageId: firstId,
      conversionStatus: "idle",
      conversionResult: null,
      error: null,
      // advance to step 3 in the same state update if requested
      currentStep: thenGoToStep3 ? 3 : prev.currentStep,
    }));
  }

  function setActivePage(id: string) {
    setState((prev) => {
      const page = prev.pages.find((p) => p.id === id);
      return {
        ...prev,
        activePageId: id,
        conversionStatus: page?.conversionStatus ?? "idle",
        // Only update conversionResult if the page has one — don't null it out
        // (Step4Deploy reads conversionResult from pages[] directly)
        conversionResult: page?.conversionResult ?? prev.conversionResult,
        error: page?.error ?? null,
      };
    });
  }

  function handleConvert(result: ConversionResult) {
    setState((prev) => {
      const pages = prev.pages.map((p) =>
        p.id === prev.activePageId
          ? { ...p, conversionStatus: "done" as ConversionStatus, conversionResult: result, error: null }
          : p
      );
      return {
        ...prev,
        pages,
        conversionResult: result,
        conversionStatus: "done",
        error: null,
      };
    });
  }

  function handleConversionStatusChange(status: ConversionStatus, error?: string) {
    setState((prev) => {
      const pages = prev.pages.map((p) =>
        p.id === prev.activePageId
          ? { ...p, conversionStatus: status, error: error ?? null }
          : p
      );
      return {
        ...prev,
        pages,
        conversionStatus: status,
        error: error ?? null,
      };
    });
  }

  function handleConnectionSuccess(connection: WpConnection, profile: WpUserProfile) {
    saveConnection({ ...connection, isConnected: true });
    saveUserProfile(profile);
    setState((prev) => ({
      ...prev,
      wpConnection: { ...connection, isConnected: true },
      userProfile: profile,
    }));
  }

  function handleLogout() {
    clearConnection();
    setState(initialState);
    window.dispatchEvent(new Event("wp_logout"));
  }

  // Active page derived data
  const activePage = state.pages.find((p) => p.id === state.activePageId) ?? null;

  // For Step3: only pass the HTML file for the active page + all CSS/JS/images
  const activePageFiles: UploadedFile[] = state.pages.length > 0 && activePage
    ? [
        ...state.uploadedFiles.filter((f) => f.type !== "html"),
        ...state.uploadedFiles.filter((f) => f.type === "html" && f.name === activePage.htmlFileName),
      ]
    : state.uploadedFiles;

  return (
    <div>
      {welcomeNote && (
        <div className="max-w-2xl mx-auto px-4 mb-4">
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
            {welcomeNote}
          </div>
        </div>
      )}

      <StepIndicator currentStep={state.currentStep} />

      {state.currentStep === 1 && (
        <Step1Connect
          wpConnection={state.wpConnection}
          themeConfig={state.themeConfig}
          onUpdateWpConnection={updateWpConnection}
          onUpdateThemeConfig={updateThemeConfig}
          onConnectionSuccess={handleConnectionSuccess}
          onNext={() => goToStep(2)}
        />
      )}

      {state.currentStep === 2 && (
        <Step2Upload
          uploadedFiles={state.uploadedFiles}
          themeConfig={state.themeConfig}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          onUpdateThemeConfig={updateThemeConfig}
          onPagesReady={handlePagesReady}
          onNext={() => goToStep(3)}
          onBack={() => goToStep(1)}
        />
      )}

      {state.currentStep === 3 && (
        <Step3Convert
          uploadedFiles={activePageFiles}
          themeConfig={state.themeConfig}
          conversionStatus={state.conversionStatus}
          conversionResult={state.conversionResult}
          error={state.error}
          pages={state.pages}
          activePageId={state.activePageId}
          onSetActivePage={(id) => {
            setActivePage(id);
          }}
          onConvert={handleConvert}
          onStatusChange={handleConversionStatusChange}
          onNext={() => goToStep(4)}
          onBack={() => {
            handleConversionStatusChange("idle");
            goToStep(2);
          }}
        />
      )}

      {state.currentStep === 4 && state.conversionResult && (
        <Step4Deploy
          conversionResult={state.conversionResult}
          wpConnection={state.wpConnection}
          themeConfig={state.themeConfig}
          pages={state.pages}
          activePageId={state.activePageId}
          onSetActivePage={setActivePage}
          onBack={() => goToStep(3)}
        />
      )}
    </div>
  );
}
