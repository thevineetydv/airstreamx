import { Navigate, useParams } from "react-router-dom";

/**
 * /creators/:handle — legacy URL.
 *
 * This page used to fetch `/creators?handle=` and `/creators/:handle/videos`,
 * but those backend routes don't exist, so every visit showed
 * "Creator Not Found" (and its video links used the wrong `?id=` param).
 * The real, maintained channel page lives at /@handle, so old links and
 * search-engine results are redirected there instead.
 */
export default function CreatorDetailPage() {
  const { handle } = useParams<{ handle: string }>();
  const clean = (handle || "").trim().replace(/^@/, "");
  return <Navigate to={clean ? `/@${encodeURIComponent(clean)}` : "/"} replace />;
}
