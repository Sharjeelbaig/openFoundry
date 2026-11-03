"use client";

import {
  Bot24Regular,
  CheckmarkCircle20Regular,
  ChevronRight20Regular,
  Flow24Regular,
  Key24Regular,
  Rocket24Regular,
} from "@fluentui/react-icons";
import { makeStyles, mergeClasses } from "@fluentui/react-components";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { REPO, REPO_FILES, VERSION } from "./content";

/* Measured from learn.microsoft.com/en-us/dynamics365 on 4 November 2026,
   light theme: hero #002050, body #161616, link #0065b3, rule #e1dfdd,
   card shadow 0 1.6px 3.6px rgba(0,0,0,.13), 0 0.3px 0.9px rgba(0,0,0,.11). */
const useStyles = makeStyles({
  section: {
    backgroundColor: "#ffffff",
    color: "#161616",
    borderTop: "1px solid #e1dfdd",
    scrollMarginTop: "64px",
  },
  hero: {
    backgroundColor: "#002050",
    color: "#ffffff",
    padding: "44px 0 40px",
  },
  inner: {
    width: "100%",
    maxWidth: "1320px",
    marginInline: "auto",
    paddingInline: "24px",
  },
  kicker: {
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#9cc3e5",
    marginBottom: "10px",
  },
  heroTitle: {
    fontSize: "40px",
    lineHeight: "48px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  heroLead: {
    fontSize: "16px",
    lineHeight: "26px",
    color: "#dbe9f6",
    maxWidth: "760px",
    marginTop: "12px",
  },
  heroMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "10px",
    marginTop: "20px",
  },
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "3px 9px",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: "4px",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#ffffff",
  },
  heroLink: {
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    border: 0,
    padding: 0,
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
  },
  body: {
    width: "100%",
    maxWidth: "1320px",
    marginInline: "auto",
    padding: "36px 24px 72px",
    display: "grid",
    gridTemplateColumns: "264px minmax(0, 1fr) 220px",
    gap: "36px",
    alignItems: "start",
    "@media (max-width: 1180px)": {
      gridTemplateColumns: "240px minmax(0, 1fr)",
    },
    "@media (max-width: 860px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
      padding: "24px 20px 56px",
      gap: "24px",
    },
  },
  toc: {
    position: "sticky",
    top: "84px",
    alignSelf: "start",
    "@media (max-width: 860px)": {
      position: "static",
      borderBottom: "1px solid #e1dfdd",
      paddingBottom: "16px",
    },
  },
  tocTitle: {
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#605e5c",
    marginBottom: "8px",
  },
  lessonButton: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    width: "100%",
    padding: "8px 10px",
    border: 0,
    borderLeft: "2px solid transparent",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    color: "#161616",
    fontSize: "14px",
    lineHeight: "20px",
    ":hover": {
      backgroundColor: "#f3f2f1",
    },
  },
  lessonActive: {
    borderLeft: "2px solid #0065b3",
    backgroundColor: "#f3f2f1",
    fontWeight: 600,
  },
  lessonIcon: {
    color: "#0065b3",
    marginTop: "2px",
    display: "inline-flex",
  },
  lessonLabel: {
    display: "block",
  },
  lessonTime: {
    display: "block",
    fontSize: "12px",
    lineHeight: "16px",
    color: "#605e5c",
    fontWeight: 400,
    marginTop: "2px",
  },
  tocSections: {
    listStyle: "none",
    margin: "2px 0 14px",
    padding: "0 0 0 32px",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  tocSectionLink: {
    color: "#605e5c",
    fontSize: "12px",
    lineHeight: "17px",
    textDecoration: "none",
    ":hover": {
      color: "#0065b3",
      textDecoration: "underline",
    },
  },
  railBox: {
    marginTop: "20px",
    padding: "12px",
    border: "1px solid #e1dfdd",
    borderRadius: "8px",
    backgroundColor: "#faf9f8",
  },
  railBoxTitle: {
    display: "block",
    fontSize: "13px",
    lineHeight: "18px",
    fontWeight: 600,
    marginBottom: "4px",
  },
  railBoxText: {
    display: "block",
    fontSize: "12px",
    lineHeight: "17px",
    color: "#605e5c",
    marginBottom: "6px",
  },
  railBoxLink: {
    display: "inline-block",
    marginTop: "2px",
    color: "#0065b3",
    fontSize: "12px",
    lineHeight: "18px",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
  article: {
    minWidth: 0,
    scrollMarginTop: "84px",
  },
  crumbs: {
    fontSize: "12px",
    lineHeight: "18px",
    color: "#605e5c",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "10px",
  },
  crumbLink: {
    color: "#0065b3",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
  articleTitle: {
    fontSize: "32px",
    lineHeight: "41px",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    margin: 0,
  },
  articleMeta: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px",
    marginTop: "10px",
    paddingBottom: "14px",
    borderBottom: "1px solid #e1dfdd",
    fontSize: "13px",
    lineHeight: "18px",
    color: "#605e5c",
  },
  dot: {
    width: "3px",
    height: "3px",
    borderRadius: "50%",
    backgroundColor: "#a19f9d",
    display: "inline-block",
  },
  h2: {
    fontSize: "24px",
    lineHeight: "32px",
    fontWeight: 600,
    margin: "32px 0 12px",
    scrollMarginTop: "84px",
  },
  h3: {
    fontSize: "18px",
    lineHeight: "24px",
    fontWeight: 600,
    margin: "22px 0 8px",
  },
  p: {
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0 0 12px",
  },
  lead: {
    fontSize: "16px",
    lineHeight: "26px",
    color: "#605e5c",
    margin: "14px 0 0",
  },
  list: {
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0 0 12px",
    paddingLeft: "22px",
  },
  steps: {
    fontSize: "16px",
    lineHeight: "26px",
    margin: "0 0 14px",
    paddingLeft: "22px",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  code: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    fontSize: "13px",
    backgroundColor: "#f3f2f1",
    border: "1px solid #e1dfdd",
    borderRadius: "3px",
    padding: "1px 5px",
  },
  pre: {
    backgroundColor: "#f3f2f1",
    border: "1px solid #e1dfdd",
    borderRadius: "4px",
    padding: "12px 14px",
    overflowX: "auto",
    fontSize: "13px",
    lineHeight: "21px",
    margin: "0 0 14px",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  },
  figure: {
    margin: "16px 0 24px",
  },
  img: {
    display: "block",
    width: "100%",
    height: "auto",
    border: "1px solid #e1dfdd",
    borderRadius: "8px",
    boxShadow:
      "0 1.6px 3.6px rgba(0,0,0,0.13), 0 0.3px 0.9px rgba(0,0,0,0.11)",
  },
  caption: {
    display: "block",
    marginTop: "7px",
    fontSize: "13px",
    lineHeight: "18px",
    color: "#605e5c",
  },
  note: {
    display: "flex",
    gap: "10px",
    padding: "12px 14px",
    margin: "16px 0 18px",
    backgroundColor: "#eff6fc",
    borderLeft: "4px solid #0065b3",
    borderRadius: "4px",
    fontSize: "14px",
    lineHeight: "22px",
    color: "#161616",
  },
  noteIcon: {
    color: "#0065b3",
    flexShrink: 0,
    marginTop: "2px",
    display: "inline-flex",
  },
  noteTitle: {
    display: "block",
    fontWeight: 600,
    marginBottom: "2px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
    lineHeight: "20px",
    margin: "6px 0 18px",
  },
  th: {
    textAlign: "left",
    fontWeight: 600,
    backgroundColor: "#faf9f8",
    borderBottom: "1px solid #e1dfdd",
    padding: "8px 10px",
    verticalAlign: "top",
  },
  td: {
    borderBottom: "1px solid #e1dfdd",
    padding: "8px 10px",
    verticalAlign: "top",
  },
  footerNav: {
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    marginTop: "36px",
    paddingTop: "16px",
    borderTop: "1px solid #e1dfdd",
    "@media (max-width: 640px)": { flexDirection: "column" },
  },
  footerLink: {
    color: "#0065b3",
    fontSize: "14px",
    lineHeight: "20px",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    border: 0,
    padding: 0,
    background: "transparent",
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    ":hover": { textDecoration: "underline" },
  },
  footerLabel: {
    display: "block",
    fontSize: "11px",
    lineHeight: "16px",
    color: "#605e5c",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  rail: {
    position: "sticky",
    top: "84px",
    alignSelf: "start",
    paddingLeft: "14px",
    borderLeft: "1px solid #e1dfdd",
    "@media (max-width: 1180px)": { display: "none" },
  },
  railTitle: {
    fontSize: "12px",
    lineHeight: "16px",
    fontWeight: 600,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "#605e5c",
    marginBottom: "8px",
  },
  railLinks: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  railLink: {
    color: "#605e5c",
    fontSize: "12px",
    lineHeight: "17px",
    textDecoration: "none",
    ":hover": { color: "#0065b3", textDecoration: "underline" },
  },
  edit: {
    display: "inline-block",
    marginTop: "22px",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#605e5c",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "14px",
    marginTop: "24px",
    "@media (max-width: 1080px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    "@media (max-width: 560px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  card: {
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    padding: "12px 14px",
    backgroundColor: "#ffffff",
    border: "1px solid #e1dfdd",
    borderRadius: "8px",
    boxShadow:
      "0 1.6px 3.6px rgba(0,0,0,0.13), 0 0.3px 0.9px rgba(0,0,0,0.11)",
    cursor: "pointer",
    textAlign: "left",
    color: "#161616",
    ":hover": { borderColor: "#0065b3" },
  },
  cardActive: {
    borderColor: "#0065b3",
    outline: "1px solid #0065b3",
  },
  cardIcon: {
    color: "#0065b3",
    flexShrink: 0,
    marginTop: "1px",
    display: "inline-flex",
  },
  cardKicker: {
    display: "block",
    fontSize: "11px",
    lineHeight: "15px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#605e5c",
    marginBottom: "2px",
  },
  cardTitle: {
    display: "block",
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 600,
    color: "#0065b3",
  },
});

function Figure({
  s,
  src,
  alt,
  caption,
}: {
  s: ReturnType<typeof useStyles>;
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className={s.figure}>
      <img className={s.img} src={src} alt={alt} loading="lazy" />
      <figcaption className={s.caption}>{caption}</figcaption>
    </figure>
  );
}

function Note({
  s,
  title,
  children,
}: {
  s: ReturnType<typeof useStyles>;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={s.note}>
      <span className={s.noteIcon}>
        <CheckmarkCircle20Regular />
      </span>
      <span>
        <span className={s.noteTitle}>{title}</span>
        {children}
      </span>
    </div>
  );
}

interface Lesson {
  id: string;
  kicker: string;
  title: string;
  summary: string;
  time: string;
  icon: ReactNode;
  render: (s: ReturnType<typeof useStyles>) => ReactNode;
  sections: { id: string; title: string; render: (s: ReturnType<typeof useStyles>) => ReactNode }[];
}

const LESSONS: Lesson[] = [
  {
    id: "setup",
    kicker: "Get started",
    title: "Setup",
    summary: "Install the desktop app or run the web workspace, then claim the install.",
    time: "8 min read",
    icon: <Rocket24Regular />,
    sections: [
      {
        id: "need",
        title: "What you need",
        render: (s) => (
          <>
            <ul className={s.list}>
              <li>macOS 13.5 or later on Apple silicon for the desktop app.</li>
              <li>Node.js 20.9 or later for the web workspace.</li>
              <li>No account, no cloud subscription and no usage bill.</li>
            </ul>
            <p className={s.p}>
              Both routes open the same workspace. The desktop app adds a native window and a
              bundled Node runtime; the web route runs the same server in your own terminal.
            </p>
          </>
        ),
      },
      {
        id: "macos",
        title: "macOS desktop",
        render: (s) => (
          <>
            <ol className={s.steps}>
              <li>
                Download the current DMG from the{" "}
                <a className={s.crumbLink} href={REPO_FILES.releases}>
                  releases page
                </a>
                .
              </li>
              <li>Open the DMG and drag openFoundry to Applications.</li>
              <li>
                The build is ad-hoc signed and not notarized. The first time, right-click the app
                and choose <strong>Open</strong>, then confirm. On macOS 15 and later, use System
                Settings, Privacy and Security, Open Anyway.
              </li>
              <li>
                The welcome step lists the terms. Accept them and continue. The profile step asks
                for a display name, initials and an email.
              </li>
              <li>
                Point the provider step at Foundry Local, Ollama, LM Studio or llama.cpp, then pick
                a model.
              </li>
            </ol>
            <Note s={s} title="No sign-in prompt">
              The desktop shell holds a machine credential in the app data folder and signs the
              local user in. You can issue an access code for another browser later, on the Access
              control page.
            </Note>
            <Figure
              s={s}
              src="./assets/screens/docs-setup-wizard.webp"
              alt="The first run wizard: welcome step with the terms, workspace name, and the five step rail."
              caption="The first run wizard. Terms, profile, providers, model, ready."
            />
            <Figure
              s={s}
              src="./assets/screens/docs-setup-profile.webp"
              alt="The profile step with display name, initials and email fields."
              caption="The profile step. The web build also asks for the setup token on this screen."
            />
          </>
        ),
      },
      {
        id: "web",
        title: "Web workspace",
        render: (s) => (
          <>
            <p className={s.p}>
              Clone the repository and install the dependencies. Use Node.js 20.9 or later.
            </p>
            <pre className={s.pre}>
              <code>{`git clone https://github.com/Sharjeelbaig/openFoundry.git
cd openFoundry
npm install
npm run dev`}</code>
            </pre>
            <p className={s.p}>
              The first start prints a one-time setup token to the terminal and opens the setup
              screen. Enter the token with your name and email. The app creates the owner and shows
              an access code once.
            </p>
            <Note s={s} title="The token is the claim">
              The first browser to reach an unclaimed install cannot become the owner without the
              token printed by the server. That is what stops a takeover when the port is exposed.
            </Note>
            <p className={s.p}>
              Open <span className={s.code}>http://localhost:3000</span>. If the token expired,
              restart the server; it prints a fresh one while the install has no owner.
            </p>
          </>
        ),
      },
      {
        id: "windows",
        title: "Windows",
        render: (s) => (
          <>
            <p className={s.p}>
              The desktop build for Windows is not available yet. The web workspace runs on Windows
              with Node.js 20.9 or later, using the same commands as above.
            </p>
            <p className={s.p}>
              The packaged app is macOS only for now. Windows packaging is tracked in{" "}
              <a className={s.crumbLink} href={`${REPO}/issues/1`}>
                issue 1
              </a>
              .
            </p>
          </>
        ),
      },
      {
        id: "after",
        title: "After setup",
        render: (s) => (
          <>
            <p className={s.p}>
              Sign in at <span className={s.code}>/signin</span> with your access code. On a web
              install, the code is the only credential. Lose it and run this from the project
              folder:
            </p>
            <pre className={s.pre}>
              <code>npm run access-code</code>
            </pre>
            <p className={s.p}>
              It prints a new code for the owner and revokes the old one. It needs the same
              filesystem access the server already has, so it is not a remote reset.
            </p>
          </>
        ),
      },
    ],
    render: (s) => (
      <>
        <p className={s.lead}>
          Two ways to run openFoundry, one workspace. Install the macOS app or start the web
          server, claim the install, then sign in.
        </p>
        <Note s={s} title="The setup lesson covers macOS and web">
          Windows is listed at the end. The desktop build for Windows is not available yet, and the
          web workspace is the supported route there.
        </Note>
      </>
    ),
  },
  {
    id: "authentication",
    kicker: "Access",
    title: "Authentication",
    summary: "Access codes, sessions, people and roles, and the Foundry-style role assignment flow.",
    time: "10 min read",
    icon: <Key24Regular />,
    sections: [
      {
        id: "how",
        title: "How sign-in works",
        render: (s) => (
          <>
            <p className={s.p}>
              openFoundry has no passwords and no identity provider. A person signs in with an
              access code: 16 characters in four groups, for example{" "}
              <span className={s.code}>7Q4M-XR2A-K9WP-3FJH</span>.
            </p>
            <ul className={s.list}>
              <li>The code is stored as a salted hash. Nobody can recover it, only replace it.</li>
              <li>
                A correct code creates a session cookie. The session is what every page and every
                API call is checked against.
              </li>
              <li>
                The desktop app does not use a code. It signs itself in with a machine credential
                stored in the app data folder.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "signin",
        title: "Sign in",
        render: (s) => (
          <>
            <p className={s.p}>
              Open the app. If there is no session, it sends you to the sign-in screen. Paste the
              code and continue.
            </p>
            <Figure
              s={s}
              src="./assets/screens/docs-signin.webp"
              alt="The sign-in screen with one access code field and a continue button."
              caption="One field. Codes are not case sensitive and the dashes are optional."
            />
          </>
        ),
      },
      {
        id: "roles",
        title: "People and roles",
        render: (s) => (
          <>
            <p className={s.p}>
              Four built-in roles. Each one is a list of permissions, and every screen that mentions
              a role reads it from that list.
            </p>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>Role</th>
                  <th className={s.th}>What it can do</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={s.td}>
                    <strong>Owner</strong>
                  </td>
                  <td className={s.td}>
                    Everything, including people, access codes and role assignments.
                  </td>
                </tr>
                <tr>
                  <td className={s.td}>
                    <strong>Contributor</strong>
                  </td>
                  <td className={s.td}>
                    Create and manage models, agents, knowledge, tools and connections. Cannot change
                    access or project identity.
                  </td>
                </tr>
                <tr>
                  <td className={s.td}>
                    <strong>Foundry User</strong>
                  </td>
                  <td className={s.td}>
                    Read the project and run models and agents. Cannot create or change anything.
                  </td>
                </tr>
                <tr>
                  <td className={s.td}>
                    <strong>Reader</strong>
                  </td>
                  <td className={s.td}>View the project and its resources. Cannot run models.</td>
                </tr>
              </tbody>
            </table>
            <p className={s.p}>
              The permission line on the project page is computed from the actions the signed-in
              person actually has. It shows{" "}
              <strong>Full access</strong> only when the action set is everything.
            </p>
            <Figure
              s={s}
              src="./assets/screens/docs-users.webp"
              alt="The Users page with name, access type, role and scope columns."
              caption="The Users page. Four columns, no row actions, and a computed My permission line."
            />
          </>
        ),
      },
      {
        id: "invite",
        title: "Invite someone",
        render: (s) => (
          <>
            <ol className={s.steps}>
              <li>
                Open <strong>Manage, Project details, Users</strong> and choose{" "}
                <strong>Add user</strong>.
              </li>
              <li>
                Type a name or email in <strong>Add people</strong>. An unknown email offers an
                invite.
              </li>
              <li>
                The invite creates the person with the Reader and Foundry User roles and issues one
                access code.
              </li>
              <li>Copy the code and send it to the person. It is shown once.</li>
            </ol>
            <Figure
              s={s}
              src="./assets/screens/docs-access-code.webp"
              alt="The Add user success state with the new person and a one-time access code."
              caption="The code is shown once. The person can change nothing until a role is assigned."
            />
          </>
        ),
      },
      {
        id: "assign",
        title: "Assign a role the Foundry way",
        render: (s) => (
          <>
            <p className={s.p}>
              Role assignment is not a field in the Add user dialog. Foundry hands it to the Azure
              portal; openFoundry renders the same flow at{" "}
              <strong>Access control (IAM)</strong>.
            </p>
            <ol className={s.steps}>
              <li>
                Open <strong>Manage, Access control (IAM)</strong> and choose{" "}
                <strong>Add role assignment</strong>.
              </li>
              <li>Pick a role. View opens the exact permission list behind it.</li>
              <li>
                Select members from the directory. The pane moves chosen people to the selected
                list.
              </li>
              <li>
                Review the role, scope, members and optional description, then choose{" "}
                <strong>Review + assign</strong>.
              </li>
            </ol>
            <Figure
              s={s}
              src="./assets/screens/docs-role-wizard.webp"
              alt="The Add role assignment role step, with Owner, Contributor, Foundry User and Reader."
              caption="Step 1. Conditions stays disabled because this build has no conditions."
            />
            <Figure
              s={s}
              src="./assets/screens/docs-members.webp"
              alt="The Select members pane with search and a selected person."
              caption="The members pane. Chosen people move to the right and can be removed there."
            />
            <Figure
              s={s}
              src="./assets/screens/docs-access-control.webp"
              alt="The Access control page with assignments grouped by role."
              caption="Assignments group by role, and the Scope column shows direct versus inherited."
            />
          </>
        ),
      },
      {
        id: "revoke",
        title: "Revoke access and read the log",
        render: (s) => (
          <>
            <p className={s.p}>
              Open the <strong>Access codes</strong> tab on the access control page. Revoking a code
              also ends every session that person has, so the next request sends them to the
              sign-in screen.
            </p>
            <p className={s.p}>
              Every sign-in, denial and assignment change is appended to{" "}
              <span className={s.code}>data/audit.jsonl</span>:
            </p>
            <pre className={s.pre}>
              <code>{`tail -5 data/audit.jsonl`}</code>
            </pre>
          </>
        ),
      },
    ],
    render: (s) => (
      <>
        <p className={s.lead}>
          A local directory with real enforcement. Every request is checked against the permissions
          of the signed-in person before a handler runs.
        </p>
      </>
    ),
  },
  {
    id: "agent-builder",
    kicker: "Build",
    title: "Agent builder",
    summary: "Deploy a model, create an agent and test it in the same screen.",
    time: "9 min read",
    icon: <Bot24Regular />,
    sections: [
      {
        id: "deploy",
        title: "Deploy a model first",
        render: (s) => (
          <>
            <p className={s.p}>
              An agent needs a deployment to answer with. Open{" "}
              <strong>Build, Models, Deployments</strong> and choose <strong>Deploy</strong>.
            </p>
            <Figure
              s={s}
              src="./assets/screens/docs-deployments.webp"
              alt="The deployments table with a running deployment and its endpoint."
              caption="A running deployment. Standard, Developer, Provisioned and Batch behave differently."
            />
            <p className={s.p}>
              Every deployment gets its own OpenAI-compatible endpoint and key. The agent builder
              can point at any of them.
            </p>
          </>
        ),
      },
      {
        id: "create",
        title: "Create the agent",
        render: (s) => (
          <>
            <ol className={s.steps}>
              <li>
                Open <strong>Build, Agents</strong> and choose <strong>Create agent</strong>. A
                template is a starting point, not a separate kind of agent.
              </li>
              <li>Pick the model deployment from the model list.</li>
              <li>Write the instructions in the box on the left.</li>
              <li>
                Attach tools, knowledge, memory or a guardrail from the sections below the
                instructions.
              </li>
            </ol>
            <Figure
              s={s}
              src="./assets/screens/docs-agent-builder.webp"
              alt="The agent builder with model, instructions, tools, knowledge, memory and guardrail on the left, and the chat panel on the right."
              caption="The builder. Instructions, tools, knowledge, memory and guardrail on one screen."
            />
          </>
        ),
      },
      {
        id: "test",
        title: "Test it in the playground",
        render: (s) => (
          <>
            <p className={s.p}>
              The right half of the builder is a live playground. Send a message and the agent
              answers with the model, tools and knowledge you attached.
            </p>
            <p className={s.p}>
              Open the <strong>Traces</strong> tab to see each turn, the model call and any tool the
              agent used. Nothing leaves the machine unless a tool or model endpoint points
              somewhere remote.
            </p>
          </>
        ),
      },
      {
        id: "publish",
        title: "Publish the endpoint",
        render: (s) => (
          <>
            <p className={s.p}>
              Choose <strong>Publish</strong> to make the agent callable. The published agent has
              its own key and an OpenAI-compatible chat route, so the same SDK code works against
              it.
            </p>
            <Note s={s} title="Some runtime paths are still being verified">
              The builder screens match Foundry and the playground is real. Treat this lesson as a
              guided tour of the UI while the remaining runtime paths are verified.
            </Note>
          </>
        ),
      },
    ],
    render: (s) => (
      <>
        <p className={s.lead}>
          A prompt agent is a model, an instruction and the resources you attach to it. Build it,
          test it and publish it without leaving the workspace.
        </p>
      </>
    ),
  },
  {
    id: "workflows",
    kicker: "Automate",
    title: "Workflows",
    summary: "Orchestrate agents, branches, variables and human answers as a repeatable process.",
    time: "11 min read",
    icon: <Flow24Regular />,
    sections: [
      {
        id: "what",
        title: "What a workflow is",
        render: (s) => (
          <>
            <p className={s.p}>
              A workflow is a graph of nodes and edges. Each node does one thing: run an agent, set
              a variable, branch, ask a person, send a message or go to another node. Edges decide
              what runs next.
            </p>
            <p className={s.p}>
              Variables are addressed with a scope. `System.LastMessage.Text` is the input the run
              started with; `Local.LatestMessage` is a variable the workflow sets.
            </p>
          </>
        ),
      },
      {
        id: "create",
        title: "Create one from a template",
        render: (s) => (
          <>
            <ol className={s.steps}>
              <li>
                Open <strong>Build, Agents, Workflows</strong> and choose{" "}
                <strong>Create workflow</strong>.
              </li>
              <li>
                Pick a template: blank, sequential, human in the loop, or group chat. The template
                creates real nodes you can edit.
              </li>
              <li>
                Drag nodes, connect handles, and open a node to edit its settings. The YAML and Code
                tabs show the same definition.
              </li>
            </ol>
            <Figure
              s={s}
              src="./assets/screens/docs-workflow-builder.webp"
              alt="The workflow canvas with start, set variable, ask a question, if else, messages and end nodes."
              caption="The human in the loop template. Branch edges are labelled If and Else."
            />
          </>
        ),
      },
      {
        id: "nodes",
        title: "The node types",
        render: (s) => (
          <>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>Node</th>
                  <th className={s.th}>What it does</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={s.td}>Start</td>
                  <td className={s.td}>Starts the run with the first user message.</td>
                </tr>
                <tr>
                  <td className={s.td}>Agent</td>
                  <td className={s.td}>
                    Runs a prompt agent with the current message and stores its answer.
                  </td>
                </tr>
                <tr>
                  <td className={s.td}>Set variable</td>
                  <td className={s.td}>Stores a value from an expression for later nodes.</td>
                </tr>
                <tr>
                  <td className={s.td}>If / else</td>
                  <td className={s.td}>Chooses an edge based on one or more conditions.</td>
                </tr>
                <tr>
                  <td className={s.td}>Ask a question</td>
                  <td className={s.td}>
                    Pauses the run until a person answers. The answer becomes a variable.
                  </td>
                </tr>
                <tr>
                  <td className={s.td}>Send message</td>
                  <td className={s.td}>Adds a message to the run transcript.</td>
                </tr>
                <tr>
                  <td className={s.td}>Go to node</td>
                  <td className={s.td}>Loops back, so a workflow can retry.</td>
                </tr>
                <tr>
                  <td className={s.td}>End</td>
                  <td className={s.td}>Finishes the run with the final answer.</td>
                </tr>
              </tbody>
            </table>
          </>
        ),
      },
      {
        id: "run",
        title: "Run it and answer the question",
        render: (s) => (
          <>
            <ol className={s.steps}>
              <li>
                Choose <strong>Preview</strong> and enter the first message, then choose{" "}
                <strong>Run</strong>.
              </li>
              <li>
                When the run reaches <strong>Ask a question</strong>, it shows{" "}
                <strong>Waiting for you</strong>. Type the same text and choose{" "}
                <strong>Send answer</strong>.
              </li>
              <li>
                The if / else node compares the two values, sends the confirmation message and ends
                the run.
              </li>
            </ol>
            <Figure
              s={s}
              src="./assets/screens/docs-workflow-run.webp"
              alt="A completed workflow run with the transcript and six node activities."
              caption="A completed run. The transcript keeps both answers and the workflow message."
            />
          </>
        ),
      },
      {
        id: "inspect",
        title: "Inspect the run",
        render: (s) => (
          <>
            <p className={s.p}>
              Every node reports its status on the canvas while the run moves. Open{" "}
              <strong>Node activity</strong> in the preview panel to see the order and the values.
            </p>
            <ul className={s.list}>
              <li>
                <strong>Traces</strong> keeps a record of the run, including agent calls.
              </li>
              <li>
                <strong>Monitor</strong> lists runs and their status.
              </li>
              <li>
                <strong>YAML</strong> and <strong>Code</strong> show the definition you can copy or
                import.
              </li>
            </ul>
          </>
        ),
      },
    ],
    render: (s) => (
      <>
        <p className={s.lead}>
          Workflows run real local agents and real branching. This lesson walks a template from the
          canvas to a completed run.
        </p>
      </>
    ),
  },
];

export default function DocsSection() {
  const s = useStyles();
  const [activeId, setActiveId] = useState(LESSONS[0].id);
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const match = LESSONS.find((lesson) => hash === `docs-${lesson.id}`);
    if (match) setActiveId(match.id);
  }, []);

  const active = LESSONS.find((lesson) => lesson.id === activeId) ?? LESSONS[0];
  const index = LESSONS.indexOf(active);
  const previous = index > 0 ? LESSONS[index - 1] : null;
  const next = index < LESSONS.length - 1 ? LESSONS[index + 1] : null;

  const select = (id: string) => {
    setActiveId(id);
    window.history.replaceState(null, "", `#docs-${id}`);
    window.requestAnimationFrame(() => {
      articleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <section className={s.section} id="docs" aria-labelledby="docs-title">
      <div className={s.hero}>
        <div className={s.inner}>
          <div className={s.kicker}>Documentation</div>
          <h1 className={s.heroTitle} id="docs-title">
            openFoundry documentation
          </h1>
          <p className={s.heroLead}>
            Four lessons: setup, authentication, agent builder and workflows. Setup covers the
            macOS app and the web workspace. Windows follows later.
          </p>
          <div className={s.heroMeta}>
            <span className={s.chip}>Version {VERSION}</span>
            <span className={s.chip}>4 lessons</span>
            <button type="button" className={s.heroLink} onClick={() => select("setup")}>
              Start with setup
            </button>
          </div>
        </div>
      </div>

      <div className={s.inner} style={{ paddingBottom: 0 }}>
        <div className={s.cards} aria-label="Lessons">
          {LESSONS.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className={mergeClasses(s.card, lesson.id === active.id && s.cardActive)}
              onClick={() => select(lesson.id)}
              aria-current={lesson.id === active.id ? "true" : undefined}
            >
              <span className={s.cardIcon}>{lesson.icon}</span>
              <span>
                <span className={s.cardKicker}>{lesson.kicker}</span>
                <span className={s.cardTitle}>{lesson.title}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={s.body} id="docs-reader">
        <nav className={s.toc} aria-label="Lessons">
          <div className={s.tocTitle}>Lessons</div>
          {LESSONS.map((lesson) => (
            <div key={lesson.id}>
              <button
                type="button"
                className={mergeClasses(
                  s.lessonButton,
                  lesson.id === active.id && s.lessonActive
                )}
                onClick={() => select(lesson.id)}
                aria-expanded={lesson.id === active.id}
              >
                <span className={s.lessonIcon}>{lesson.icon}</span>
                <span>
                  <span className={s.lessonLabel}>{lesson.title}</span>
                  <span className={s.lessonTime}>{lesson.time}</span>
                </span>
              </button>
              {lesson.id === active.id && (
                <ul className={s.tocSections}>
                  {lesson.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        className={s.tocSectionLink}
                        href={`#docs-${lesson.id}-${section.id}`}
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <div className={s.railBox}>
            <span className={s.railBoxTitle}>Something missing?</span>
            <span className={s.railBoxText}>
              Open an issue on GitHub and say which lesson needs work.
            </span>
            <a className={s.railBoxLink} href={REPO_FILES.issues}>
              Open an issue
            </a>
          </div>
        </nav>

        <article
          className={s.article}
          ref={articleRef}
          aria-labelledby={`docs-${active.id}-title`}
        >
          <div className={s.crumbs}>
            <a className={s.crumbLink} href="#docs">
              Documentation
            </a>
            <ChevronRight20Regular style={{ width: 12, height: 12 }} />
            <span>{active.title}</span>
          </div>

          <h1 className={s.articleTitle} id={`docs-${active.id}-title`}>
            {active.title}
          </h1>
          <div className={s.articleMeta}>
            <span>{active.time}</span>
            <span className={s.dot} />
            <span>Updated 4 November 2026</span>
          </div>

          {active.render(s)}

          {active.sections.map((section) => (
            <section key={section.id}>
              <h2 className={s.h2} id={`docs-${active.id}-${section.id}`}>
                {section.title}
              </h2>
              {section.render(s)}
            </section>
          ))}

          <div className={s.footerNav}>
            <div>
              {previous && (
                <button type="button" className={s.footerLink} onClick={() => select(previous.id)}>
                  <span>
                    <span className={s.footerLabel}>Previous</span>
                    {previous.title}
                  </span>
                </button>
              )}
            </div>
            <div>
              {next && (
                <button type="button" className={s.footerLink} onClick={() => select(next.id)}>
                  <span>
                    <span className={s.footerLabel}>Next</span>
                    {next.title}
                  </span>
                </button>
              )}
            </div>
          </div>

          <a className={s.edit} href={`${REPO}/blob/main/landing-src/docs.tsx`}>
            Edit this page on GitHub
          </a>
        </article>

        <aside className={s.rail} aria-label="In this article">
          <div className={s.railTitle}>In this article</div>
          <ul className={s.railLinks}>
            {active.sections.map((section) => (
              <li key={section.id}>
                <a className={s.railLink} href={`#docs-${active.id}-${section.id}`}>
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
