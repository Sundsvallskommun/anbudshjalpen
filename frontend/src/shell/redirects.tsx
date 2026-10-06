import { Navigate, useLocation } from "react-router";
import { useSession } from "../api/queries";
import { Loading } from "../components/states";
import { homePath } from "./navigation";

/**
 * "/" takes each role to where it starts: företagare to Start, inköpare to Inköp, visitors to the notices. The
 * address's own query and hash come along, so an old link such as "/?status=open" still filters the list.
 */
export function HomeRedirect() {
  const session = useSession();
  const { search, hash } = useLocation();
  if (session.isPending) return <Loading label="Hämtar sidan …" />;
  const role = session.data?.user?.role ?? null;
  return <Navigate to={{ pathname: homePath(role), search, hash }} replace />;
}

/** A moved address, with its query and hash kept: "/bevakning?x=1" becomes "/start?x=1" (the mails link there). */
export function KeepQueryRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: to, search, hash }} replace />;
}
