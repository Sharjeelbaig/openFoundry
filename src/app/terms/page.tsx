// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

export const metadata = { title: "Terms — openFoundry" };

export default function TermsPage() {
  return (
    <div className="page docs-content" style={{ maxWidth: 860, margin: "0 auto" }}>
      <h1>Terms of use</h1>
      <p className="docs-lead">Last updated: 4 November 2026</p>
      <h2>1. What openFoundry is</h2>
      <p>
        openFoundry is free, open-source software for running AI models on your own
        computer. It is an independent project and is not affiliated with, endorsed by,
        or sponsored by any model provider or platform vendor.
      </p>
      <h2>2. Your responsibility</h2>
      <p>
        You are responsible for the models you use, the licenses attached to them, the
        data you process and any remote provider you configure. Do not use openFoundry
        to violate applicable law or the rights of others.
      </p>
      <h2>3. No warranty</h2>
      <p>
        The software is provided “as is”, without warranty of any kind. The authors are
        not liable for data loss, model output, provider charges or any other damages
        arising from use of the software.
      </p>
      <h2>4. Privacy</h2>
      <p>
        openFoundry has no telemetry. Workspace data is stored on your computer. If you
        connect a remote provider, that provider&apos;s terms and privacy policy apply.
      </p>
      <h2>5. Contact</h2>
      <p>
        Questions about these terms:{" "}
        <a href="mailto:eng.sharjeel.baig@gmail.com">eng.sharjeel.baig@gmail.com</a>.
      </p>
      <h2>6. Model names and marks</h2>
      <p>
        Model and provider names are used only to identify model provenance. All
        trademarks belong to their respective owners. openFoundry does not claim
        ownership of third-party marks and does not use them as its own branding.
      </p>
    </div>
  );
}
