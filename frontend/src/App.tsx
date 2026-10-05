import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router";
import { Loading } from "./components/states";
import { NoticesPage } from "./pages/NoticesPage";
import { AppFrame } from "./shell/AppFrame";

// The start page loads with the app; every other page is its own chunk, fetched on first visit.
const NoticePage = lazy(() => import("./pages/notice/NoticePage"));
const WatchPage = lazy(() => import("./pages/WatchPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const RemindersPage = lazy(() => import("./pages/RemindersPage"));
const RulesPage = lazy(() => import("./pages/RulesPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const BuyerPage = lazy(() => import("./pages/buyer/BuyerPage"));
const ChecklistReviewPage = lazy(() => import("./pages/buyer/ChecklistReviewPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading label="Hämtar sidan …" />}>{children}</Suspense>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AppFrame />}>
        <Route index element={<NoticesPage />} />
        <Route path="upphandlingar/:id" element={<Lazy><NoticePage /></Lazy>} />
        <Route path="bevakning" element={<Lazy><WatchPage /></Lazy>} />
        <Route path="profil" element={<Lazy><ProfilePage /></Lazy>} />
        <Route path="paminnelser" element={<Lazy><RemindersPage /></Lazy>} />
        <Route path="regelhjalpen" element={<Lazy><RulesPage /></Lazy>} />
        <Route path="logga-in" element={<Lazy><LoginPage /></Lazy>} />
        <Route path="inkop" element={<Lazy><BuyerPage /></Lazy>} />
        <Route path="inkop/checklistor/:id" element={<Lazy><ChecklistReviewPage /></Lazy>} />
        <Route path="*" element={<Lazy><NotFoundPage /></Lazy>} />
      </Route>
    </Routes>
  );
}
