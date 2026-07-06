// App shell: header + filter bar + routed content. Teams is a placeholder until
// its phase lands (see UI-PLAN.md).
import { Routes, Route } from "react-router-dom";
import { Header } from "./components/Header.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { Overview } from "./pages/Overview.tsx";
import { People } from "./pages/People.tsx";
import { PersonDetail } from "./pages/PersonDetail.tsx";
import { Models } from "./pages/Models.tsx";
import { ModelDetail } from "./pages/ModelDetail.tsx";
import { ToolDetail } from "./pages/ToolDetail.tsx";
import { AgentDetail } from "./pages/AgentDetail.tsx";
import { Teams } from "./pages/Teams.tsx";
import { TeamDetail } from "./pages/TeamDetail.tsx";
import { Capabilities } from "./pages/Capabilities.tsx";
import { PluginDetail } from "./pages/PluginDetail.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";

export function App() {
  return (
    <>
      <Header />
      <FilterBar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/people" element={<People />} />
          <Route path="/people/:hash" element={<PersonDetail />} />
          <Route path="/models" element={<Models />} />
          <Route path="/models/:model" element={<ModelDetail />} />
          <Route path="/tools/:tool" element={<ToolDetail />} />
          <Route path="/agents/:agentType" element={<AgentDetail />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:team" element={<TeamDetail />} />
          <Route path="/capabilities" element={<Capabilities />} />
          <Route path="/capabilities/plugins/:name" element={<PluginDetail />} />
          <Route path="*" element={<Placeholder title="Not found" phase={0} />} />
        </Routes>
      </main>
    </>
  );
}
