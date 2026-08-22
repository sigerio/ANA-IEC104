import { ConnectionBar } from "./components/ConnectionBar";
import { ControlPanel } from "./components/ControlPanel";
import { Logs } from "./components/Logs";
import { TelemetryTable } from "./components/TelemetryTable";
import { useLink } from "./hooks";

export default function App() {
  const link = useLink();
  return (
    <main>
      <ConnectionBar link={link} />
      <div className="notice">
        {link.notice}
        <span>
          N(S) {link.status.ns} · N(R) {link.status.nr}
        </span>
      </div>
      <section className="dashboard">
        <TelemetryTable link={link} />
        <ControlPanel link={link} />
      </section>
      <Logs link={link} />
    </main>
  );
}
