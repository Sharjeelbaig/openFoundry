// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import AgentsHeader from "@/components/agents/AgentsHeader";
import RoutinesList from "@/components/routines/RoutinesList";

export const metadata = {
  title: "Routines · Agents · openFoundry",
};

export default function RoutinesPage() {
  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <AgentsHeader />
      <RoutinesList />
    </div>
  );
}
