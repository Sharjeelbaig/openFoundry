// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { ReactNode } from "react";
import { REPO_FILES } from "./content";

type S = Record<string, string>;

export interface DocsLesson {
  id: string;
  title: string;
  nav: string;
  intro: ReactNode;
  sections: { id: string; title: string; body: ReactNode }[];
}

function Figure({
  s,
  src,
  alt,
  caption,
  width = 1600,
  height = 1000,
}: {
  s: S;
  src: string;
  alt: string;
  caption: string;
  width?: number;
  height?: number;
}) {
  return (
    <figure className={s.figure}>
      <img
        className={s.shot}
        src={src}
        alt={alt}
        loading="lazy"
        width={width}
        height={height}
        style={{ aspectRatio: `${width} / ${height}` }}
      />
      <figcaption className={s.figcaption}>{caption}</figcaption>
    </figure>
  );
}

function Note({ s, children }: { s: S; children: ReactNode }) {
  return <div className={s.note}>{children}</div>;
}

export function buildLessons(s: S): DocsLesson[] {
  return [
    {
      id: "setup",
      title: "Setup",
      nav: "Setup",
      intro: (
        <p className={s.lead}>
          Two ways to run openFoundry, one workspace. Install the macOS app or start the web
          server, claim the install, then sign in.
        </p>
      ),
      sections: [
        {
          id: "need",
          title: "What you need",
          body: (
            <>
              <ul className={s.list}>
                <li>macOS 13.5 or later on Apple silicon, or 64-bit Windows 10 or 11, for the desktop app.</li>
                <li>Node.js 20.9 or later for the web workspace.</li>
                <li>No account, no cloud subscription and no usage bill.</li>
              </ul>
              <p className={s.p}>
                Both routes open the same workspace. The desktop app adds a native window and a
                bundled Node runtime. The web route runs the same server in your own terminal.
              </p>
            </>
          ),
        },
        {
          id: "macos",
          title: "macOS desktop",
          body: (
            <>
              <ol className={s.list}>
                <li>
                  Download the current DMG from the{" "}
                  <a className={s.link} href={REPO_FILES.releases}>
                    releases page
                  </a>
                  .
                </li>
                <li>Open the DMG and drag openFoundry to Applications.</li>
                <li>
                  The build is ad-hoc signed and not notarized. The first time, right-click the
                  app and choose <strong>Open</strong>, then confirm. On macOS 15 and later, use
                  System Settings, Privacy and Security, Open Anyway.
                </li>
                <li>
                  The welcome step lists the terms. Accept them and continue. The profile step
                  asks for a display name, initials and an email.
                </li>
                <li>
                  The provider step lists Foundry Local, Ollama, LM Studio and llama.cpp. If none
                  is installed, install llama.cpp from the wizard: it downloads the matching
                  server build and a small Qwen2.5 0.5B starter model, then starts it.
                </li>
              </ol>
              <Note s={s}>
                The desktop shell holds a machine credential in the app data folder and signs the
                local user in. You can issue an access code for another browser later, on the
                Access control page.
              </Note>
              <Figure
                s={s}
                src="../assets/screens/docs-setup-wizard.webp"
                width={1180}
                height={790}
                alt="The first run wizard with the welcome step, terms and the five step rail."
                caption="The first run wizard: terms, profile, providers, model, ready."
              />
              <Figure
                s={s}
                src="../assets/screens/docs-setup-profile.webp"
                width={1180}
                height={790}
                alt="The profile step with display name, initials and email fields."
                caption="The profile step. The web build also asks for the setup token here."
              />
            </>
          ),
        },
        {
          id: "web",
          title: "Web workspace",
          body: (
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
                screen. Enter the token with your name and email. The app creates the owner and
                shows an access code once.
              </p>
              <Note s={s}>
                The first browser to reach an unclaimed install cannot become the owner without
                the token printed by the server. That is what stops a takeover when the port is
                exposed.
              </Note>
              <p className={s.p}>
                Open <span className={s.code}>http://localhost:3000</span>. If the token expired,
                restart the server. It prints a fresh one while the install has no owner.
              </p>
            </>
          ),
        },
        {
          id: "windows",
          title: "Windows",
          body: (
            <>
              <p className={s.p}>
                A Windows x64 beta ships with the macOS beta. Download
                <span className={s.code}> openFoundry_0.4.3_x64-setup.exe</span> from the{" "}
                <a className={s.link} href={REPO_FILES.releases}>
                  releases page
                </a>
                . The installer adds a Start menu shortcut, installs the Microsoft WebView2
                runtime when missing, and puts <span className={s.code}>openFoundry</span> on the
                machine PATH.
              </p>
              <p className={s.p}>
                The build is unsigned, so SmartScreen shows a warning the first time: choose
                <strong> More info</strong>, then <strong>Run anyway</strong>. The portable ZIP
                works without installing; keep the whole folder together.
              </p>
              <p className={s.p}>
                The web workspace also runs on Windows with Node.js 20.9 or later, using the same
                commands as above.
              </p>
            </>
          ),
        },
        {
          id: "after",
          title: "After setup",
          body: (
            <>
              <p className={s.p}>
                Sign in at <span className={s.code}>/signin</span> with your access code. On a web
                install the code is the only credential. Lose it and run this from the project
                folder:
              </p>
              <pre className={s.pre}>
                <code>npm run access-code</code>
              </pre>
              <p className={s.p}>
                A desktop install ships the same tool as a command. In Terminal on macOS or
                PowerShell on Windows:
              </p>
              <pre className={s.pre}>
                <code>{`openFoundry access-code
openFoundry access-code list
openFoundry access-code revoke`}</code>
              </pre>
              <p className={s.p}>
                It prints a new code for the owner and revokes the old one. It needs the same
                filesystem access the server already has, so it is not a remote reset.
              </p>
            </>
          ),
        },
      ],
    },
    {
      id: "authentication",
      title: "Authentication",
      nav: "Authentication",
      intro: (
        <p className={s.lead}>
          A local directory with real enforcement. Every request is checked against the
          permissions of the signed-in person before a handler runs.
        </p>
      ),
      sections: [
        {
          id: "how",
          title: "How sign-in works",
          body: (
            <>
              <p className={s.p}>
                openFoundry has no passwords and no identity provider. A person signs in with an
                access code: 16 characters in four groups, for example{" "}
                <span className={s.code}>7Q4M-XR2A-K9WP-3FJH</span>.
              </p>
              <ul className={s.list}>
                <li>The code is stored as a salted hash. Nobody can recover it, only replace it.</li>
                <li>
                  A correct code creates a session cookie. The session is what every page and
                  every API call is checked against.
                </li>
                <li>
                  The desktop app does not use a code. It signs itself in with a machine
                  credential stored in the app data folder.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "signin",
          title: "Sign in",
          body: (
            <>
              <p className={s.p}>
                Open the app. If there is no session, it sends you to the sign-in screen. Paste
                the code and continue.
              </p>
              <Figure
                s={s}
                src="../assets/screens/docs-signin.webp"
                width={860}
                height={640}
                alt="The sign-in screen with one access code field and a continue button."
                caption="One field. Codes are not case sensitive and the dashes are optional."
              />
            </>
          ),
        },
        {
          id: "roles",
          title: "People and roles",
          body: (
            <>
              <p className={s.p}>
                Four built-in roles. Each one is a list of permissions, and every screen that
                mentions a role reads it from that list.
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
                      Create and manage models, agents, knowledge, tools and connections. Cannot
                      change access or project identity.
                    </td>
                  </tr>
                  <tr>
                    <td className={s.td}>
                      <strong>Foundry User</strong>
                    </td>
                    <td className={s.td}>
                      Read the project and run models and agents. Cannot create or change
                      anything.
                    </td>
                  </tr>
                  <tr>
                    <td className={s.td}>
                      <strong>Reader</strong>
                    </td>
                    <td className={s.td}>
                      View the project and its resources. Cannot run models.
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className={s.p}>
                The permission line on the project page is computed from the actions the
                signed-in person actually has. It shows <strong>Full access</strong> only when
                the action set is everything.
              </p>
              <Figure
                s={s}
                src="../assets/screens/docs-users.webp"
                alt="The Users page with name, access type, role and scope columns."
                caption="The Users page: four columns, no row actions, and a computed My permission line."
              />
            </>
          ),
        },
        {
          id: "invite",
          title: "Invite someone",
          body: (
            <>
              <ol className={s.list}>
                <li>
                  Open <strong>Manage, Project details, Users</strong> and choose{" "}
                  <strong>Add user</strong>.
                </li>
                <li>
                  Type a name or email in <strong>Add people</strong>. An unknown email offers an
                  invite.
                </li>
                <li>
                  The invite creates the person with the Reader and Foundry User roles and issues
                  one access code.
                </li>
                <li>Copy the code and send it to the person. It is shown once.</li>
              </ol>
              <Figure
                s={s}
                src="../assets/screens/docs-access-code.webp"
                width={920}
                height={700}
                alt="The Add user success state with the new person and a one-time access code."
                caption="The code is shown once. The person can change nothing until a role is assigned."
              />
            </>
          ),
        },
        {
          id: "assign",
          title: "Assign a role the Foundry way",
          body: (
            <>
              <p className={s.p}>
                Role assignment is not a field in the Add user dialog. Foundry hands it to the
                Azure portal. openFoundry renders the same flow at{" "}
                <strong>Access control (IAM)</strong>.
              </p>
              <ol className={s.list}>
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
                src="../assets/screens/docs-role-wizard.webp"
                alt="The Add role assignment role step with Owner, Contributor, Foundry User and Reader."
                caption="Step 1. Conditions stays disabled because this build has no conditions."
              />
              <Figure
                s={s}
                src="../assets/screens/docs-members.webp"
                alt="The Select members pane with search and a selected person."
                caption="The members pane. Chosen people move to the right and can be removed there."
              />
              <Figure
                s={s}
                src="../assets/screens/docs-access-control.webp"
                alt="The Access control page with assignments grouped by role."
                caption="Assignments group by role, and the Scope column shows direct versus inherited."
              />
            </>
          ),
        },
        {
          id: "revoke",
          title: "Revoke access and read the log",
          body: (
            <>
              <p className={s.p}>
                Open the <strong>Access codes</strong> tab on the access control page. Revoking a
                code also ends every session that person has, so the next request sends them to
                the sign-in screen.
              </p>
              <p className={s.p}>
                Every sign-in, denial and assignment change is appended to{" "}
                <span className={s.code}>data/audit.jsonl</span>:
              </p>
              <pre className={s.pre}>
                <code>tail -5 data/audit.jsonl</code>
              </pre>
            </>
          ),
        },
      ],
    },
    {
      id: "agent-builder",
      title: "Agent builder",
      nav: "Agent builder",
      intro: (
        <p className={s.lead}>
          A prompt agent is a model, an instruction and the resources you attach to it. Build it,
          test it and publish it without leaving the workspace.
        </p>
      ),
      sections: [
        {
          id: "deploy",
          title: "Deploy a model first",
          body: (
            <>
              <p className={s.p}>
                An agent needs a deployment to answer with. Open{" "}
                <strong>Build, Models, Deployments</strong> and choose <strong>Deploy</strong>.
              </p>
              <Figure
                s={s}
                src="../assets/screens/docs-deployments.webp"
                alt="The deployments table with a running deployment and its endpoint."
                caption="A running deployment. Standard, Developer, Provisioned and Batch behave differently."
              />
              <p className={s.p}>
                Every deployment gets its own OpenAI-compatible endpoint and key. The agent
                builder can point at any of them.
              </p>
            </>
          ),
        },
        {
          id: "create",
          title: "Create the agent",
          body: (
            <>
              <ol className={s.list}>
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
                src="../assets/screens/docs-agent-builder.webp"
                alt="The agent builder with model, instructions, tools, knowledge, memory and guardrail on the left, and the chat panel on the right."
                caption="The builder: instructions, tools, knowledge, memory and guardrail on one screen."
              />
            </>
          ),
        },
        {
          id: "test",
          title: "Test it in the playground",
          body: (
            <>
              <p className={s.p}>
                The right half of the builder is a live playground. Send a message and the agent
                answers with the model, tools and knowledge you attached.
              </p>
              <p className={s.p}>
                Open the <strong>Traces</strong> tab to see each turn, the model call and any tool
                the agent used. Nothing leaves the machine unless a tool or model endpoint points
                somewhere remote.
              </p>
            </>
          ),
        },
        {
          id: "publish",
          title: "Publish the endpoint",
          body: (
            <>
              <p className={s.p}>
                Choose <strong>Publish</strong> to make the agent callable. The published agent
                has its own key and an OpenAI-compatible chat route, so the same SDK code works
                against it.
              </p>
              <Note s={s}>
                The builder screens match Foundry and the playground is real. Treat this lesson
                as a guided tour of the UI while the remaining runtime paths are verified.
              </Note>
            </>
          ),
        },
      ],
    },
    {
      id: "workflows",
      title: "Workflows",
      nav: "Workflows",
      intro: (
        <p className={s.lead}>
          Workflows run real local agents and real branching. This lesson walks a template from
          the canvas to a completed run.
        </p>
      ),
      sections: [
        {
          id: "what",
          title: "What a workflow is",
          body: (
            <>
              <p className={s.p}>
                A workflow is a graph of nodes and edges. Each node does one thing: run an agent,
                set a variable, branch, ask a person, send a message or go to another node. Edges
                decide what runs next.
              </p>
              <p className={s.p}>
                Variables are addressed with a scope.{" "}
                <span className={s.code}>System.LastMessage.Text</span> is the input the run
                started with. <span className={s.code}>Local.LatestMessage</span> is a variable
                the workflow sets.
              </p>
            </>
          ),
        },
        {
          id: "create",
          title: "Create one from a template",
          body: (
            <>
              <ol className={s.list}>
                <li>
                  Open <strong>Build, Agents, Workflows</strong> and choose{" "}
                  <strong>Create workflow</strong>.
                </li>
                <li>
                  Pick a template: blank, sequential, human in the loop, or group chat. The
                  template creates real nodes you can edit.
                </li>
                <li>
                  Drag nodes, connect handles, and open a node to edit its settings. The YAML and
                  Code tabs show the same definition.
                </li>
              </ol>
              <Figure
                s={s}
                src="../assets/screens/docs-workflow-builder.webp"
                alt="The workflow canvas with start, set variable, ask a question, if else, messages and end nodes."
                caption="The human in the loop template. Branch edges are labelled If and Else."
              />
            </>
          ),
        },
        {
          id: "nodes",
          title: "The node types",
          body: (
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
          ),
        },
        {
          id: "run",
          title: "Run it and answer the question",
          body: (
            <>
              <ol className={s.list}>
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
                  The if / else node compares the two values, sends the confirmation message and
                  ends the run.
                </li>
              </ol>
              <Figure
                s={s}
                src="../assets/screens/docs-workflow-run.webp"
                alt="A completed workflow run with the transcript and six node activities."
                caption="A completed run. The transcript keeps both answers and the workflow message."
              />
            </>
          ),
        },
        {
          id: "inspect",
          title: "Inspect the run",
          body: (
            <>
              <p className={s.p}>
                Every node reports its status on the canvas while the run moves. Open{" "}
                <strong>Node activity</strong> in the preview panel to see the order and the
                values.
              </p>
              <ul className={s.list}>
                <li>
                  <strong>Traces</strong> keeps a record of the run, including agent calls.
                </li>
                <li>
                  <strong>Monitor</strong> lists runs and their status.
                </li>
                <li>
                  <strong>YAML</strong> and <strong>Code</strong> show the definition you can copy
                  or import.
                </li>
              </ul>
            </>
          ),
        },
      ],
    },
  ];
}
