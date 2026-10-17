import { Component, type ReactNode } from "react";
import { AdminButton, Panel, T } from "./ui";
export class AdminSectionBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; attempt: number }
> {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("[admin workspace]", error);
  }
  render() {
    return this.state.failed ? (
      <Panel title="This workspace could not open">
        <p role="alert" style={{ color: T.critical }}>
          Your other admin tools are still available. Retry this workspace or
          choose another section.
        </p>
        <AdminButton
          onClick={() =>
            this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))
          }
        >
          Retry workspace
        </AdminButton>
      </Panel>
    ) : (
      <div key={this.state.attempt} className="admin-section-content">
        {this.props.children}
      </div>
    );
  }
}
