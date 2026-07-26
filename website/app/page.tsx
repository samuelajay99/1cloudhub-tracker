import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="shell">
      <div className="card">
        <div className="brand">
          TRACKER
          <small>Notes &amp; Follow-ups</small>
        </div>
        <h1>1CloudHub Tracker</h1>
        <p className="sub">
          Freeform notes, AI-powered task extraction, a kanban board, and an
          email-drafting assistant — for a manager&apos;s daily workflow.
          Invite-only: sign in below, or request access if you&apos;re new.
        </p>
        <Link className="btn btn-primary" href="/login">
          Sign in / Request access
        </Link>
      </div>
    </div>
  );
}
