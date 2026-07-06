// App shell: header + filter bar + routed content. Teams is a placeholder until
// its phase lands (see UI-PLAN.md).
import { Routes, Route } from "react-router-dom";
import { Header } from "./components/Header.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { Overview } from "./pages/Overview.tsx";
import { People } from "./pages/People.tsx";
import { Models } from "./pages/Models.tsx";
import { ModelDetail } from "./pages/ModelDetail.tsx";
import { ToolDetail } from "./pages/ToolDetail.tsx";
import { AgentDetail } from "./pages/AgentDetail.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";

export function App() {
  return (
    <>
      <Header />
      <FilterBar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/models" element={<Models />} />
          <Route path="/models/:model" element={<ModelDetail />} />
          <Route path="/tools/:tool" element={<ToolDetail />} />
          <Route path="/agents/:agentType" element={<AgentDetail />} />
          <Route path="*" element={<Placeholder title="Not found" phase={0} />} />
        </Routes>
      </main>
    </>
  );
}
