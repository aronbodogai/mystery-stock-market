import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorToasts } from "./components/ErrorToasts";
import { I18nProvider } from "./i18n";
import { Home } from "./pages/Home";
import { PairPage } from "./pages/Pair";
import { JoinRedirect, RoomPage } from "./pages/RoomPage";
import { SoloPage } from "./pages/Solo";
import { TvPage } from "./pages/Tv";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/j/:code" element={<JoinRedirect />} />
          <Route path="/r/:code" element={<RoomPage />} />
          <Route path="/tv" element={<TvPage />} />
          <Route path="/pair/:pairCode" element={<PairPage />} />
          <Route path="/solo" element={<SoloPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ErrorToasts />
    </I18nProvider>
  </StrictMode>,
);
