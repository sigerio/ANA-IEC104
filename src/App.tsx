import { useRef, useState } from "react";
import { ConnectionBar } from "./components/ConnectionBar";
import { ControlPanel } from "./components/ControlPanel";
import { Logs } from "./components/Logs";
import { Splitter } from "./components/Splitter";
import { TelemetryTable } from "./components/TelemetryTable";
import { useLink } from "./hooks";

export default function App() {
  const link = useLink();
  const workspace = useRef<HTMLDivElement>(null);
  const dashboard = useRef<HTMLElement>(null);
  const [rowSplit, setRowSplit] = useState(62);
  const [dashboardSplit, setDashboardSplit] = useState(64);
  return (
    <main>
      <ConnectionBar link={link} />
      <div className="notice">
        {link.notice}
        <span>
          N(S) {link.status.ns} · N(R) {link.status.nr}
        </span>
      </div>
      <div
        className="workspace"
        ref={workspace}
        style={{ gridTemplateRows: `minmax(0, ${rowSplit}fr) 8px minmax(0, ${100 - rowSplit}fr)` }}
      >
        <section
          className="dashboard"
          ref={dashboard}
          style={{ gridTemplateColumns: `minmax(0, ${dashboardSplit}fr) 8px minmax(330px, ${100 - dashboardSplit}fr)` }}
        >
          <TelemetryTable link={link} />
          <Splitter
            container={dashboard}
            orientation="vertical"
            value={dashboardSplit}
            min={30}
            max={67}
            initial={64}
            label="调整监控与控制区域宽度"
            onChange={setDashboardSplit}
          />
          <ControlPanel link={link} />
        </section>
        <Splitter
          container={workspace}
          orientation="horizontal"
          value={rowSplit}
          min={25}
          max={75}
          initial={62}
          label="调整监控与日志区域高度"
          onChange={setRowSplit}
        />
        <Logs link={link} />
      </div>
    </main>
  );
}
