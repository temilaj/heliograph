// App shell: header + filter bar + routed content. Non-Overview pages are
// placeholders until their phase lands (see UI-PLAN.md).
import { Routes, Route } from "react-router-dom";
import { Header } from "./components/Header.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { Overview } from "./pages/Overview.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";

export function App() {
  return (
    <>
      <Header />
      <FilterBar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/people" element={<Placeholder title="People" phase={4} />} />
          <Route path="/people/:hash" element={<Placeholder title="Person detail" phase={4} />} />
          <Route path="/models" element={<Placeholder title="Models & Tools" phase={5} />} />
          <Route path="/models/:model" element={<Placeholder title="Model detail" phase={5} />} />
          <Route path="/tools/:tool" element={<Placeholder title="Tool detail" phase={5} />} />
          <Route path="/agents/:agentType" element={<Placeholder title="Agent detail" phase={5} />} />
          <Route path="/teams" element={<Placeholder title="Teams" phase={6} />} />
          <Route path="/teams/:team" element={<Placeholder title="Team detail" phase={6} />} />
          <Route path="*" element={<Placeholder title="Not found" phase={0} />} />
        </Routes>
      </main>
    </>
  );
}
