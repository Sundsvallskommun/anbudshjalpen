import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router";
import { useConfig } from "./api/queries";
import { Loading } from "./components/states";
import { AppFrame } from "./shell/AppFrame";
import { HomeRedirect, KeepQueryRedirect } from "./shell/redirects";

// Every page is its own chunk, fetched on first visit: "/" sends each role to its own start, so no one page is
// everyone's first, and the frame paints while the page loads.
const NoticesPage = lazy(() => import("./pages/NoticesPage").then((module) => ({ default: module.NoticesPage })));
const StartPage = lazy(() => import("./pages/StartPage"));
const NoticePage = lazy(() => import("./pages/notice/NoticePage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const RemindersPage = lazy(() => import("./pages/RemindersPage"));
const RulesPage = lazy(() => import("./pages/RulesPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const BuyerPage = lazy(() => import("./pages/buyer/BuyerPage"));
const ChecklistReviewPage = lazy(() => import("./pages/buyer/ChecklistReviewPage"));
const DriftPage = lazy(() => import("./pages/buyer/DriftPage"));
const SettingsPage = lazy(() => import("./pages/buyer/SettingsPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const GatePage = lazy(() => import("./pages/GatePage"));
const AskAiExportPage = lazy(() => import("./pages/AskAiExportPage"));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading label="Hämtar sidan …" />}>{children}</Suspense>;
}

/**
 * The addresses (direction.md, section 3). "/" sends each role to where it starts; "/bevakning" moved to "/start",
 * and the mails still link to it.
 */
export function App() {
  const config = useConfig();
  if (config.data?.gate_required) {
    // The door (decision 0010): the frame stays, every address shows the gate until the code is in.
    return (
      <Routes>
        <Route element={<AppFrame />}>
          <Route path="*" element={<Lazy><GatePage /></Lazy>} />
        </Route>
      </Routes>
    );
  }
  return (
    <Routes>
      <Route element={<AppFrame />}>
        <Route index element={<HomeRedirect />} />
        <Route path="start" element={<Lazy><StartPage /></Lazy>} />
        <Route path="bevakning" element={<KeepQueryRedirect to="/start" />} />
        <Route path="upphandlingar" element={<Lazy><NoticesPage /></Lazy>} />
        <Route path="upphandlingar/:id" element={<Lazy><NoticePage /></Lazy>} />
        <Route path="regelhjalpen" element={<Lazy><RulesPage /></Lazy>} />
        <Route path="profil" element={<Lazy><ProfilePage /></Lazy>} />
        <Route path="paminnelser" element={<Lazy><RemindersPage /></Lazy>} />
        <Route path="logga-in" element={<Lazy><LoginPage /></Lazy>} />
        <Route path="inkop" element={<Lazy><BuyerPage /></Lazy>} />
        <Route path="inkop/checklistor/:id" element={<Lazy><ChecklistReviewPage /></Lazy>} />
        <Route path="inkop/drift" element={<Lazy><DriftPage /></Lazy>} />
        <Route path="inkop/installningar" element={<Lazy><SettingsPage /></Lazy>} />
        <Route path="*" element={<Lazy><NotFoundPage /></Lazy>} />
      </Route>
      {/* The conversation as a document to print: no frame, so only the document is printed (decision 0014). */}
      <Route path="fraga-ai/utskrift" element={<Lazy><AskAiExportPage /></Lazy>} />
    </Routes>
  );
}
